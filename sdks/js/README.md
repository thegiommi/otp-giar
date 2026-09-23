# otp-giar

JavaScript/TypeScript SDK and CLI for [giar otp](https://github.com/thegiommi/otp-giar): share passwords, API keys and credentials through self-destructing, end-to-end encrypted links, from code and CI/CD pipelines.

- Encrypts locally with AES-256-GCM (WebCrypto). Only ciphertext reaches the server; the key lives in the link fragment.
- Zero dependencies. Node.js ≥ 20, Deno, Bun and browsers. Fully typed.
- Works with [otp.giar.digital](https://otp.giar.digital) or any self-hosted instance.

```sh
npm install otp-giar
```

## Usage

```ts
import { OtpClient } from 'otp-giar';

const otp = new OtpClient({
	baseUrl: 'https://otp.giar.digital',
	apiKey: process.env.OTP_API_KEY // optional, raises the rate limit
});

// Encrypt locally and store. Share `link`; keep `deleteToken` to burn it early.
const { link, id, deleteToken, expiresAt } = await otp.create('DB_PASSWORD=hunter2', {
	expiresIn: 3600, // seconds, 60 … 604800 (7 days)
	maxViews: 1, // 1 … 100
	password: 'optional' // recipient needs link + password
});

const info = await otp.info(link); // metadata, does not consume a view
const { secret, viewsRemaining } = await otp.reveal(link, { password: 'optional' });
await otp.burn(id, deleteToken);
```

Errors are thrown as `OtpError` with `status`, `code` (e.g. `not_found`, `invalid_credentials`, `rate_limited`) and `details` (e.g. `attemptsRemaining`, `retryAfter`).

Lower-level building blocks are exported too: `encryptSecret`, `decryptSecret`, `deriveAuthToken`, `parseLink`.

## CLI

The secret is read from stdin and the link printed to stdout, so it pipes nicely in CI jobs. Passwords come from an environment variable, never from arguments (which would show up in process lists and shell history).

```sh
export OTP_BASE_URL=https://otp.giar.digital   # and optionally OTP_API_KEY

printf '%s' "$DB_PASSWORD" | npx otp-giar create --ttl 1h --views 1
printf '%s' "$DB_PASSWORD" | npx otp-giar create --password-env SHARE_PW --json

npx otp-giar reveal "https://otp.giar.digital/s/<id>#<key>"
npx otp-giar burn <id> <deleteToken>
```

## License

MIT
