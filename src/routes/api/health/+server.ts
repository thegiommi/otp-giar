import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = () => {
	db().prepare('SELECT 1').get();
	return json({ status: 'ok' });
};
