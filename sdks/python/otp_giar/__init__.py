"""giar otp – Python SDK.

Share self-destructing, end-to-end encrypted secrets. Secrets are encrypted
locally; only the ciphertext is sent to the server. The key is part of the
share link (after ``#``) and never leaves this process otherwise.

    from otp_giar import OtpClient

    client = OtpClient("https://otp.giar.digital")
    created = client.create("DB_PASSWORD=hunter2", expires_in=3600, max_views=1)
    print(created.link)

    revealed = client.reveal(created.link)
    print(revealed.secret)

Implements protocol v1, see sdks/js/src/crypto.ts for the specification.
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
import re
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any, Optional

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

__all__ = [
    "OtpClient",
    "OtpError",
    "CreatedSecret",
    "RevealedSecret",
    "encrypt_secret",
    "decrypt_secret",
    "derive_auth_token",
    "parse_link",
    "PROTOCOL_VERSION",
    "DEFAULT_PBKDF2_ITERATIONS",
]
__version__ = "1.0.0"

PROTOCOL_VERSION = 1
DEFAULT_PBKDF2_ITERATIONS = 600_000
KEY_BYTES, SALT_BYTES, IV_BYTES = 32, 16, 12

_INFO_ENC = b"otp-giar:v1:enc"
_INFO_AUTH = b"otp-giar:v1:auth"
_AAD = b"otp-giar:v1"
_B64 = re.compile(r"^[A-Za-z0-9_-]*$")


class OtpError(Exception):
    """Raised for API errors (``status`` > 0) and local validation errors (``status`` == 0)."""

    def __init__(self, message: str, status: int, code: str, details: Optional[dict] = None):
        super().__init__(message)
        self.status = status
        self.code = code
        self.details = details or {}


# --------------------------------------------------------------------- crypto


def _b64encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64decode(value: str, length: Optional[int] = None, name: str = "value") -> bytes:
    if not isinstance(value, str) or not _B64.match(value):
        raise OtpError(f"{name} is not valid base64url", 0, "invalid_encoding")
    data = base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))
    if length is not None and len(data) != length:
        raise OtpError(f"{name} must be {length} bytes", 0, "invalid_encoding")
    return data


def _derive(key: bytes, salt: bytes, password: Optional[str], kdf: Optional[dict]) -> tuple[bytes, bytes]:
    ikm = key
    if kdf:
        if not password:
            raise OtpError("This secret requires a password", 0, "password_required")
        stretched = hashlib.pbkdf2_hmac(
            "sha256", unicodedata.normalize("NFC", password).encode("utf-8"), salt, int(kdf["iterations"]), 32
        )
        ikm = key + stretched

    def hkdf(info: bytes) -> bytes:
        return HKDF(algorithm=hashes.SHA256(), length=32, salt=salt, info=info).derive(ikm)

    return hkdf(_INFO_ENC), hkdf(_INFO_AUTH)


def encrypt_secret(
    plaintext: str, password: Optional[str] = None, iterations: int = DEFAULT_PBKDF2_ITERATIONS
) -> tuple[str, dict]:
    """Returns ``(key, payload)``. Put ``key`` in the link fragment, POST ``payload``."""
    key, salt, iv = os.urandom(KEY_BYTES), os.urandom(SALT_BYTES), os.urandom(IV_BYTES)
    kdf = {"name": "pbkdf2-sha256", "iterations": iterations} if password else None
    enc_key, auth_token = _derive(key, salt, password, kdf)
    ciphertext = AESGCM(enc_key).encrypt(iv, plaintext.encode("utf-8"), _AAD)
    return _b64encode(key), {
        "version": PROTOCOL_VERSION,
        "ciphertext": _b64encode(ciphertext),
        "iv": _b64encode(iv),
        "salt": _b64encode(salt),
        "kdf": kdf,
        "authToken": _b64encode(auth_token),
    }


def derive_auth_token(key: str, salt: str, kdf: Optional[dict], password: Optional[str] = None) -> str:
    _, auth_token = _derive(
        _b64decode(key, KEY_BYTES, "key"), _b64decode(salt, SALT_BYTES, "salt"), password, kdf
    )
    return _b64encode(auth_token)


def decrypt_secret(sealed: dict, key: str, password: Optional[str] = None) -> str:
    enc_key, _ = _derive(
        _b64decode(key, KEY_BYTES, "key"), _b64decode(sealed["salt"], SALT_BYTES, "salt"), password, sealed.get("kdf")
    )
    try:
        plaintext = AESGCM(enc_key).decrypt(
            _b64decode(sealed["iv"], IV_BYTES, "iv"), _b64decode(sealed["ciphertext"], name="ciphertext"), _AAD
        )
    except InvalidTag:
        raise OtpError("Decryption failed: the link key or password is wrong", 0, "decryption_failed") from None
    return plaintext.decode("utf-8")


def parse_link(link: str) -> tuple[str, Optional[str], str]:
    """Splits ``https://host/s/<id>#<key>`` into ``(id, key, base_url)``."""
    url = urllib.parse.urlsplit(link)
    match = re.search(r"/s/([A-Za-z0-9_-]+)/?$", url.path)
    if not url.scheme or not match:
        raise OtpError("Not a secret link: expected a URL like https://host/s/<id>#<key>", 0, "invalid_link")
    base = f"{url.scheme}://{url.netloc}{url.path[: match.start()]}"
    return match.group(1), (url.fragment or None), base


