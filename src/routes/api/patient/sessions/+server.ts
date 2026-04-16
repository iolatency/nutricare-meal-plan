import type { RequestHandler } from '@sveltejs/kit';
import { json, error } from '@sveltejs/kit';
import { requireUser } from '$lib/server/authz/policy';
import { db } from '$lib/server/db';
import { mealPlanSessions, users, mealPlans, dailyLogs } from '$lib/server/db/schema';
import { eq, desc, and, avg } from 'drizzle-orm';
import { resolveBuilderConfigForDate } from '$lib/meal-plan/builder-config';

export type SessionPhase = 'history' | 'current' | 'upcoming';

export interface PatientSessionDTO {
	id: number;
	status: 'draft' | 'active' | 'completed';
	startDate: string;
	endDate: string;
	phase: SessionPhase;
	dietitianId: number;
	dietitianName: string;
	targetCalories: number | null;
	avgAdherence: number | null;
}

function classifyPhase(
	status: 'draft' | 'active' | 'completed',
	startDate: string,
	endDate: string
): SessionPhase {
	if (status === 'completed') return 'history';
	if (status === 'active') return 'current';
	// draft — use dates to decide
	const today = new Date().toISOString().split('T')[0];
	if (startDate > today) return 'upcoming';
	if (endDate < today) return 'history';
	return 'current';
}

export const GET: RequestHandler = async ({ locals }) => {
	const user = requireUser(locals.user);
	if (user.role !== 'patient') throw error(403, 'هذا المسار للمرضى فقط');

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

	if (!sessions.length) return json([]);

	// Fetch dietitian names
	const dietitianIds = [...new Set(sessions.map((s) => s.dietitianId))];
	const dietitianRows = db
		.select({ id: users.id, name: users.name })
		.from(users)
		.all()
		.filter((u) => dietitianIds.includes(u.id));
	const dietitianMap = new Map(dietitianRows.map((d) => [d.id, d.name]));

	// For each session, fetch latest plan's builderConfig for targetCalories and avg adherence
	const result: PatientSessionDTO[] = sessions.map((s) => {
		const plan = db
			.select({ builderConfig: mealPlans.builderConfig })
			.from(mealPlans)
			.where(eq(mealPlans.sessionId, s.id))
			.orderBy(desc(mealPlans.version))
			.limit(1)
			.get();

		let targetCalories: number | null = null;
		if (plan?.builderConfig) {
			try {
				const cfg = JSON.parse(plan.builderConfig);
				targetCalories = resolveBuilderConfigForDate(cfg, s.startDate).targetCalories ?? null;
			} catch {
				// ignore malformed config
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
			dietitianId: s.dietitianId,
			dietitianName: dietitianMap.get(s.dietitianId) ?? 'أخصائي التغذية',
			targetCalories,
			avgAdherence
		};
	});

	return json(result);
};
