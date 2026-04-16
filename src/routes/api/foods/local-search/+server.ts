import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { searchFoodsForApiComplete } from '$lib/server/modules/foods/foods-api.service';

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) error(401, 'Unauthorized');

	const q = url.searchParams.get('q') ?? '';
	const ownerOnly = url.searchParams.get('owner') === '1';

	const results = await searchFoodsForApiComplete({
		q,
		source: 'internal',
		ownerOnly,
		excludeEdamam: false,
		maxResults: 30,
		userId: locals.user!.id
	});

	return json(results);
};
