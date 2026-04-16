import type { Actions, PageServerLoad } from './$types';
import { loadHomePage, logWeight } from '$lib/server/modules/meal-plan/patient-dashboard.service';
import { requireUser, requireSessionAccess } from '$lib/server/authz/policy';
import { error, fail } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals }) => {
	const user = requireUser(locals.user);
	const homeData = loadHomePage(user.id);
	if (!homeData) error(404, 'المريض غير موجود');
	return homeData;
};

export const actions: Actions = {
	logWeight: async ({ request, locals }) => {
		const user = requireUser(locals.user);
		const formData = await request.formData();
		const weight = parseFloat(formData.get('weight')?.toString() ?? '0');
		const sessionId = parseInt(formData.get('sessionId')?.toString() ?? '0');
		const date = formData.get('date')?.toString() ?? new Date().toISOString().split('T')[0];

		if (!weight || weight < 20 || weight > 400) {
			return fail(400, { error: 'الوزن المدخل غير صالح' });
		}
		if (!sessionId) {
			return fail(400, { error: 'لا توجد جلسة نشطة' });
		}
		if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(Date.parse(date))) {
			return fail(400, { error: 'التاريخ غير صالح' });
		}

		// Verify the session belongs to this patient (prevents IDOR)
		requireSessionAccess(user, sessionId);

		logWeight(sessionId, user.id, weight, date);
		return { success: true };
	}
};
