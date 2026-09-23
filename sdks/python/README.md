# giar-otp

Python SDK and CLI for giar otp: self-destructing, end-to-end encrypted secrets.
Python ≥ 3.9, depends only on `cryptography`.

```python
from otp_giar import OtpClient

otp = OtpClient("https://otp.giar.digital", api_key=None)

created = otp.create("DB_PASSWORD=hunter2", expires_in=3600, max_views=1, password=None)
print(created.link)

info = otp.info(created.link)          # does not consume a view
revealed = otp.reveal(created.link)    # consumes one view
print(revealed.secret)

otp.burn(created.id, created.delete_token)
```

Errors are raised as `OtpError` with `status`, `code` and `details`.

## CLI

```sh
export OTP_BASE_URL=https://otp.giar.digital
printf '%s' "$DB_PASSWORD" | otp-giar create --ttl 1h --views 1
otp-giar reveal "https://otp.giar.digital/s/<id>#<key>"
```
