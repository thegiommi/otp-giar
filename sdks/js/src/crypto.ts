/**
 * otp-giar encryption protocol, version 1.
 *
 * This file is the single source of truth for the format. It is used by the
 * web app (browser + server) and by the JavaScript SDK, and mirrored by the
 * Python SDK. It only depends on WebCrypto, so it runs in browsers,
 * Node.js >= 20, Deno and Bun.
 *
 *   key        32 random bytes. Lives only in the link fragment (#...),
 *              browsers never send the fragment to the server.
 *   salt       16 random bytes, stored with the secret.
 *   ikm        key                                   (without password)
 *              key || PBKDF2-SHA256(password, salt)  (with password)
 *   encKey     HKDF-SHA256(ikm, salt, "otp-giar:v1:enc")  -> AES-256-GCM
 *   authToken  HKDF-SHA256(ikm, salt, "otp-giar:v1:auth")
 *
 * The server stores SHA-256(authToken) and only hands out the ciphertext to
 * clients that present the matching authToken. Knowing the secret's ID alone
 * is therefore not enough to open (and thereby burn) it, and a wrong password
 * is rejected before a view is consumed.
 */

export const PROTOCOL_VERSION = 1;
export const KEY_BYTES = 32;
export const SALT_BYTES = 16;
export const IV_BYTES = 12;
export const DEFAULT_PBKDF2_ITERATIONS = 600_000;

const INFO_ENC = 'otp-giar:v1:enc';
const INFO_AUTH = 'otp-giar:v1:auth';
const AAD = 'otp-giar:v1';

export interface KdfParams {
	name: 'pbkdf2-sha256';
	iterations: number;
}

/** Everything the server needs to store a secret. Contains no key material. */
export interface EncryptedPayload {
	version: number;
	ciphertext: string;
	iv: string;
	salt: string;
	kdf: KdfParams | null;
	authToken: string;
}

/** What the server hands back when a secret is opened. */
export interface SealedSecret {
	ciphertext: string;
	iv: string;
	salt: string;
	kdf: KdfParams | null;
}

type Bytes = Uint8Array<ArrayBuffer>;

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

function subtle(): SubtleCrypto {
	const s = globalThis.crypto?.subtle;
	if (!s) throw new Error('WebCrypto is not available (a secure context / Node.js >= 20 is required)');
	return s;
}

function utf8(text: string): Bytes {
	const encoded = encoder.encode(text);
	const out = new Uint8Array(encoded.length);
	out.set(encoded);
	return out;
}

export function randomBytes(length: number): Bytes {
	return globalThis.crypto.getRandomValues(new Uint8Array(length));
}

export function toBase64Url(bytes: Uint8Array): string {
	let binary = '';
	for (let i = 0; i < bytes.length; i += 0x8000) {
		binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	}
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(value: string): Bytes {
	if (!/^[A-Za-z0-9_-]*$/.test(value)) throw new Error('Invalid base64url string');
	const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
	const binary = atob(padded);
	const out = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
	return out;
}

function decodeExact(value: string, length: number, name: string): Bytes {
	let bytes: Bytes;
	try {
		bytes = fromBase64Url(value);
	} catch {
		throw new Error(`${name} is not valid base64url`);
	}
	if (bytes.length !== length) throw new Error(`${name} must be ${length} bytes`);
	return bytes;
}

async function deriveKeys(
	key: Bytes,
	salt: Bytes,
	password: string | undefined,
	kdf: KdfParams | null
): Promise<{ encKey: CryptoKey; authToken: Bytes }> {
	let ikm: Bytes = key;
	if (kdf) {
		if (!password) throw new Error('This secret requires a password');
		const pwKey = await subtle().importKey('raw', utf8(password.normalize('NFC')), 'PBKDF2', false, [
			'deriveBits'
		]);
		const stretched = new Uint8Array(
			await subtle().deriveBits(
				{ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: kdf.iterations },
				pwKey,
				256
			)
		);
		ikm = new Uint8Array(key.length + stretched.length);
		ikm.set(key, 0);
		ikm.set(stretched, key.length);
	}

	const hkdfKey = await subtle().importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
	const hkdf = async (info: string) =>
		new Uint8Array(
			await subtle().deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info: utf8(info) }, hkdfKey, 256)
		);

	const [encBits, authToken] = await Promise.all([hkdf(INFO_ENC), hkdf(INFO_AUTH)]);
	const encKey = await subtle().importKey('raw', encBits, 'AES-GCM', false, ['encrypt', 'decrypt']);
	return { encKey, authToken };
}

export interface EncryptOptions {
	password?: string;
	iterations?: number;
}

/**
 * Encrypts a secret. Returns the link key (put it in the URL fragment, never
 * send it to the server) and the payload for `POST /api/v1/secrets`.
 */
export async function encryptSecret(
	plaintext: string,
	options: EncryptOptions = {}
): Promise<{ key: string; payload: EncryptedPayload }> {
	const key = randomBytes(KEY_BYTES);
	const salt = randomBytes(SALT_BYTES);
	const iv = randomBytes(IV_BYTES);
	const kdf: KdfParams | null = options.password
		? { name: 'pbkdf2-sha256', iterations: options.iterations ?? DEFAULT_PBKDF2_ITERATIONS }
		: null;

	const { encKey, authToken } = await deriveKeys(key, salt, options.password, kdf);
	const ciphertext = new Uint8Array(
		await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: utf8(AAD) }, encKey, utf8(plaintext))
	);

	return {
		key: toBase64Url(key),
		payload: {
			version: PROTOCOL_VERSION,
			ciphertext: toBase64Url(ciphertext),
			iv: toBase64Url(iv),
			salt: toBase64Url(salt),
			kdf,
			authToken: toBase64Url(authToken)
		}
	};
}

/** Derives the token that proves to the server that the caller holds the link (and password). */
export async function deriveAuthToken(
	key: string,
	params: { salt: string; kdf: KdfParams | null },
	password?: string
): Promise<string> {
	const { authToken } = await deriveKeys(
		decodeExact(key, KEY_BYTES, 'key'),
		decodeExact(params.salt, SALT_BYTES, 'salt'),
		password,
		params.kdf
	);
	return toBase64Url(authToken);
}

/** Decrypts a secret returned by `POST /api/v1/secrets/{id}/reveal`. */
export async function decryptSecret(sealed: SealedSecret, key: string, password?: string): Promise<string> {
	const { encKey } = await deriveKeys(
		decodeExact(key, KEY_BYTES, 'key'),
		decodeExact(sealed.salt, SALT_BYTES, 'salt'),
		password,
		sealed.kdf
	);
	let plaintext: ArrayBuffer;
	try {
		plaintext = await subtle().decrypt(
			{ name: 'AES-GCM', iv: decodeExact(sealed.iv, IV_BYTES, 'iv'), additionalData: utf8(AAD) },
			encKey,
			fromBase64Url(sealed.ciphertext)
		);
	} catch {
		throw new Error('Decryption failed: the link key or password is wrong');
	}
	return decoder.decode(plaintext);
}

/** Splits a share link like `https://host/s/<id>#<key>` into its parts. */
export function parseLink(link: string): { id: string; key: string | null; origin: string } {
	const url = new URL(link);
	const match = url.pathname.match(/\/s\/([A-Za-z0-9_-]+)\/?$/);
	if (!match) throw new Error('Not a secret link: expected a path like /s/<id>');
	const key = url.hash.length > 1 ? url.hash.slice(1) : null;
	const base = url.pathname.slice(0, url.pathname.length - match[0].length);
	return { id: match[1], key, origin: url.origin + base };
}
