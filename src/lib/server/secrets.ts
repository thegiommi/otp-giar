import {
	DEFAULT_TTL_SECONDS,
	DEFAULT_VIEWS,
	MAX_FAILED_ATTEMPTS,
	MAX_SECRET_BYTES,
	MAX_TTL_SECONDS,
	MAX_VIEWS,
	MIN_TTL_SECONDS,
	MIN_VIEWS
} from '$lib/config';
import {
	decryptSecret,
	deriveAuthToken,
	encryptSecret,
	fromBase64Url,
	IV_BYTES,
	KEY_BYTES,
	PROTOCOL_VERSION,
	SALT_BYTES,
	type EncryptedPayload,
	type KdfParams
} from '$lib/crypto';
import { db, transaction } from './db';
import { ApiError } from './http';
import { matchesHash, newSecretId, newToken, SECRET_ID_PATTERN, sha256Hex } from './tokens';

const GCM_TAG_BYTES = 16;
const MIN_ITERATIONS = 100_000;
const MAX_ITERATIONS = 10_000_000;
const MAX_PASSWORD_LENGTH = 1024;

interface SecretRow {
	id: string;
	version: number;
	ciphertext: string;
	iv: string;
	salt: string;
	kdf_iterations: number | null;
	auth_hash: string;
	delete_hash: string;
	max_views: number;
	views_remaining: number;
	failed_attempts: number;
	created_at: number;
	expires_at: number;
}

export interface SecretInfo {
	id: string;
	createdAt: string;
	expiresAt: string;
	maxViews: number;
	viewsRemaining: number;
	passwordRequired: boolean;
	salt: string;
	kdf: KdfParams | null;
}

const iso = (ms: number) => new Date(ms).toISOString();
const kdfOf = (row: SecretRow): KdfParams | null =>
	row.kdf_iterations ? { name: 'pbkdf2-sha256', iterations: row.kdf_iterations } : null;

function toInfo(row: SecretRow): SecretInfo {
	return {
		id: row.id,
		createdAt: iso(row.created_at),
		expiresAt: iso(row.expires_at),
		maxViews: row.max_views,
		viewsRemaining: row.views_remaining,
		passwordRequired: row.kdf_iterations !== null,
		salt: row.salt,
		kdf: kdfOf(row)
	};
}

const notFound = () =>
	new ApiError(404, 'not_found', 'This secret does not exist, has expired or has already been opened');

// ---------------------------------------------------------------- validation

function bad(field: string, message: string): never {
	throw new ApiError(400, 'invalid_request', `${field}: ${message}`, { field });
}

function base64Field(body: Record<string, unknown>, field: string, bytes?: { min: number; max: number }) {
	const value = body[field];
	if (typeof value !== 'string' || value.length === 0) bad(field, 'required base64url string');
	let decoded: Uint8Array;
	try {
		decoded = fromBase64Url(value);
	} catch {
		bad(field, 'must be base64url without padding');
	}
	if (bytes && (decoded.length < bytes.min || decoded.length > bytes.max)) {
		bad(field, bytes.min === bytes.max ? `must decode to ${bytes.min} bytes` : 'has an invalid length');
	}
	return value;
}

function intField(body: Record<string, unknown>, field: string, min: number, max: number, fallback: number) {
	const value = body[field] ?? fallback;
	if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
		bad(field, `must be an integer between ${min} and ${max}`);
	}
	return value;
}

function kdfField(body: Record<string, unknown>): KdfParams | null {
	const kdf = body.kdf;
	if (kdf === null || kdf === undefined) return null;
	if (typeof kdf !== 'object') bad('kdf', 'must be null or an object');
	const { name, iterations } = kdf as Record<string, unknown>;
	if (name !== 'pbkdf2-sha256') bad('kdf.name', 'must be "pbkdf2-sha256"');
	if (typeof iterations !== 'number' || !Number.isInteger(iterations) || iterations < MIN_ITERATIONS || iterations > MAX_ITERATIONS) {
		bad('kdf.iterations', `must be an integer between ${MIN_ITERATIONS} and ${MAX_ITERATIONS}`);
	}
	return { name, iterations };
}

