import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { enrichExternalCatalogNutrientsForApi } from '$lib/server/modules/foods/foods-api.service';

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) error(401, 'Unauthorized');

	const foodId = url.searchParams.get('foodId') ?? '';
	if (!foodId) error(400, 'Missing foodId');

	const result = await enrichExternalCatalogNutrientsForApi(foodId);
	if (!result.ok) {
		error(result.status, result.message);
	}

	return json(result.data);
};
