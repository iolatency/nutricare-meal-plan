import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import * as schema from '../src/lib/server/db/schema';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
	console.error(
		'DATABASE_URL is not set. Example: DATABASE_URL=file:local.db npx tsx scripts/seed-patients.ts'
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

/** Single patient account for the dev org (no demo personas). Override via env on deploy if needed. */
const PATIENT = {
	name: process.env.SEED_PATIENT_NAME ?? 'Patient',
	email: process.env.SEED_PATIENT_EMAIL ?? 'patient@example.com',
	username: process.env.SEED_PATIENT_USERNAME ?? 'patient',
	phone: process.env.SEED_PATIENT_PHONE?.trim() || null
};

async function main() {
	const now = new Date().toISOString();
	const patientPassword = process.env.SEED_PATIENT_PASSWORD ?? 'password';
	const passwordHash = bcrypt.hashSync(patientPassword, 10);

	// Find the dev dietitian's organization
	const devUser = await db
		.select()
		.from(schema.users)
		.where(eq(schema.users.email, 'dev@example.com'))
		.limit(1);

	if (!devUser[0]) {
		console.error('Dev dietitian not found. Run npm run db:seed-dev-user first.');
		process.exit(1);
	}

	const devMembership = await db
		.select()
		.from(schema.memberships)
		.where(eq(schema.memberships.userId, devUser[0].id))
		.limit(1);

	if (!devMembership[0]) {
		console.error('Dev dietitian has no membership. Run npm run db:seed-dev-user first.');
		process.exit(1);
	}

	const orgId = devMembership[0].organizationId;
	console.log(`Using organization id=${orgId}`);

	const p = PATIENT;
	const existing = await db
		.select()
		.from(schema.users)
		.where(eq(schema.users.email, p.email))
		.limit(1);

	let userId: number;

	if (existing[0]) {
		userId = existing[0].id;
		await db
			.update(schema.users)
			.set({
				name: p.name,
				username: p.username,
				phone: p.phone,
				updatedAt: now,
				emailVerifiedAt: now
			})
			.where(eq(schema.users.id, userId));
		console.log(`Patient already exists; updated profile id=${userId} (${p.email})`);
	} else {
		const [row] = await db
			.insert(schema.users)
			.values({
				name: p.name,
				email: p.email,
				username: p.username,
				phone: p.phone,
				password: passwordHash,
				emailVerifiedAt: now,
				createdAt: now,
				updatedAt: now
			})
			.returning({ id: schema.users.id });
		userId = row.id;
		console.log(`Created patient "${p.name}" (id=${userId})`);
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
				roles: JSON.stringify(['patient']),
				updatedAt: now
			})
			.where(eq(schema.memberships.id, memExisting[0].id));
		console.log(`Updated patient membership for user ${userId} in org ${orgId}`);
	} else {
		await db.insert(schema.memberships).values({
			organizationId: orgId,
			userId,
			roles: JSON.stringify(['patient']),
			createdAt: now,
			updatedAt: now
		});
		console.log(`Created patient membership for user ${userId} in org ${orgId}`);
	}

	console.log(
		`\nDone. Patient: ${p.email} (password: SEED_PATIENT_PASSWORD env or default "password" on first create only)`
	);
}

main()
	.then(() => process.exit(0))
	.catch((e) => {
		console.error(e);
		process.exit(1);
	});
