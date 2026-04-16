import path, { resolve } from 'node:path';
import Database from 'better-sqlite3';

const DATABASE_URL = process.env.DATABASE_URL;
const SOURCE = process.env.NUTRICARE_V0_DB;

if (!DATABASE_URL) {
	console.error('Set DATABASE_URL (target SQLite DB, e.g. file:/tmp/nutricare.db)');
	process.exit(1);
}
if (!SOURCE) {
	console.error('Set NUTRICARE_V0_DB to the path of nutricare_v0.2.sqlite');
	process.exit(1);
}

const sourcePath = resolve(SOURCE);

function sqlitePathFromUrl(url: string): string {
	return url.startsWith('file:') ? url.slice('file:'.length) : url;
}

const targetPath = path.resolve(process.cwd(), sqlitePathFromUrl(DATABASE_URL));

/** Order respects typical FK dependencies within v0.2 */
const TABLES = [
	'migrations',
	'users',
	'password_reset_tokens',
	'organizations',
	'sessions',
	'cache',
	'cache_locks',
	'jobs',
	'job_batches',
	'failed_jobs',
	'inputs',
	'calculations',
	'calculation_dependencies',
	'patients',
	'memberships',
	'patient_visits',
	'patient_logs'
] as const;

function main() {
	const db = new Database(targetPath);
	db.pragma('foreign_keys = OFF');

	const escaped = sourcePath.replace(/'/g, "''");
	db.exec(`ATTACH DATABASE '${escaped}' AS v0`);

	for (const table of TABLES) {
		try {
			db.exec(`INSERT OR REPLACE INTO main.${table} SELECT * FROM v0.${table}`);
			const row = db.prepare(`SELECT COUNT(*) AS c FROM main.${table}`).get() as { c: number };
			console.log(`[import] ${table}: ${row.c} rows in target`);
		} catch (e) {
			console.error(`[import] failed table ${table}:`, e);
			throw e;
		}
	}

	db.exec('DETACH DATABASE v0');
	db.pragma('foreign_keys = ON');
	db.close();
	console.log('[import] complete');
}

try {
	main();
	process.exit(0);
} catch {
	process.exit(1);
}
