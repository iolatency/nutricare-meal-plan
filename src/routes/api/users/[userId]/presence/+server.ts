import type { RequestHandler } from '@sveltejs/kit';
import { json, error } from '@sveltejs/kit';
import { requireUser } from '$lib/server/authz/policy';
import { db } from '$lib/server/db';
import { users, mealPlanSessions } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

/** A user is considered online if they were active within this many milliseconds. */
const ONLINE_THRESHOLD_MS = 3 * 60 * 1000; // 3 minutes

/**
 * Returns true when the caller is permitted to read the target user's presence.
 *
 * - Patient  → may only check their assigned dietitian's presence.
 * - Dietitian → may check their own presence or any patient sharing a session.
 * - Admin    → unrestricted.
 */
function isPresenceAllowed(caller: { id: number; role: string }, targetId: number): boolean {
	if (caller.id === targetId) return true; // always allowed to check own presence

	if (caller.role === 'patient') {
		const row = db
			.select({ dietitianId: mealPlanSessions.dietitianId })
			.from(mealPlanSessions)
			.where(eq(mealPlanSessions.clientId, caller.id))
			.get();
		return row?.dietitianId === targetId;
	}

	if (caller.role === 'dietitian') {
		const row = db
			.select({ clientId: mealPlanSessions.clientId })
			.from(mealPlanSessions)
			.where(eq(mealPlanSessions.dietitianId, caller.id))
			.get();
		return row?.clientId === targetId;
	}

	return caller.role === 'admin';
}

export const GET: RequestHandler = async ({ locals, params }) => {
	const caller = requireUser(locals.user);

	const targetId = parseInt(params.userId ?? '0');
	if (!targetId || isNaN(targetId)) throw error(400, 'معرّف المستخدم غير صالح');

	if (!isPresenceAllowed(caller, targetId)) throw error(403, 'غير مصرح');

	const row = db
		.select({ lastSeenAt: users.lastSeenAt })
		.from(users)
		.where(eq(users.id, targetId))
		.get();

	if (!row) throw error(404, 'المستخدم غير موجود');

	const lastSeenAt = row.lastSeenAt ?? null;
	const online = lastSeenAt
		? Date.now() - new Date(lastSeenAt).getTime() < ONLINE_THRESHOLD_MS
		: false;

	return json({ online, lastSeenAt });
};
