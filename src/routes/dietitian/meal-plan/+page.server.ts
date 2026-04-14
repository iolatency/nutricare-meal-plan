import type { Actions, PageServerLoad } from './$types';
import {
	loadDietitianMealPlanListPage,
	actionCreateMealPlanSession,
	activatePatientByEmail
} from '$lib/server/modules/meal-plan/dietitian-session-list.service';
import { fail } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals }) => {
	const dietitianId = locals.user!.id;
	return loadDietitianMealPlanListPage(dietitianId);
};

export const actions: Actions = {
	createSession: async ({ request, locals }) => {
		const dietitianId = locals.user!.id;
		const formData = await request.formData();
		return actionCreateMealPlanSession({ dietitianId, formData });
	},
	activatePatient: async ({ request, locals }) => {
		const dietitianId = locals.user!.id;
		const formData = await request.formData();
		const patientEmail = formData.get('patientEmail')?.toString() ?? '';
		const result = await activatePatientByEmail({ dietitianId, emailRaw: patientEmail });
		if (!result.ok) {
			return fail(400, { error: result.error });
		}
		return { success: true as const, message: result.message };
	}
};
