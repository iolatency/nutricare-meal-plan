import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { importFoodFromEdamam, type ImportFoodBody } from '$lib/server/modules/foods/foods-api.service';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) error(401, 'Unauthorized');

	const body = (await request.json()) as ImportFoodBody;
	const result = await importFoodFromEdamam({ userId: locals.user.id, body });

	if (!result.ok) {
		error(result.status, result.message);
	}

	return json({ id: result.id, already: result.already });
};
