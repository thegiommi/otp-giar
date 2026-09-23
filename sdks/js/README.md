# @giar/otp

JavaScript/TypeScript SDK and CLI for giar otp: self-destructing, end-to-end encrypted secrets.
Works in Node.js ≥ 20, Deno, Bun and browsers. No dependencies.

```ts
import { OtpClient } from '@giar/otp';

const otp = new OtpClient({ baseUrl: 'https://otp.giar.digital', apiKey: process.env.OTP_API_KEY });

const { link, id, deleteToken } = await otp.create('DB_PASSWORD=hunter2', {
	expiresIn: 3600, // seconds, max 7 days
	maxViews: 1,
	password: 'optional'
});

const info = await otp.info(link); // does not consume a view
const { secret } = await otp.reveal(link, { password: 'optional' });
await otp.burn(id, deleteToken); // delete early
```

Errors are thrown as `OtpError` with `status`, `code` and `details` (e.g. `attemptsRemaining`).

## CLI

```sh
export OTP_BASE_URL=https://otp.giar.digital
printf '%s' "$DB_PASSWORD" | npx @giar/otp create --ttl 1h --views 1
npx @giar/otp reveal "https://otp.giar.digital/s/<id>#<key>"
```

Passwords are read from an environment variable (`--password-env NAME`), never from arguments.
