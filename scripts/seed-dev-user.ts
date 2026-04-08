import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import * as schema from '../src/lib/server/db/schema';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
	console.error(
		'DATABASE_URL is not set. Example: DATABASE_URL=file:local.db npm run db:seed-dev-user'
	);
	process.exit(1);
}

function sqlitePathFromUrl(url: string): string {
	return url.startsWith('file:') ? url.slice('file:'.length) : url;
}

const sqlitePath = path.resolve(process.cwd(), sqlitePathFromUrl(DATABASE_URL));
const client = new Database(sqlitePath);
client.pragma('journal_mode = WAL');
client.pragma('foreign_keys = ON');

const db = drizzle(client, { schema });

const DEV_EMAIL = 'dev@example.com';
const DEV_PASSWORD = 'password';
const DEV_NAME = 'Dev Dietitian';
const DEV_USERNAME = 'devuser';
const DEV_PHONE = '+10000000000';
const ORG_NAME = 'Dev Organization';
const ORG_TYPE = 'clinic';

async function main() {
	const now = new Date().toISOString();
	const passwordHash = bcrypt.hashSync(DEV_PASSWORD, 10);

	const existing = await db
		.select()
		.from(schema.users)
		.where(eq(schema.users.email, DEV_EMAIL))
		.limit(1);

	let userId: number;

	if (existing[0]) {
		userId = existing[0].id;
		await db
			.update(schema.users)
			.set({
				password: passwordHash,
				name: DEV_NAME,
				username: DEV_USERNAME,
				phone: DEV_PHONE,
				updatedAt: now,
				emailVerifiedAt: now
			})
			.where(eq(schema.users.id, userId));
		console.log(`Updated dev user id=${userId} (${DEV_EMAIL})`);
	} else {
		const [row] = await db
			.insert(schema.users)
			.values({
				name: DEV_NAME,
				email: DEV_EMAIL,
				username: DEV_USERNAME,
				phone: DEV_PHONE,
				password: passwordHash,
				emailVerifiedAt: now,
				createdAt: now,
				updatedAt: now
			})
			.returning({ id: schema.users.id });
		userId = row.id;
		console.log(`Created dev user id=${userId} (${DEV_EMAIL})`);
	}

	let orgId: number;
	const orgExisting = await db
		.select()
		.from(schema.organizations)
		.where(eq(schema.organizations.name, ORG_NAME))
		.limit(1);
	if (orgExisting[0]) {
		orgId = orgExisting[0].id;
	} else {
		const [org] = await db
			.insert(schema.organizations)
			.values({
				name: ORG_NAME,
				type: ORG_TYPE,
				createdAt: now,
				updatedAt: now
			})
			.returning({ id: schema.organizations.id });
		orgId = org.id;
		console.log(`Created organization id=${orgId} (${ORG_NAME})`);
	}

	const memExisting = await db
		.select()
		.from(schema.memberships)
		.where(eq(schema.memberships.userId, userId))
		.limit(1);
	if (memExisting[0]) {
		await db
			.update(schema.memberships)
			.set({
				organizationId: orgId,
				roles: JSON.stringify(['dietitian']),
				updatedAt: now
			})
			.where(eq(schema.memberships.id, memExisting[0].id));
		console.log(`Updated membership id=${memExisting[0].id} for user ${userId}`);
	} else {
		await db.insert(schema.memberships).values({
			organizationId: orgId,
			userId,
			roles: JSON.stringify(['dietitian']),
			createdAt: now,
			updatedAt: now
		});
		console.log(`Created dietitian membership for user ${userId}`);
	}

	console.log(`Done. Sign in at /login with ${DEV_EMAIL} / ${DEV_PASSWORD}`);
}

main()
	.then(() => process.exit(0))
	.catch((e) => {
		console.error(e);
		process.exit(1);
	});
