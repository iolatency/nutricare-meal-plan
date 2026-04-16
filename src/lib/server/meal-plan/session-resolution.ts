import { db } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';
import { mealPlanSessions } from '$lib/server/db/schema';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { and, desc, eq } from 'drizzle-orm';

export type SessionListRow = {
	id: number;
	clientId: number;
	status: 'draft' | 'active' | 'completed';
	startDate: string;
};

type DbExecutor = BetterSQLite3Database<typeof schema>;

/** Latest active by id, else latest draft by id; null if neither (same connection / transaction). */
export function resolveWorkingSessionTx(
	clientId: number,
	dietitianId: number,
	tx: DbExecutor
): SessionListRow | null {
	const active = tx
		.select({
			id: mealPlanSessions.id,
			clientId: mealPlanSessions.clientId,
			status: mealPlanSessions.status,
			startDate: mealPlanSessions.startDate
		})
		.from(mealPlanSessions)
		.where(
			and(
				eq(mealPlanSessions.clientId, clientId),
				eq(mealPlanSessions.dietitianId, dietitianId),
				eq(mealPlanSessions.status, 'active')
			)
		)
		.orderBy(desc(mealPlanSessions.id))
		.limit(1)
		.get();

	if (active) return active as SessionListRow;

	const draft = tx
		.select({
			id: mealPlanSessions.id,
			clientId: mealPlanSessions.clientId,
			status: mealPlanSessions.status,
			startDate: mealPlanSessions.startDate
		})
		.from(mealPlanSessions)
		.where(
			and(
				eq(mealPlanSessions.clientId, clientId),
				eq(mealPlanSessions.dietitianId, dietitianId),
				eq(mealPlanSessions.status, 'draft')
			)
		)
		.orderBy(desc(mealPlanSessions.id))
		.limit(1)
		.get();

	return (draft as SessionListRow | undefined) ?? null;
}

/** Latest active by id, else latest draft by id; null if neither. */
export function resolveWorkingSession(
	clientId: number,
	dietitianId: number
): SessionListRow | null {
	return resolveWorkingSessionTx(clientId, dietitianId, db);
}

/** Same rules as resolveWorkingSession, for pre-fetched rows (e.g. list load). */
export function resolveWorkingSessionFromRows(rows: SessionListRow[]): SessionListRow | null {
	if (!rows.length) return null;
	const sorted = [...rows].sort((a, b) => b.id - a.id);
	return sorted.find((s) => s.status === 'active') ?? sorted.find((s) => s.status === 'draft') ?? null;
}
