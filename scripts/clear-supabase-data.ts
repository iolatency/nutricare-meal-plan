/**
 * Truncates all application tables on Postgres (e.g. Supabase).
 * Does nothing for SQLite DATABASE_URL.
 *
 * Usage:
 *   CONFIRM_CLEAR_SUPABASE=yes npm run db:clear-supabase
 *
 * Loads DATABASE_URL from the environment (use `node --env-file=.env` via npm script).
 */
import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
const confirmed = process.env.CONFIRM_CLEAR_SUPABASE === 'yes';

if (!DATABASE_URL) {
	console.error(
		'DATABASE_URL is not set. Use: CONFIRM_CLEAR_SUPABASE=yes npm run db:clear-supabase'
	);
	process.exit(1);
}

if (!DATABASE_URL.startsWith('postgres://') && !DATABASE_URL.startsWith('postgresql://')) {
	console.error(
		'DATABASE_URL must be a Postgres URL (postgresql://...). For SQLite, use: npm run db:clear'
	);
	process.exit(1);
}

if (!confirmed) {
	console.error(
		'Refusing to run without CONFIRM_CLEAR_SUPABASE=yes (this deletes all rows in listed tables).'
	);
	console.error('Run: CONFIRM_CLEAR_SUPABASE=yes npm run db:clear-supabase');
	process.exit(1);
}

/** Child-first order; matches app schema in `src/lib/server/db/schema`. */
const TABLES = [
	'chat_messages',
	'chat_conversations',
	'meal_tracking',
	'meals',
	'meal_days',
	'meal_plans',
	'meal_plan_sessions',
	'patient_diagnoses',
	'daily_logs',
	'recipe_ingredients',
	'recipes',
	'recipe_categories',
	'user_food_imports',
	'food_items',
	'external_food_catalog',
	'food_categories',
	'supplements',
	'auth_sessions',
	'registration_email_otp',
	'memberships',
	'organizations',
	'users'
] as const;

async function main() {
	const client = new pg.Client({
		connectionString: DATABASE_URL,
		ssl: DATABASE_URL.includes('supabase.com') ? { rejectUnauthorized: false } : undefined
	});
	await client.connect();
	console.log('Connected. Truncating tables (Postgres)…\n');

	try {
		// No single transaction: a missing table would abort the whole batch in Postgres.
		for (const table of TABLES) {
			try {
				await client.query(`TRUNCATE TABLE ${pg.escapeIdentifier(table)} RESTART IDENTITY CASCADE`);
				console.log(`  ✓ ${table}`);
			} catch (e: unknown) {
				const msg = e instanceof Error ? e.message : String(e);
				if (msg.includes('does not exist')) {
					console.log(`  - ${table}: not found (skipped)`);
				} else {
					throw e;
				}
			}
		}
	} finally {
		await client.end();
	}

	console.log('\nDone. All listed tables are empty (including users).');
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
