import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { searchFoodsForApiComplete } from '$lib/server/modules/foods/foods-api.service';

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) error(401, 'Unauthorized');

	const q = url.searchParams.get('q') ?? '';
	const source = url.searchParams.get('source') ?? 'all';
	const ownerOnly = url.searchParams.get('owner') === '1';
	const excludeEdamam = url.searchParams.get('excludeEdamam') === '1';
	const maxRaw = Number(url.searchParams.get('max') ?? '100');
	const maxResults =
		Number.isFinite(maxRaw) && maxRaw > 0 ? Math.min(200, Math.floor(maxRaw)) : 100;

	const result = await searchFoodsForApiComplete({
		q,
		source,
		ownerOnly,
		excludeEdamam,
		maxResults,
		userId: locals.user!.id
	});

	return json(result);
};
