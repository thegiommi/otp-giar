import { getSecretInfo } from '$lib/server/secrets';
import type { PageServerLoad } from './$types';

// Metadata only. Opening happens client-side, because only the browser knows the key.
export const load: PageServerLoad = ({ params }) => {
	return { info: getSecretInfo(params.id) };
};
