import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Secret IDs are 24 random bytes (192 bit) from the OS CSPRNG, base64url
 * encoded to 32 characters. Guessing one is infeasible; on top of that the
 * link carries a 256-bit key in the fragment that the server never sees.
 */
export function newSecretId(): string {
	return randomBytes(24).toString('base64url');
}

export function newToken(bytes = 32): string {
	return randomBytes(bytes).toString('base64url');
}

export function sha256Hex(value: string): string {
	return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** Constant-time comparison of a presented token with a stored SHA-256 hex hash. */
export function matchesHash(presented: string, storedHex: string): boolean {
	const a = Buffer.from(sha256Hex(presented), 'hex');
	const b = Buffer.from(storedHex, 'hex');
	return a.length === b.length && timingSafeEqual(a, b);
}

export const SECRET_ID_PATTERN = /^[A-Za-z0-9_-]{32}$/;
