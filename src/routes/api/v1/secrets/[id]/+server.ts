import { json } from '@sveltejs/kit';
import { api, ApiError } from '$lib/server/http';
import { limits, rateLimit } from '$lib/server/rate-limit';
import { burnSecret, getSecretInfo } from '$lib/server/secrets';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = api(async ({ params, getClientAddress }) => {
	rateLimit(`read:${getClientAddress()}`, limits.read.limit, limits.read.windowMs);
	const info = getSecretInfo(params.id);
	if (!info) {
		throw new ApiError(404, 'not_found', 'This secret does not exist, has expired or has already been opened');
	}
	return json(info);
});

export const DELETE: RequestHandler = api(async ({ params, request, getClientAddress }) => {
	rateLimit(`read:${getClientAddress()}`, limits.read.limit, limits.read.windowMs);
	burnSecret(params.id, request.headers.get('x-delete-token'));
	return new Response(null, { status: 204 });
});
