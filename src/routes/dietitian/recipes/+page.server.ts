import type { Actions, PageServerLoad } from './$types';
import {
	loadDietitianRecipesPage,
	actionCreateRecipe,
	actionDeleteRecipe,
	actionEditRecipe,
	actionCreateRecipeCategory
} from '$lib/server/modules/recipes/dietitian-recipes-page.service';

export const load: PageServerLoad = async ({ locals, depends }) => {
	depends('app:recipes');
	const ownerId = locals.user!.id;
	return loadDietitianRecipesPage(ownerId);
};

export const actions: Actions = {
	createRecipe: async ({ request, locals }) => {
		const data = await request.formData();
		return actionCreateRecipe({ ownerId: locals.user!.id, data });
	},
	deleteRecipe: async ({ request, locals }) => {
		const data = await request.formData();
		return actionDeleteRecipe({ ownerId: locals.user!.id, data });
	},
	editRecipe: async ({ request, locals }) => {
		const data = await request.formData();
		return actionEditRecipe({ ownerId: locals.user!.id, data });
	},
	createCategory: async ({ request, locals }) => {
		const data = await request.formData();
		return actionCreateRecipeCategory({ ownerId: locals.user!.id, data });
	}
};
