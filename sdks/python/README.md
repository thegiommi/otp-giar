# otp-giar

Python SDK and CLI for [giar otp](https://github.com/thegiommi/otp-giar): share passwords, API keys and credentials through self-destructing, end-to-end encrypted links, from code and CI/CD pipelines.

- Encrypts locally with AES-256-GCM. Only ciphertext reaches the server; the key lives in the link fragment.
- Python ≥ 3.9, the only dependency is `cryptography`.
- Works with [otp.giar.digital](https://otp.giar.digital) or any self-hosted instance.

```sh
pip install otp-giar
```

## Usage

```python
import os
from otp_giar import OtpClient, OtpError

otp = OtpClient("https://otp.giar.digital", api_key=os.environ.get("OTP_API_KEY"))

# Encrypt locally and store. Share .link; keep .delete_token to burn it early.
created = otp.create("DB_PASSWORD=hunter2", expires_in=3600, max_views=1, password=None)
print(created.link)

info = otp.info(created.link)           # metadata, does not consume a view
revealed = otp.reveal(created.link)     # consumes one view
print(revealed.secret, revealed.views_remaining)

otp.burn(created.id, created.delete_token)
```

Errors are raised as `OtpError` with `status`, `code` (e.g. `not_found`, `invalid_credentials`, `rate_limited`) and `details`.

## CLI

The secret is read from stdin and the link printed to stdout. Passwords come from an environment variable, never from arguments.

```sh
export OTP_BASE_URL=https://otp.giar.digital   # and optionally OTP_API_KEY

printf '%s' "$DB_PASSWORD" | otp-giar create --ttl 1h --views 1
printf '%s' "$DB_PASSWORD" | otp-giar create --password-env SHARE_PW --json

otp-giar reveal "https://otp.giar.digital/s/<id>#<key>"
otp-giar burn <id> <delete_token>
```

`python -m otp_giar` works as well.

## License

MIT
