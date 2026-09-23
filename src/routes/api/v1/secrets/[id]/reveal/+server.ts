import { json } from '@sveltejs/kit';
import { api, readJson } from '$lib/server/http';
import { limits, rateLimit } from '$lib/server/rate-limit';
import { revealSecret } from '$lib/server/secrets';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = api(async ({ params, request, getClientAddress }) => {
	rateLimit(`reveal:${getClientAddress()}`, limits.reveal.limit, limits.reveal.windowMs);
	const body = await readJson(request, 8 * 1024);
	return json(await revealSecret(params.id, body));
});