function passwordField(body: Record<string, unknown>): string | undefined {
	const pw = body.password;
	if (pw === undefined || pw === null || pw === '') return undefined;
	if (typeof pw !== 'string' || pw.length > MAX_PASSWORD_LENGTH) bad('password', 'must be a string (max 1024 chars)');
	return pw;
}

// ---------------------------------------------------------------- operations

export interface CreateResult {
	id: string;
	url: string;
	expiresAt: string;
	maxViews: number;
	deleteToken: string;
	/** Only in server-side encryption mode. */
	key?: string;
	link?: string;
}

/**
 * Stores a secret. Two modes:
 *  - end-to-end: body carries the output of `encryptSecret()` (web UI, SDKs)
 *  - convenience: body carries `secret` in plain text; the server encrypts it
 *    in memory, stores only the ciphertext and returns the key once.
 */
export async function createSecret(body: Record<string, unknown>, origin: string): Promise<CreateResult> {
	const expiresIn = intField(body, 'expiresIn', MIN_TTL_SECONDS, MAX_TTL_SECONDS, DEFAULT_TTL_SECONDS);
	const maxViews = intField(body, 'maxViews', MIN_VIEWS, MAX_VIEWS, DEFAULT_VIEWS);

	let payload: EncryptedPayload;
	let key: string | undefined;

	if (body.secret !== undefined) {
		if (typeof body.secret !== 'string' || body.secret.length === 0) bad('secret', 'must be a non-empty string');
		if (Buffer.byteLength(body.secret, 'utf8') > MAX_SECRET_BYTES) {
			throw new ApiError(413, 'secret_too_large', `Secrets are limited to ${MAX_SECRET_BYTES / 1024} KiB`);
		}
		({ key, payload } = await encryptSecret(body.secret, { password: passwordField(body) }));
	} else {
		if (body.version !== PROTOCOL_VERSION) bad('version', `must be ${PROTOCOL_VERSION}`);
		const ciphertext = base64Field(body, 'ciphertext', { min: GCM_TAG_BYTES + 1, max: MAX_SECRET_BYTES + GCM_TAG_BYTES });
		payload = {
			version: PROTOCOL_VERSION,
			ciphertext,
			iv: base64Field(body, 'iv', { min: IV_BYTES, max: IV_BYTES }),
			salt: base64Field(body, 'salt', { min: SALT_BYTES, max: SALT_BYTES }),
			kdf: kdfField(body),
			authToken: base64Field(body, 'authToken', { min: 32, max: 32 })
		};
	}

	const id = newSecretId();
	const deleteToken = newToken();
	const now = Date.now();
	const expiresAt = now + expiresIn * 1000;

	db()
		.prepare(
			`INSERT INTO secrets (id, version, ciphertext, iv, salt, kdf_iterations, auth_hash, delete_hash,
			                      max_views, views_remaining, created_at, expires_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
		)
		.run(
			id,
			payload.version,
			payload.ciphertext,
			payload.iv,
			payload.salt,
			payload.kdf?.iterations ?? null,
			sha256Hex(payload.authToken),
			sha256Hex(deleteToken),
			maxViews,
			maxViews,
			now,
			expiresAt
		);

	const url = `${origin}/s/${id}`;
	const result: CreateResult = { id, url, expiresAt: iso(expiresAt), maxViews, deleteToken };
	if (key) Object.assign(result, { key, link: `${url}#${key}` });
	return result;
}

function findLive(id: string): SecretRow | null {
	if (!SECRET_ID_PATTERN.test(id)) return null;
	const row = db().prepare('SELECT * FROM secrets WHERE id = ?').get(id) as SecretRow | undefined;
	if (!row) return null;
	if (row.expires_at <= Date.now()) {
		db().prepare('DELETE FROM secrets WHERE id = ?').run(id);
		return null;
	}
	return row;
}

/** Metadata only; never consumes a view. */
export function getSecretInfo(id: string): SecretInfo | null {
	const row = findLive(id);
	return row ? toInfo(row) : null;
}

type ConsumeResult =
	| { ok: true; row: SecretRow; viewsRemaining: number }
	| { ok: false; attemptsRemaining: number };

function consume(id: string, authToken: string): Extract<ConsumeResult, { ok: true }> {
	const result = transaction((conn): ConsumeResult | null => {
		const row = findLive(id);
		if (!row) return null;

		if (!matchesHash(authToken, row.auth_hash)) {
			const failed = row.failed_attempts + 1;
			if (failed >= MAX_FAILED_ATTEMPTS) conn.prepare('DELETE FROM secrets WHERE id = ?').run(id);
			else conn.prepare('UPDATE secrets SET failed_attempts = ? WHERE id = ?').run(failed, id);
			return { ok: false, attemptsRemaining: MAX_FAILED_ATTEMPTS - failed };
		}

		const viewsRemaining = row.views_remaining - 1;
		if (viewsRemaining <= 0) conn.prepare('DELETE FROM secrets WHERE id = ?').run(id);
		else conn.prepare('UPDATE secrets SET views_remaining = ? WHERE id = ?').run(viewsRemaining, id);
		return { ok: true, row, viewsRemaining };
	});

	if (!result) throw notFound();
	if (!result.ok) {
		if (result.attemptsRemaining <= 0) {
			throw new ApiError(410, 'destroyed', 'Too many failed attempts. The secret has been destroyed.', {
				attemptsRemaining: 0
			});
		}
		throw new ApiError(401, 'invalid_credentials', 'Wrong password or incomplete link', {
			attemptsRemaining: result.attemptsRemaining
		});
	}
	return result;
}

/**
 * Opens a secret and consumes one view.
 *  - `{ authToken }` → returns the ciphertext (end-to-end, the caller decrypts)
 *  - `{ key, password? }` → the server derives the token, decrypts and returns plain text
 */
export async function revealSecret(id: string, body: Record<string, unknown>) {
	if (typeof body.authToken === 'string') {
		const authToken = base64Field(body, 'authToken', { min: 32, max: 32 });
		const { row, viewsRemaining } = consume(id, authToken);
		return {
			id,
			version: row.version,
			ciphertext: row.ciphertext,
			iv: row.iv,
			salt: row.salt,
			kdf: kdfOf(row),
			viewsRemaining,
			expiresAt: iso(row.expires_at)
		};
	}

	if (typeof body.key === 'string') {
		const key = base64Field(body, 'key', { min: KEY_BYTES, max: KEY_BYTES });
		const password = passwordField(body);
		const info = getSecretInfo(id);
		if (!info) throw notFound();
		if (info.passwordRequired && !password) {
			throw new ApiError(400, 'password_required', 'This secret is password protected');
		}
		const authToken = await deriveAuthToken(key, info, password);
		const { row, viewsRemaining } = consume(id, authToken);
		const secret = await decryptSecret({ ...row, kdf: kdfOf(row) }, key, password);
		return { id, secret, viewsRemaining, expiresAt: iso(row.expires_at) };
	}

	bad('authToken', 'send either "authToken" (end-to-end) or "key" (+ "password")');
}

export function burnSecret(id: string, deleteToken: string | null): void {
	if (!deleteToken) throw new ApiError(401, 'missing_delete_token', 'Send the delete token in the X-Delete-Token header');
	const row = findLive(id);
	if (!row) throw notFound();
	if (!matchesHash(deleteToken, row.delete_hash)) {
		throw new ApiError(403, 'invalid_delete_token', 'The delete token does not match');
	}
	db().prepare('DELETE FROM secrets WHERE id = ?').run(id);
}

export function purgeExpired(): number {
	const { changes } = db().prepare('DELETE FROM secrets WHERE expires_at <= ?').run(Date.now());
	return Number(changes);
}
