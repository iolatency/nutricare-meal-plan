import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { and, desc, eq } from 'drizzle-orm';
import * as schema from '../src/lib/server/db/schema';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
	console.error('DATABASE_URL is not set. Example: DATABASE_URL=file:/tmp/nutricare.db npx tsx scripts/seed-demo-daily-logs.ts');
	process.exit(1);
}

function sqlitePathFromUrl(url: string): string {
	return url.startsWith('file:') ? url.slice('file:'.length) : url;
}

const sqlitePath = path.resolve(process.cwd(), sqlitePathFromUrl(DATABASE_URL));
const client = new Database(sqlitePath);
client.pragma('journal_mode = DELETE');
client.pragma('foreign_keys = ON');

const db = drizzle(client, { schema });

const DAYS = parseInt(process.env.SEED_DAYS ?? '21', 10);
const BASE_WEIGHT = parseFloat(process.env.SEED_BASE_WEIGHT ?? '82');
const PATIENT_EMAIL = process.env.SEED_PATIENT_EMAIL ?? 'patient@example.com';

async function main() {
	const patient = db
		.select({ id: schema.users.id, name: schema.users.name })
		.from(schema.users)
		.where(eq(schema.users.email, PATIENT_EMAIL))
		.get();

	if (!patient) {
		console.error(`Patient "${PATIENT_EMAIL}" not found. Run seed-patients first.`);
		process.exit(1);
	}

	const session = db
		.select()
		.from(schema.mealPlanSessions)
		.where(eq(schema.mealPlanSessions.clientId, patient.id))
		.orderBy(desc(schema.mealPlanSessions.id))
		.limit(1)
		.get();

	if (!session) {
		console.error(`No meal plan session found for patient ${patient.id}. Create a session first.`);
		process.exit(1);
	}

	console.log(`Seeding ${DAYS} days of demo logs for patient "${patient.name}" (id=${patient.id}), session=${session.id}`);
	console.log(`Base weight: ${BASE_WEIGHT} kg`);

	const today = new Date();
	let inserted = 0;
	let updated = 0;

	for (let i = DAYS; i >= 0; i--) {
		const d = new Date(today);
		d.setDate(d.getDate() - i);
		const dateStr = d.toISOString().split('T')[0];

		const weight = Math.round((BASE_WEIGHT - (DAYS - i) * 0.15 + (Math.random() - 0.5) * 0.6) * 10) / 10;
		const waterCups = Math.floor(Math.random() * 5) + 4;
		const adherenceScore = Math.floor(Math.random() * 30) + 70;
		const completed = i > 0;

		const existing = db
			.select()
			.from(schema.dailyLogs)
			.where(and(eq(schema.dailyLogs.sessionId, session.id), eq(schema.dailyLogs.date, dateStr)))
			.get();

		if (existing) {
			db.update(schema.dailyLogs)
				.set({ weight, waterCups, adherenceScore, completed })
				.where(eq(schema.dailyLogs.id, existing.id))
				.run();
			updated++;
		} else {
			db.insert(schema.dailyLogs)
				.values({
					sessionId: session.id,
					clientId: patient.id,
					date: dateStr,
					weight,
					waterCups,
					adherenceScore,
					completed
				})
				.run();
			inserted++;
		}

		const tag = completed ? 'done' : 'today';
		console.log(`  ${dateStr}  w=${weight}kg  water=${waterCups}  adh=${adherenceScore}%  [${tag}]`);
	}

	console.log(`\nDone: ${inserted} inserted, ${updated} updated.`);
}

main()
	.then(() => process.exit(0))
	.catch((e) => {
		console.error(e);
		process.exit(1);
	});
