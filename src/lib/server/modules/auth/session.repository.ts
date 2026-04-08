import { db } from '$lib/server/db';
import { authSessions, users } from '$lib/server/db/schema';
import { and, eq, gt } from 'drizzle-orm';

export async function insertAuthSession(userId: number, token: string, expiresAtIso: string) {
	await db.insert(authSessions).values({ userId, token, expiresAt: expiresAtIso });
}

export async function deleteAuthSessionByToken(token: string) {
	await db.delete(authSessions).where(eq(authSessions.token, token));
}

export async function findUserBasicsForValidToken(
	token: string
): Promise<{ id: number; name: string; email: string } | null> {
	const now = new Date().toISOString();
	const rows = await db
		.select({
			id: users.id,
			name: users.name,
			email: users.email
		})
		.from(authSessions)
		.innerJoin(users, eq(authSessions.userId, users.id))
		.where(and(eq(authSessions.token, token), gt(authSessions.expiresAt, now)))
		.limit(1);
	const row = rows[0];
	return row ?? null;
}
