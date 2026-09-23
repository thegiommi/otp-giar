#!/usr/bin/env node
// Share and open secrets from shells and CI pipelines.
//   echo -n "$DB_PASSWORD" | otp-giar create --ttl 1h --views 1
//   otp-giar reveal "https://otp.giar.digital/s/<id>#<key>"
// Environment: OTP_BASE_URL (instance), OTP_API_KEY (optional).
import { parseArgs } from 'node:util';
import { OtpClient, OtpError } from './client.ts';
import { parseLink } from './crypto.ts';

const HELP = `Usage:
  otp-giar create [--ttl 1h] [--views 1] [--password-env NAME] [--url URL] [--json]   (secret via stdin)
  otp-giar reveal <link> [--password-env NAME]
  otp-giar burn <id> <deleteToken> [--url URL]

Environment: OTP_BASE_URL, OTP_API_KEY
Passwords are read from an environment variable so they never appear in process lists.`;

const UNITS: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };

function duration(value: string): number {
	const match = value.trim().match(/^(\d+)([smhd]?)$/);
	if (!match) fail(`invalid --ttl "${value}", use e.g. 90, 15m, 1h, 7d`);
	return Number(match[1]) * UNITS[match[2] || 's'];
}

function password(name: string | undefined): string | undefined {
	if (!name) return undefined;
	const value = process.env[name];
	if (value === undefined) fail(`environment variable ${name} is not set`);
	return value;
}

function fail(message: string): never {
	console.error(`error: ${message}`);
	process.exit(1);
}

async function readStdin(): Promise<string> {
	if (process.stdin.isTTY) fail('pipe the secret via stdin, e.g. echo -n "$TOKEN" | otp-giar create');
	const chunks: Buffer[] = [];
	for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
	return Buffer.concat(chunks).toString('utf8');
}

async function main() {
	const { values, positionals } = parseArgs({
		allowPositionals: true,
		options: {
			ttl: { type: 'string', default: '1d' },
			views: { type: 'string', default: '1' },
			'password-env': { type: 'string' },
			url: { type: 'string', default: process.env.OTP_BASE_URL },
			json: { type: 'boolean', default: false },
			help: { type: 'boolean', short: 'h', default: false }
		}
	});
	const [command, ...rest] = positionals;
	const apiKey = process.env.OTP_API_KEY;

	if (values.help || !command) {
		console.log(HELP);
		return;
	}

	if (command === 'create') {
		if (!values.url) fail('set --url or OTP_BASE_URL');
		const secret = await readStdin();
		const created = await new OtpClient({ baseUrl: values.url, apiKey }).create(secret, {
			expiresIn: duration(values.ttl!),
			maxViews: Number(values.views),
			password: password(values['password-env'])
		});
		console.log(
			values.json
				? JSON.stringify({ id: created.id, link: created.link, expiresAt: created.expiresAt, deleteToken: created.deleteToken })
				: created.link
		);
	} else if (command === 'reveal') {
		const link = rest[0] ?? fail('missing <link>');
		const { origin } = parseLink(link);
		const revealed = await new OtpClient({ baseUrl: origin, apiKey }).reveal(link, {
			password: password(values['password-env'])
		});
		process.stdout.write(revealed.secret + (process.stdout.isTTY ? '\n' : ''));
	} else if (command === 'burn') {
		if (!values.url) fail('set --url or OTP_BASE_URL');
		const [id, token] = rest;
		if (!id || !token) fail('usage: otp-giar burn <id> <deleteToken>');
		await new OtpClient({ baseUrl: values.url, apiKey }).burn(id, token);
	} else {
		fail(`unknown command "${command}"\n\n${HELP}`);
	}
}

main().catch((err) => {
	if (err instanceof OtpError) fail(`${err.message} (${err.code})`);
	fail(err instanceof Error ? err.message : String(err));
});
