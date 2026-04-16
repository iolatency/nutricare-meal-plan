import type { Actions, PageServerLoad } from './$types';
import {
	completeDay,
	loadPatientDashboard,
	setDailyWater,
	setMealStatus
} from '$lib/server/modules/meal-plan/patient-dashboard.service';
import { requireSessionAccess, requireUser } from '$lib/server/authz/policy';
import { db } from '$lib/server/db';
import { mealDays, mealPlans, meals } from '$lib/server/db/schema';
import { toLocalYmd } from '$lib/server/modules/meal-plan/plan-dates';
import { error, fail } from '@sveltejs/kit';
import { desc, eq } from 'drizzle-orm';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function isValidDate(s: string) {
	return DATE_RE.test(s) && !isNaN(Date.parse(s));
}

function sessionHasAnyMeals(sessionId: number): boolean {
	const plan = db
		.select({ id: mealPlans.id })
		.from(mealPlans)
		.where(eq(mealPlans.sessionId, sessionId))
		.orderBy(desc(mealPlans.version))
		.limit(1)
		.get();
	if (!plan) return false;

	const anyMeal = db
		.select({ id: meals.id })
		.from(meals)
		.innerJoin(mealDays, eq(meals.mealDayId, mealDays.id))
		.where(eq(mealDays.mealPlanId, plan.id))
		.limit(1)
		.get();
	return Boolean(anyMeal);
}

export const load: PageServerLoad = async ({ params, locals, url }) => {
	const user = requireUser(locals.user);
	const sessionId = parseInt(params.sessionId);
	const session = requireSessionAccess(user, sessionId);

	// Patients should not be able to open dashboards for sessions that have no planned meals yet.
	if (user.role === 'patient' && !sessionHasAnyMeals(sessionId)) {
		error(404, 'الخطة غير متاحة بعد');
	}

	// Optional date param for week navigation — defaults to today inside the service
	const dateParam = url.searchParams.get('date') ?? undefined;
	const dashboard = loadPatientDashboard(sessionId, session, dateParam);
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
		const date = formData.get('date')?.toString() ?? toLocalYmd(new Date());
		const rawNote = formData.get('replacementNote')?.toString() ?? undefined;

		if (!mealId || !['eaten', 'skipped', 'not_eaten'].includes(status)) {
			return fail(400, { error: 'بيانات غير صالحة' });
		}
		if (!isValidDate(date)) {
			return fail(400, { error: 'التاريخ غير صالح' });
		}
		if (rawNote !== undefined && rawNote.length > 500) {
			return fail(400, { error: 'ملاحظة البديل طويلة جداً (الحد الأقصى 500 حرف)' });
		}

		const replacementNote = rawNote?.trim() || undefined;
		setMealStatus(sessionId, mealId, status as 'eaten' | 'skipped' | 'not_eaten', date, replacementNote);

		return { success: true };
	},

	updateWater: async ({ request, params, locals }) => {
		const user = requireUser(locals.user);
		const sessionId = parseInt(params.sessionId);
		const session = requireSessionAccess(user, sessionId);
		const formData = await request.formData();
		const rawCups = parseInt(formData.get('cups')?.toString() ?? '0');
		const date = formData.get('date')?.toString() ?? toLocalYmd(new Date());

		if (!isValidDate(date)) {
			return fail(400, { error: 'التاريخ غير صالح' });
		}
		// Clamp cups to a sane range server-side regardless of client input
		const cups = Math.max(0, Math.min(20, isNaN(rawCups) ? 0 : rawCups));
		setDailyWater(sessionId, session.clientId, cups, date);

		return { success: true };
	},

	finishDay: async ({ request, params, locals }) => {
		const user = requireUser(locals.user);
		const sessionId = parseInt(params.sessionId);
		const session = requireSessionAccess(user, sessionId);
		const formData = await request.formData();
		const date = formData.get('date')?.toString() ?? toLocalYmd(new Date());

		if (!isValidDate(date)) {
			return fail(400, { error: 'التاريخ غير صالح' });
		}
		const adherence = completeDay(sessionId, session.clientId, date);
		return { success: true, adherence };
	}
};
