import type { Actions, PageServerLoad } from './$types';
import {
	loadDietitianFoodsPage,
	actionCreateFood,
	actionCreateFoodCategory,
	actionDeleteFood,
	actionUpdateFood
} from '$lib/server/modules/foods/dietitian-foods-page.service';

export const load: PageServerLoad = async ({ url, locals }) => {
	const userId = locals.user!.id;
	return loadDietitianFoodsPage({ userId, url });
};

export const actions: Actions = {
	createFood: async ({ request, locals }) => {
		const data = await request.formData();
		return actionCreateFood({ userId: locals.user!.id, data });
	},
	createCategory: async ({ request }) => {
		const data = await request.formData();
		return actionCreateFoodCategory(data);
	},
	deleteFood: async ({ request, locals }) => {
		const data = await request.formData();
		return actionDeleteFood({ userId: locals.user!.id, data });
	},
	editFood: async ({ request, locals }) => {
		const data = await request.formData();
		return actionUpdateFood({ userId: locals.user!.id, data });
	}
};
