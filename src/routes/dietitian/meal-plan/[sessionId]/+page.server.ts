import type { Actions, PageServerLoad } from './$types';
import {
	loadMealPlanBuilderPage,
	actionCreateDiagnosis,
	actionUpdateDiagnosis,
	actionSavePlan
} from '$lib/server/modules/meal-plan/meal-plan-builder.service';

export const load: PageServerLoad = async ({ params, locals }) => {
	const sessionId = parseInt(params.sessionId);
	const dietitianId = locals.user!.id;
	return loadMealPlanBuilderPage({ sessionId, dietitianId });
};

export const actions: Actions = {
	createDiagnosis: async ({ request, params, locals }) => {
		const sessionId = parseInt(params.sessionId);
		const dietitianId = locals.user!.id;
		const formData = await request.formData();
		return actionCreateDiagnosis({ sessionId, dietitianId, formData });
	},
	updateDiagnosis: async ({ request, params, locals }) => {
		const sessionId = parseInt(params.sessionId);
		const dietitianId = locals.user!.id;
		const formData = await request.formData();
		return actionUpdateDiagnosis({ sessionId, dietitianId, formData });
	},
	savePlan: async ({ request, params, locals }) => {
		const sessionId = parseInt(params.sessionId);
		const dietitianId = locals.user!.id;
		const formData = await request.formData();
		return actionSavePlan({ sessionId, dietitianId, formData });
	}
};
