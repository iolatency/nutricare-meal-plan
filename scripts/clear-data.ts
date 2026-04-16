/**
 * Clears all data from the database EXCEPT the users table.
 * Run with: DATABASE_URL=file:/tmp/nutricare.db npm run db:clear
 */
import path from 'node:path';
import Database from 'better-sqlite3';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
	console.error('DATABASE_URL is not set. Example: DATABASE_URL=file:/tmp/nutricare.db npm run db:clear');
	process.exit(1);
}

function sqlitePathFromUrl(url: string): string {
	return url.startsWith('file:') ? url.slice('file:'.length) : url;
}

const sqlitePath = path.resolve(process.cwd(), sqlitePathFromUrl(DATABASE_URL));
const client = new Database(sqlitePath);
client.pragma('journal_mode = DELETE');
client.pragma('foreign_keys = OFF'); // Disable FK checks during bulk delete

// Delete in child-first order to respect FK constraints
const tables = [
	'meal_tracking',
	'meals',
	'meal_days',
	'meal_plans',
	'meal_plan_sessions',
	'patient_diagnoses',
	'recipe_ingredients',
	'recipes',
	'recipe_categories',
	'food_items',
	'food_categories',
	'supplements',
	'auth_sessions',
	'registration_email_otp',
	'memberships',
	'organizations'
];

client.transaction(() => {
	for (const table of tables) {
		try {
			const result = client.prepare(`DELETE FROM "${table}"`).run();
			console.log(`  ✓ ${table}: ${result.changes} rows deleted`);
		} catch (e: unknown) {
			const msg = e instanceof Error ? e.message : String(e);
			if (msg.includes('no such table')) {
				console.log(`  - ${table}: table not found (skipped)`);
			} else {
				throw e;
			}
		}
	}
})();

client.pragma('foreign_keys = ON');
client.close();

console.log('\nDatabase cleared. Users table preserved.');
