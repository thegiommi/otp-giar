import type { Handle, ServerInit } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { sweepRateLimits } from '$lib/server/rate-limit';
import { purgeExpired } from '$lib/server/secrets';

export const init: ServerInit = () => {
	db();
	purgeExpired();
	// Expired secrets are also rejected on access; this keeps the file small and the data gone.
	setInterval(() => {
		purgeExpired();
		sweepRateLimits();
	}, 60_000).unref();
};

const CORS_HEADERS = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Delete-Token',
	'Access-Control-Expose-Headers': 'Retry-After, Location',
	'Access-Control-Max-Age': '86400'
};

export const handle: Handle = async ({ event, resolve }) => {
	const { pathname } = event.url;
	const isPublicApi = pathname.startsWith('/api/v1/');

	// The API uses no cookies, so allowing any origin cannot be abused for CSRF.
	if (isPublicApi && event.request.method === 'OPTIONS') {
		return new Response(null, { status: 204, headers: CORS_HEADERS });
	}

	const response = await resolve(event);
	const h = response.headers;

	if (isPublicApi) for (const [k, v] of Object.entries(CORS_HEADERS)) h.set(k, v);

	h.set('X-Content-Type-Options', 'nosniff');
	h.set('Referrer-Policy', 'no-referrer');
	h.set('X-Frame-Options', 'DENY');
	h.set('Cross-Origin-Opener-Policy', 'same-origin');
	h.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
	if (event.url.protocol === 'https:') {
		h.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
	}
	if (pathname.startsWith('/s/') || pathname.startsWith('/api/')) {
		h.set('Cache-Control', 'no-store');
		h.set('X-Robots-Tag', 'noindex, nofollow');
	}
	return response;
};
