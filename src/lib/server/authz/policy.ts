import { error } from '@sveltejs/kit';
import type { SessionUser } from '$lib/server/modules/auth/auth.types';
import { db } from '$lib/server/db';
import { mealPlanSessions } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export function requireUser(user: SessionUser | null | undefined): SessionUser {
	if (!user) error(401, 'Unauthorized');
	return user;
}

export function requireRole(
	user: SessionUser | null | undefined,
	role: SessionUser['role']
): SessionUser {
	const authedUser = requireUser(user);
	if (authedUser.role !== role) error(403, 'Forbidden');
	return authedUser;
}

export function requireSessionAccess(
	user: SessionUser | null | undefined,
	sessionId: number
): { id: number; clientId: number; dietitianId: number } {
	const authedUser = requireUser(user);
	const session = db
		.select({
			id: mealPlanSessions.id,
			clientId: mealPlanSessions.clientId,
			dietitianId: mealPlanSessions.dietitianId
		})
		.from(mealPlanSessions)
		.where(eq(mealPlanSessions.id, sessionId))
		.get();

	if (!session) error(404, 'الجلسة غير موجودة');
	if (session.clientId !== authedUser.id && session.dietitianId !== authedUser.id) error(403, 'غير مصرح');

	return session;
}
