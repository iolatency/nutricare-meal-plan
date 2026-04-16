/**
 * One-time cleanup before applying partial unique indexes on meal_plan_sessions.
 * For each (client_id, dietitian_id), keeps the newest row (max id) per status
 * and marks older duplicates as completed.
 *
 * Run: DATABASE_URL=file:/tmp/nutricare.db npx tsx scripts/dedupe-meal-plan-sessions.ts
 */
import path from 'node:path';
import Database from 'better-sqlite3';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
	console.error(
		'DATABASE_URL is not set. Example: DATABASE_URL=file:/tmp/nutricare.db npx tsx scripts/dedupe-meal-plan-sessions.ts'
	);
	process.exit(1);
}

function sqlitePathFromUrl(url: string): string {
	return url.startsWith('file:') ? url.slice('file:'.length) : url;
}

const sqlitePath = path.resolve(process.cwd(), sqlitePathFromUrl(DATABASE_URL));
const client = new Database(sqlitePath);
client.pragma('journal_mode = DELETE');
client.pragma('foreign_keys = ON');

const demoteSql = `
UPDATE meal_plan_sessions AS m
SET status = 'completed'
WHERE m.status = ?
AND m.id < (
	SELECT MAX(m2.id)
	FROM meal_plan_sessions AS m2
	WHERE m2.client_id = m.client_id
	  AND m2.dietitian_id = m.dietitian_id
	  AND m2.status = ?
);
`;

for (const status of ['active', 'draft'] as const) {
	const info = client.prepare(demoteSql).run(status, status);
	console.log(`Demoted ${info.changes} duplicate "${status}" session row(s).`);
}

client.close();
console.log('Done.');
