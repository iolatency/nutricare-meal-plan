import { db } from '$lib/server/db';
import { authSessions, users } from '$lib/server/db/schema';
import { and, eq, gt, lt } from 'drizzle-orm';

export async function insertAuthSession(userId: number, token: string, expiresAtIso: string) {
	await db.insert(authSessions).values({ userId, token, expiresAt: expiresAtIso });
}

export async function deleteAuthSessionByToken(token: string) {
	await db.delete(authSessions).where(eq(authSessions.token, token));
}

export async function findUserBasicsForValidToken(
	token: string
): Promise<{ id: number; name: string; email: string; canAccessPatientApp: boolean } | null> {
	const now = new Date().toISOString();
	const rows = await db
		.select({
			id: users.id,
			name: users.name,
			email: users.email,
			canAccessPatientApp: users.canAccessPatientApp
		})
		.from(authSessions)
		.innerJoin(users, eq(authSessions.userId, users.id))
		.where(and(eq(authSessions.token, token), gt(authSessions.expiresAt, now)))
		.limit(1);
	const row = rows[0];
	return row ?? null;
}

export async function getSessionExpiry(token: string): Promise<{ expiresAt: string } | null> {
	const rows = await db
		.select({ expiresAt: authSessions.expiresAt })
		.from(authSessions)
		.where(eq(authSessions.token, token))
		.limit(1);
	return rows[0] ?? null;
}

export async function refreshAuthSession(token: string, newExpiresAt: string) {
	await db.update(authSessions).set({ expiresAt: newExpiresAt }).where(eq(authSessions.token, token));
}

export async function deleteExpiredSessions(): Promise<void> {
	const now = new Date().toISOString();
	await db.delete(authSessions).where(lt(authSessions.expiresAt, now));
}
