// End-to-end test against a running instance:
//   OTP_BASE_URL=http://localhost:5173 node --test sdks/js/test/e2e.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OtpClient, OtpError } from '../src/index.ts';

const baseUrl = process.env.OTP_BASE_URL ?? 'http://localhost:5173';
const client = new OtpClient({ baseUrl });

test('create → info → reveal → gone', async () => {
	const text = 'DB_PASSWORD=s3cr3t ✓ ümlaut\nline 2';
	const created = await client.create(text, { expiresIn: 600, maxViews: 1 });
	assert.match(created.link, /\/s\/[A-Za-z0-9_-]{32}#[A-Za-z0-9_-]{43}$/);

	const info = await client.info(created.link);
	assert.equal(info.viewsRemaining, 1);
	assert.equal(info.passwordRequired, false);

	const revealed = await client.reveal(created.link);
	assert.equal(revealed.secret, text);
	assert.equal(revealed.viewsRemaining, 0);

	await assert.rejects(client.reveal(created.link), (e: OtpError) => e.status === 404);
});

test('password: wrong password is rejected without consuming a view', async () => {
	const created = await client.create('pw-protected', { maxViews: 1, password: 'correct horse' });
	await assert.rejects(client.reveal(created.link), (e: OtpError) => e.code === 'password_required');
	await assert.rejects(
		client.reveal(created.link, { password: 'wrong' }),
		(e: OtpError) => e.status === 401 && e.details.attemptsRemaining === 9
	);
	assert.equal((await client.info(created.id)).viewsRemaining, 1);
	assert.equal((await client.reveal(created.link, { password: 'correct horse' })).secret, 'pw-protected');
});

test('a link with a wrong key cannot open (or burn) the secret', async () => {
	const created = await client.create('guarded');
	const forged = created.link.replace(/#.*/, '#' + 'A'.repeat(43));
	await assert.rejects(client.reveal(forged), (e: OtpError) => e.status === 401);
	assert.equal((await client.reveal(created.link)).secret, 'guarded');
});

test('multiple views count down', async () => {
	const created = await client.create('thrice', { maxViews: 3 });
	assert.equal((await client.reveal(created.link)).viewsRemaining, 2);
	assert.equal((await client.reveal(created.link)).viewsRemaining, 1);
	assert.equal((await client.reveal(created.link)).viewsRemaining, 0);
	await assert.rejects(client.info(created.id), (e: OtpError) => e.status === 404);
});

test('burn with delete token', async () => {
	const created = await client.create('burn me');
	await assert.rejects(client.burn(created.id, 'x'.repeat(43)), (e: OtpError) => e.status === 403);
	await client.burn(created.id, created.deleteToken);
	await assert.rejects(client.info(created.id), (e: OtpError) => e.status === 404);
});

test('limits are enforced', async () => {
	await assert.rejects(client.create('x', { expiresIn: 8 * 24 * 3600 }), (e: OtpError) => e.status === 400);
	await assert.rejects(client.create('x', { maxViews: 0 }), (e: OtpError) => e.status === 400);
	await assert.rejects(client.info('not-a-real-id'), (e: OtpError) => e.status === 404);
});
