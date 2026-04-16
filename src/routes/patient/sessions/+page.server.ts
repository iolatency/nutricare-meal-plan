import type { PageServerLoad } from './$types';
import { requireUser } from '$lib/server/authz/policy';
import { db } from '$lib/server/db';
import { mealPlanSessions, mealPlans, dailyLogs, users, mealDays, meals } from '$lib/server/db/schema';
import { eq, desc, and } from 'drizzle-orm';
import { resolveBuilderConfigForDate } from '$lib/meal-plan/builder-config';

export type SessionPhase = 'history' | 'current' | 'upcoming';

export interface SessionRow {
	id: number;
	status: 'draft' | 'active' | 'completed';
	startDate: string;
	endDate: string;
	phase: SessionPhase;
	dietitianName: string;
	targetCalories: number | null;
	avgAdherence: number | null;
}

function classifyPhase(
	status: 'draft' | 'active' | 'completed',
	startDate: string,
	endDate: string
): SessionPhase {
	if (status === 'draft') return 'upcoming';
	if (status === 'completed') return 'history';
	if (status === 'active') return 'current';
	const today = new Date().toISOString().split('T')[0];
	if (startDate > today) return 'upcoming';
	if (endDate < today) return 'history';
	return 'current';
}

export const load: PageServerLoad = async ({ locals }) => {
	const user = requireUser(locals.user);

	const sessions = db
		.select({
			id: mealPlanSessions.id,
			status: mealPlanSessions.status,
			startDate: mealPlanSessions.startDate,
			endDate: mealPlanSessions.endDate,
			dietitianId: mealPlanSessions.dietitianId
		})
		.from(mealPlanSessions)
		.where(eq(mealPlanSessions.clientId, user.id))
		.orderBy(desc(mealPlanSessions.id))
		.all() as Array<{
			id: number;
			status: 'draft' | 'active' | 'completed';
			startDate: string;
			endDate: string;
			dietitianId: number;
		}>;

	const rows: SessionRow[] = sessions
		.map((s) => {
		const dietitianUser = db
			.select({ name: users.name })
			.from(users)
			.where(eq(users.id, s.dietitianId))
			.get();

		const plan = db
			.select({ id: mealPlans.id, builderConfig: mealPlans.builderConfig })
			.from(mealPlans)
			.where(eq(mealPlans.sessionId, s.id))
			.orderBy(desc(mealPlans.version))
			.limit(1)
			.get();

		// Patients should only see sessions that have at least one planned meal.
		// (Dietitian may create sessions/config first; hide until actual foods/meals exist.)
		if (!plan) return null;
		const anyMeal = db
			.select({ id: meals.id })
			.from(meals)
			.innerJoin(mealDays, eq(meals.mealDayId, mealDays.id))
			.where(eq(mealDays.mealPlanId, plan.id))
			.limit(1)
			.get();
		if (!anyMeal) return null;

		let targetCalories: number | null = null;
		if (plan?.builderConfig) {
			try {
				const cfg = JSON.parse(plan.builderConfig);
				targetCalories = resolveBuilderConfigForDate(cfg, s.startDate).targetCalories ?? null;
			} catch {
				// ignore
			}
		}

		const logRows = db
			.select({ adherenceScore: dailyLogs.adherenceScore })
			.from(dailyLogs)
			.where(and(eq(dailyLogs.sessionId, s.id), eq(dailyLogs.clientId, user.id)))
			.all();

		const scored = logRows.filter((l) => l.adherenceScore != null);
		const avgAdherence =
			scored.length > 0
				? Math.round(scored.reduce((sum, l) => sum + (l.adherenceScore ?? 0), 0) / scored.length)
				: null;

		return {
			id: s.id,
			status: s.status,
			startDate: s.startDate,
			endDate: s.endDate,
			phase: classifyPhase(s.status, s.startDate, s.endDate),
			dietitianName: dietitianUser?.name ?? 'أخصائي التغذية',
			targetCalories,
			avgAdherence
		};
	})
		.filter((row): row is SessionRow => row != null);

	const history = rows.filter((s) => s.phase === 'history');
	const current = rows.filter((s) => s.phase === 'current');
	// Upcoming is intentionally hidden from the patient sessions timeline UI.
	const upcoming: SessionRow[] = [];

	return { history, current, upcoming };
};
