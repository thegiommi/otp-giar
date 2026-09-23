"""Command line: share and open secrets from shells and CI pipelines.

    echo -n "$DB_PASSWORD" | python -m otp_giar create --ttl 1h --views 1
    python -m otp_giar reveal "https://otp.giar.digital/s/<id>#<key>"

Environment: OTP_BASE_URL (instance), OTP_API_KEY (optional).
Passwords are read from an environment variable (--password-env NAME) so
they never show up in process lists or shell history.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys

from . import OtpClient, OtpError, parse_link

_UNITS = {"s": 1, "m": 60, "h": 3600, "d": 86400}


def _duration(value: str) -> int:
    match = re.fullmatch(r"(\d+)([smhd]?)", value.strip())
    if not match:
        raise argparse.ArgumentTypeError("use e.g. 90, 15m, 1h, 7d")
    return int(match.group(1)) * _UNITS[match.group(2) or "s"]


def _password(name: str | None) -> str | None:
    if not name:
        return None
    value = os.environ.get(name)
    if value is None:
        sys.exit(f"error: environment variable {name} is not set")
    return value


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="otp-giar", description="Self-destructing encrypted secrets.")
    sub = parser.add_subparsers(dest="command", required=True)

    create = sub.add_parser("create", help="encrypt stdin and print a share link")
    create.add_argument("--ttl", type=_duration, default=86400, help="lifetime, e.g. 15m, 1h, 7d (max 7d)")
    create.add_argument("--views", type=int, default=1, help="how often it can be opened (1-100)")
    create.add_argument("--password-env", metavar="NAME", help="read an extra password from this env variable")
    create.add_argument("--url", default=os.environ.get("OTP_BASE_URL"), help="instance URL (or OTP_BASE_URL)")
    create.add_argument("--json", action="store_true", help="print id, link, expiresAt and deleteToken as JSON")

    reveal = sub.add_parser("reveal", help="open a link and print the secret")
    reveal.add_argument("link")
    reveal.add_argument("--password-env", metavar="NAME")

    burn = sub.add_parser("burn", help="delete a secret before it is read")
    burn.add_argument("id")
    burn.add_argument("delete_token")
    burn.add_argument("--url", default=os.environ.get("OTP_BASE_URL"))

    args = parser.parse_args(argv)
    api_key = os.environ.get("OTP_API_KEY")

    try:
        if args.command == "create":
            if not args.url:
                parser.error("set --url or OTP_BASE_URL")
            if sys.stdin.isatty():
                parser.error("pipe the secret via stdin, e.g. echo -n \"$TOKEN\" | otp-giar create")
            secret = sys.stdin.read()
            created = OtpClient(args.url, api_key).create(
                secret, expires_in=args.ttl, max_views=args.views, password=_password(args.password_env)
            )
            if args.json:
                print(json.dumps({"id": created.id, "link": created.link, "expiresAt": created.expires_at,
                                  "deleteToken": created.delete_token}))
            else:
                print(created.link)
        elif args.command == "reveal":
            _, _, base = parse_link(args.link)
            revealed = OtpClient(base, api_key).reveal(args.link, password=_password(args.password_env))
            sys.stdout.write(revealed.secret)
            if sys.stdout.isatty():
                sys.stdout.write("\n")
        elif args.command == "burn":
            if not args.url:
                parser.error("set --url or OTP_BASE_URL")
            OtpClient(args.url, api_key).burn(args.id, args.delete_token)
    except OtpError as err:
        print(f"error: {err} ({err.code})", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
