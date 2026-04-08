import { db } from '$lib/server/db';
import { memberships, users } from '$lib/server/db/schema';
import { eq, sql } from 'drizzle-orm';
import type { InferSelectModel } from 'drizzle-orm';

export type UserRow = InferSelectModel<typeof users>;

export async function findUserByEmail(identifier: string): Promise<UserRow | undefined> {
	const key = identifier.trim().toLowerCase();
	const rows = await db
		.select()
		.from(users)
		.where(sql`lower(${users.email}) = ${key}`)
		.limit(1);
	return rows[0];
}

export async function getMembershipRolesForUser(
	userId: number
): Promise<string | null | undefined> {
	const [mem] = await db
		.select({ roles: memberships.roles })
		.from(memberships)
		.where(eq(memberships.userId, userId))
		.limit(1);
	return mem?.roles;
}
