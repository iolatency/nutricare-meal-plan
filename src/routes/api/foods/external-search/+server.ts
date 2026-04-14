import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { externalSearchFoodsForApi } from '$lib/server/modules/foods/foods-api.service';

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) error(401, 'Unauthorized');

	const q = url.searchParams.get('q') ?? '';
	const results = await externalSearchFoodsForApi({ q, userId: locals.user.id });

	return json(results);
};
