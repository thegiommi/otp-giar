import {
	decryptSecret,
	deriveAuthToken,
	encryptSecret,
	parseLink,
	type EncryptedPayload,
	type KdfParams,
	type SealedSecret
} from './crypto.ts';

export interface ClientOptions {
	/** Base URL of the otp-giar instance, e.g. `https://otp.giar.digital`. Empty string = same origin (browser). */
	baseUrl: string;
	/** Optional API key (`ogk_...`). Grants higher rate limits. */
	apiKey?: string;
	/** Custom fetch implementation (defaults to the global fetch). */
	fetch?: typeof fetch;
}

export interface CreateOptions {
	/** Lifetime in seconds. 60 … 604800 (7 days). Default: 86400 (1 day). */
	expiresIn?: number;
	/** How often the secret can be opened. 1 … 100. Default: 1. */
	maxViews?: number;
	/** Optional password the recipient has to enter in addition to the link. */
	password?: string;
}

export interface CreatedSecret {
	id: string;
	/** Complete share link, including the key in the fragment. */
	link: string;
	/** Link key (the part after `#`). */
	key: string;
	expiresAt: string;
	maxViews: number;
	/** Keep this to burn the secret before it is read: `client.burn(id, deleteToken)`. */
	deleteToken: string;
}

export interface SecretInfo {
	id: string;
	expiresAt: string;
	createdAt: string;
	maxViews: number;
	viewsRemaining: number;
	passwordRequired: boolean;
	salt: string;
	kdf: KdfParams | null;
}

export interface RevealedSecret {
	id: string;
	secret: string;
	/** Views left after this one. 0 means the secret has been deleted. */
	viewsRemaining: number;
	expiresAt: string;
}

export class OtpError extends Error {
	/** HTTP status, or 0 for errors raised before any request was made. */
	readonly status: number;
	/** Machine-readable code, e.g. `not_found`, `invalid_credentials`, `rate_limited`. */
	readonly code: string;
	/** Extra fields from the error response, e.g. `attemptsRemaining`, `retryAfter`. */
	readonly details: Record<string, unknown>;

	constructor(message: string, status: number, code: string, details: Record<string, unknown> = {}) {
		super(message);
		this.name = 'OtpError';
		this.status = status;
		this.code = code;
		this.details = details;
	}
}

export class OtpClient {
	readonly baseUrl: string;
	private readonly apiKey?: string;
	private readonly fetchImpl: typeof fetch;

	constructor(options: ClientOptions) {
		this.baseUrl = options.baseUrl.replace(/\/+$/, '');
		this.apiKey = options.apiKey;
		this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
	}

	/** Encrypts locally and stores only the ciphertext. The key never leaves this process. */
	async create(secret: string, options: CreateOptions = {}): Promise<CreatedSecret> {
		const { key, payload } = await encryptSecret(secret, { password: options.password });
		const body: EncryptedPayload & { expiresIn?: number; maxViews?: number } = {
			...payload,
			expiresIn: options.expiresIn,
			maxViews: options.maxViews
		};
		const res = await this.request<{
			id: string;
			url: string;
			expiresAt: string;
			maxViews: number;
			deleteToken: string;
		}>('POST', '/api/v1/secrets', body);
		return {
			id: res.id,
			link: `${res.url}#${key}`,
			key,
			expiresAt: res.expiresAt,
			maxViews: res.maxViews,
			deleteToken: res.deleteToken
		};
	}

	/** Reads metadata without opening the secret. Does not consume a view. */
	async info(linkOrId: string): Promise<SecretInfo> {
		const id = linkOrId.includes('/') ? parseLink(linkOrId).id : linkOrId;
		return this.request<SecretInfo>('GET', `/api/v1/secrets/${encodeURIComponent(id)}`);
	}

	/** Opens the secret (consumes one view) and decrypts it locally. */
	async reveal(link: string, options: { password?: string } = {}): Promise<RevealedSecret> {
		const { id, key } = parseLink(link);
		if (!key) throw new OtpError('The link has no key (the part after #)', 0, 'missing_key');
		const info = await this.info(id);
		if (info.passwordRequired && !options.password) {
			throw new OtpError('This secret is password protected', 0, 'password_required');
		}
		const authToken = await deriveAuthToken(key, info, options.password);
		const sealed = await this.request<SealedSecret & { id: string; viewsRemaining: number; expiresAt: string }>(
			'POST',
			`/api/v1/secrets/${encodeURIComponent(id)}/reveal`,
			{ authToken }
		);
		const secret = await decryptSecret(sealed, key, options.password);
		return { id, secret, viewsRemaining: sealed.viewsRemaining, expiresAt: sealed.expiresAt };
	}

	/** Deletes a secret immediately, using the delete token returned by `create`. */
	async burn(id: string, deleteToken: string): Promise<void> {
		await this.request('DELETE', `/api/v1/secrets/${encodeURIComponent(id)}`, undefined, {
			'X-Delete-Token': deleteToken
		});
	}

	private async request<T>(
		method: string,
		path: string,
		body?: unknown,
		headers: Record<string, string> = {}
	): Promise<T> {
		const init: RequestInit = { method, headers: { Accept: 'application/json', ...headers } };
		if (this.apiKey) (init.headers as Record<string, string>).Authorization = `Bearer ${this.apiKey}`;
		if (body !== undefined) {
			(init.headers as Record<string, string>)['Content-Type'] = 'application/json';
			init.body = JSON.stringify(body);
		}
		const res = await this.fetchImpl(`${this.baseUrl}${path}`, init);
		if (res.status === 204) return undefined as T;
		const data = await res.json().catch(() => null);
		if (!res.ok) {
			const err = (data as { error?: { code?: string; message?: string } } | null)?.error;
			throw new OtpError(
				err?.message ?? `Request failed with status ${res.status}`,
				res.status,
				err?.code ?? 'http_error',
				(err as Record<string, unknown>) ?? {}
			);
		}
		return data as T;
	}
}
