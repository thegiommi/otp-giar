import { json } from '@sveltejs/kit';

export class ApiError extends Error {
	constructor(
		readonly status: number,
		readonly code: string,
		message: string,
		readonly extra: Record<string, unknown> = {},
		readonly headers: Record<string, string> = {}
	) {
		super(message);
	}
}

export function errorResponse(err: unknown): Response {
	if (err instanceof ApiError) {
		return json(
			{ error: { code: err.code, message: err.message, ...err.extra } },
			{ status: err.status, headers: err.headers }
		);
	}
	console.error(err);
	return json({ error: { code: 'internal_error', message: 'Internal server error' } }, { status: 500 });
}

/** Wraps an API handler so thrown ApiErrors become JSON error responses. */
export function api<E>(handler: (event: E) => Promise<Response> | Response) {
	return async (event: E): Promise<Response> => {
		try {
			return await handler(event);
		} catch (err) {
			return errorResponse(err);
		}
	};
}

export async function readJson(request: Request, maxBytes: number): Promise<Record<string, unknown>> {
	const type = request.headers.get('content-type') ?? '';
	if (!type.toLowerCase().startsWith('application/json')) {
		throw new ApiError(415, 'unsupported_media_type', 'Send the body as JSON with Content-Type: application/json');
	}
	const declared = Number(request.headers.get('content-length') ?? 0);
	if (declared > maxBytes) throw new ApiError(413, 'payload_too_large', 'Request body is too large');

	const text = await request.text();
	if (text.length > maxBytes) throw new ApiError(413, 'payload_too_large', 'Request body is too large');
	let body: unknown;
	try {
		body = JSON.parse(text);
	} catch {
		throw new ApiError(400, 'invalid_json', 'Request body is not valid JSON');
	}
	if (!body || typeof body !== 'object' || Array.isArray(body)) {
		throw new ApiError(400, 'invalid_json', 'Request body must be a JSON object');
	}
	return body as Record<string, unknown>;
}
