# Security policy

giar otp exists to keep secrets secret, so security reports get priority.

## Reporting a vulnerability

Please **do not open a public issue**. Use GitHub's private reporting instead:
**Security → Report a vulnerability** on this repository.

Include what you found, how to reproduce it and the impact you expect. You will get an answer within a few days, and a fix or mitigation plan once the issue is confirmed. With your permission we credit you in the release notes.

## Scope

In scope: the web app, the REST API, the encryption protocol and the SDKs/CLIs in this repository.

Known limitations, documented in the README, are not considered vulnerabilities on their own:

- A malicious server operator could serve modified JavaScript (true for every web-based E2E tool).
- In plain-text API mode the server sees the secret in memory while encrypting it.
- Rate limits are per process and in memory.
- Someone who knows only a secret's ID can destroy it with 10 failed attempts (fail closed), but cannot read it.
