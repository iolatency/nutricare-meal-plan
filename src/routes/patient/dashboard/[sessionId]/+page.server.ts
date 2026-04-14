import type { Actions, PageServerLoad } from './$types';
import {
	completeDay,
	loadPatientDashboard,
	setDailyWater,
	setMealStatus
} from '$lib/server/modules/meal-plan/patient-dashboard.service';
import { requireSessionAccess, requireUser } from '$lib/server/authz/policy';
import { error, fail } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params, locals }) => {
	const user = requireUser(locals.user);
	const sessionId = parseInt(params.sessionId);
	const session = requireSessionAccess(user, sessionId);
	const dashboard = loadPatientDashboard(sessionId, session);
	if (!dashboard) error(404, 'المريض غير موجود');
	return { session, ...dashboard };
};

export const actions: Actions = {
	updateMealStatus: async ({ request, params, locals }) => {
		const user = requireUser(locals.user);
		const sessionId = parseInt(params.sessionId);
		requireSessionAccess(user, sessionId);
		const formData = await request.formData();
		const mealId = parseInt(formData.get('mealId')?.toString() ?? '0');
		const status = formData.get('status')?.toString() ?? '';
		const date = formData.get('date')?.toString() ?? new Date().toISOString().split('T')[0];

		if (!mealId || !['eaten', 'skipped', 'not_eaten'].includes(status)) {
			return fail(400, { error: 'بيانات غير صالحة' });
		}
		setMealStatus(sessionId, mealId, status as 'eaten' | 'skipped' | 'not_eaten', date);

		return { success: true };
	},

	updateWater: async ({ request, params, locals }) => {
		const user = requireUser(locals.user);
		const sessionId = parseInt(params.sessionId);
		const session = requireSessionAccess(user, sessionId);
		const formData = await request.formData();
		const cups = parseInt(formData.get('cups')?.toString() ?? '0');
		const date = formData.get('date')?.toString() ?? new Date().toISOString().split('T')[0];
		setDailyWater(sessionId, session.clientId, cups, date);

		return { success: true };
	},

	finishDay: async ({ request, params, locals }) => {
		const user = requireUser(locals.user);
		const sessionId = parseInt(params.sessionId);
		const session = requireSessionAccess(user, sessionId);
		const formData = await request.formData();
		const date = formData.get('date')?.toString() ?? new Date().toISOString().split('T')[0];
		const adherence = completeDay(sessionId, session.clientId, date);
		return { success: true, adherence };
	}
};
