import { json } from '@sveltejs/kit';
import { authenticate } from '$lib/server/api-keys';
import { api, readJson } from '$lib/server/http';
import { limits, rateLimit } from '$lib/server/rate-limit';
import { createSecret } from '$lib/server/secrets';
import type { RequestHandler } from './$types';

const MAX_BODY_BYTES = 512 * 1024;

export const POST: RequestHandler = api(async ({ request, getClientAddress, url }) => {
	const key = authenticate(request);
	if (key) rateLimit(`create:key:${key.id}`, limits.createWithKey.limit, limits.createWithKey.windowMs);
	else rateLimit(`create:ip:${getClientAddress()}`, limits.createAnonymous.limit, limits.createAnonymous.windowMs);

	const body = await readJson(request, MAX_BODY_BYTES);
	const result = await createSecret(body, url.origin);
	return json(result, { status: 201, headers: { Location: `/api/v1/secrets/${result.id}` } });
});
