/** Limits shared by the UI and the server. The server enforces them. */

export const MIN_TTL_SECONDS = 60;
export const MAX_TTL_SECONDS = 7 * 24 * 60 * 60;
export const DEFAULT_TTL_SECONDS = 24 * 60 * 60;

export const MIN_VIEWS = 1;
export const MAX_VIEWS = 100;
export const DEFAULT_VIEWS = 1;

/** Maximum plaintext size in bytes (UTF-8). */
export const MAX_SECRET_BYTES = 64 * 1024;

/** Wrong link/password attempts before a secret is destroyed. */
export const MAX_FAILED_ATTEMPTS = 10;

export const TTL_PRESETS = [
	{ seconds: 15 * 60, label: '15 Min' },
	{ seconds: 60 * 60, label: '1 Std' },
	{ seconds: 24 * 60 * 60, label: '1 Tag' },
	{ seconds: 3 * 24 * 60 * 60, label: '3 Tage' },
	{ seconds: 7 * 24 * 60 * 60, label: '7 Tage' }
] as const;
