import type { Actions, PageServerLoad } from './$types';
import { loadMealPlanTrackingPage } from '$lib/server/modules/meal-plan/meal-plan-tracking.service';
import { requireRole, requireUser } from '$lib/server/authz/policy';
import { setDailyWater } from '$lib/server/modules/meal-plan/patient-dashboard.service';
import { db } from '$lib/server/db';
import { mealPlanSessions } from '$lib/server/db/schema';
import { and, eq } from 'drizzle-orm';
import { error, fail } from '@sveltejs/kit';
import { toLocalYmd } from '$lib/date/local-ymd';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function isValidDate(s: string) {
	return DATE_RE.test(s) && !isNaN(Date.parse(s));
}

function listDaysInRange(from: string, to: string) {
	const out: string[] = [];
	const start = new Date(from + 'T00:00:00');
	const end = new Date(to + 'T00:00:00');
	for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
		out.push(toLocalYmd(d));
	}
	return out;
}

function requireDietitianSession(sessionId: number, dietitianId: number) {
	const session = db
		.select()
		.from(mealPlanSessions)
		.where(and(eq(mealPlanSessions.id, sessionId), eq(mealPlanSessions.dietitianId, dietitianId)))
		.get();
	if (!session) error(404, 'الجلسة غير موجودة');
	return session;
}

function resolveOwnerSessionIdForDate(
	date: string,
	sessions: Array<{ id: number; startDate: string; endDate: string }>,
	fallbackSessionId: number
) {
	const owned = sessions.find((s) => s.startDate <= date && s.endDate >= date);
	return owned?.id ?? fallbackSessionId;
}

export const load: PageServerLoad = async ({ locals, params, url }) => {
	const dietitianId = locals.user!.id;
	const sessionId = parseInt(params.sessionId);
	const planType = (url.searchParams.get('type') ?? 'weekly') as 'daily' | 'weekly';
	const dateParam = url.searchParams.get('date') ?? toLocalYmd(new Date());

	return loadMealPlanTrackingPage({ sessionId, dietitianId, planType, dateParam });
};

export const actions: Actions = {
	updateWater: async ({ request, params, locals }) => {
		const user = requireRole(requireUser(locals.user), 'dietitian');
		const sessionId = parseInt(params.sessionId);
		const session = requireDietitianSession(sessionId, user.id);

		const formData = await request.formData();
		const rawCups = parseInt(formData.get('cups')?.toString() ?? '0');
		const planType = (formData.get('planType')?.toString() ?? 'daily') as 'daily' | 'weekly';
		const date = formData.get('date')?.toString() ?? toLocalYmd(new Date());
		const weekFrom = formData.get('weekFrom')?.toString() ?? date;
		const weekTo = formData.get('weekTo')?.toString() ?? date;

		if (!isValidDate(date)) {
			return fail(400, { error: 'التاريخ غير صالح' });
		}
		if (planType === 'weekly' && (!isValidDate(weekFrom) || !isValidDate(weekTo))) {
			return fail(400, { error: 'نطاق الأسبوع غير صالح' });
		}
		const cups = Math.max(0, Math.min(20, isNaN(rawCups) ? 0 : rawCups));
		const relatedSessions = db
			.select({ id: mealPlanSessions.id, startDate: mealPlanSessions.startDate, endDate: mealPlanSessions.endDate })
			.from(mealPlanSessions)
			.where(and(eq(mealPlanSessions.clientId, session.clientId), eq(mealPlanSessions.dietitianId, user.id)))
			.all()
			.filter((s) => isValidDate(s.startDate) && isValidDate(s.endDate))
			.sort((a, b) => b.startDate.localeCompare(a.startDate));

		if (planType === 'weekly') {
			const days = listDaysInRange(weekFrom, weekTo);
			for (const day of days) {
				const ownerSessionId = resolveOwnerSessionIdForDate(day, relatedSessions, sessionId);
				setDailyWater(ownerSessionId, session.clientId, cups, day);
			}
			return { success: true, scope: 'weekly', updatedDays: days.length };
		}

		const ownerSessionId = resolveOwnerSessionIdForDate(date, relatedSessions, sessionId);
		setDailyWater(ownerSessionId, session.clientId, cups, date);
		return { success: true, scope: 'daily', updatedDays: 1 };
	}
};
