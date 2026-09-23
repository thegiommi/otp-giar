import { json } from '@sveltejs/kit';
import { openapi } from '$lib/server/openapi';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ url }) => json(openapi(url.origin));