# --------------------------------------------------------------------- client


@dataclass(frozen=True)
class CreatedSecret:
    id: str
    link: str
    key: str
    expires_at: str
    max_views: int
    delete_token: str


@dataclass(frozen=True)
class RevealedSecret:
    id: str
    secret: str
    views_remaining: int
    expires_at: str


class OtpClient:
    def __init__(self, base_url: str, api_key: Optional[str] = None, timeout: float = 30.0):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.timeout = timeout

    def create(
        self,
        secret: str,
        expires_in: int = 86_400,
        max_views: int = 1,
        password: Optional[str] = None,
    ) -> CreatedSecret:
        """Encrypts locally and stores the ciphertext. ``expires_in`` in seconds (60 … 604800)."""
        key, payload = encrypt_secret(secret, password=password)
        res = self._request(
            "POST", "/api/v1/secrets", {**payload, "expiresIn": expires_in, "maxViews": max_views}
        )
        return CreatedSecret(
            id=res["id"],
            link=f"{res['url']}#{key}",
            key=key,
            expires_at=res["expiresAt"],
            max_views=res["maxViews"],
            delete_token=res["deleteToken"],
        )

    def info(self, link_or_id: str) -> dict:
        """Metadata; does not consume a view."""
        secret_id = parse_link(link_or_id)[0] if "/" in link_or_id else link_or_id
        return self._request("GET", f"/api/v1/secrets/{urllib.parse.quote(secret_id)}")

    def reveal(self, link: str, password: Optional[str] = None) -> RevealedSecret:
        """Opens the secret (consumes one view) and decrypts it locally."""
        secret_id, key, _ = parse_link(link)
        if not key:
            raise OtpError("The link has no key (the part after #)", 0, "missing_key")
        meta = self.info(secret_id)
        if meta["passwordRequired"] and not password:
            raise OtpError("This secret is password protected", 0, "password_required")
        auth_token = derive_auth_token(key, meta["salt"], meta["kdf"], password)
        sealed = self._request(
            "POST", f"/api/v1/secrets/{urllib.parse.quote(secret_id)}/reveal", {"authToken": auth_token}
        )
        return RevealedSecret(
            id=secret_id,
            secret=decrypt_secret(sealed, key, password),
            views_remaining=sealed["viewsRemaining"],
            expires_at=sealed["expiresAt"],
        )

    def burn(self, secret_id: str, delete_token: str) -> None:
        """Deletes a secret before it is read."""
        self._request(
            "DELETE", f"/api/v1/secrets/{urllib.parse.quote(secret_id)}", headers={"X-Delete-Token": delete_token}
        )

    def _request(self, method: str, path: str, body: Any = None, headers: Optional[dict] = None) -> Any:
        req_headers = {"Accept": "application/json", "User-Agent": f"otp-giar-python/{__version__}"}
        if self.api_key:
            req_headers["Authorization"] = f"Bearer {self.api_key}"
        data = None
        if body is not None:
            data = json.dumps(body).encode("utf-8")
            req_headers["Content-Type"] = "application/json"
        req_headers.update(headers or {})
        request = urllib.request.Request(self.base_url + path, data=data, method=method, headers=req_headers)
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                raw = response.read()
                return json.loads(raw) if raw else None
        except urllib.error.HTTPError as exc:
            try:
                err = json.loads(exc.read()).get("error", {})
            except (ValueError, AttributeError):
                err = {}
            raise OtpError(
                err.get("message", f"Request failed with status {exc.code}"),
                exc.code,
                err.get("code", "http_error"),
                err,
            ) from None
