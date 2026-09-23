import { db } from './db';
import { ApiError } from './http';
import { sha256Hex } from './tokens';

export const API_KEY_PREFIX = 'ogk_';

export interface ApiKey {
	id: string;
	name: string;
}

/**
 * Resolves the `Authorization: Bearer ogk_...` header.
 * No header → anonymous (null). A header with an unknown or revoked key → 401,
 * so a typo never silently falls back to the anonymous rate limit.
 */
export function authenticate(request: Request): ApiKey | null {
	const header = request.headers.get('authorization');
	if (!header) return null;

	const match = header.match(/^Bearer\s+(\S+)$/i);
	if (!match || !match[1].startsWith(API_KEY_PREFIX)) {
		throw new ApiError(401, 'invalid_api_key', 'Authorization must be "Bearer ogk_..."');
	}

	const row = db()
		.prepare('SELECT id, name FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL')
		.get(sha256Hex(match[1])) as ApiKey | undefined;
	if (!row) throw new ApiError(401, 'invalid_api_key', 'API key is unknown or revoked');

	db().prepare('UPDATE api_keys SET last_used_at = ? WHERE id = ?').run(Date.now(), row.id);
	return { id: row.id, name: row.name };
}
