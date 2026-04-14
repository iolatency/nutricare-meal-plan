/**
 * Drops and recreates the `public` schema on Postgres (Supabase) — removes all tables,
 * data, and migration history in `public`. Does not touch `auth` / `storage` schemas.
 *
 *   CONFIRM_FLUSH_SUPABASE=yes npm run db:flush-supabase
 */
import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
const confirmed = process.env.CONFIRM_FLUSH_SUPABASE === 'yes';

if (!DATABASE_URL) {
	console.error('DATABASE_URL is not set.');
	process.exit(1);
}
if (!DATABASE_URL.startsWith('postgres')) {
	console.error('DATABASE_URL must be Postgres (Supabase). For SQLite use: npm run db:hard-reset');
	process.exit(1);
}
if (!confirmed) {
	console.error(
		'Refusing without CONFIRM_FLUSH_SUPABASE=yes (this destroys all tables in public).'
	);
	process.exit(1);
}

const sql = `
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON SCHEMA public TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;
`;

async function main() {
	const client = new pg.Client({
		connectionString: DATABASE_URL,
		ssl: DATABASE_URL.includes('supabase.com') ? { rejectUnauthorized: false } : undefined
	});
	await client.connect();
	console.log('Flushing schema public (DROP + CREATE)…');
	await client.query(sql);
	await client.end();
	console.log(
		'Done. public is empty; recreate tables (e.g. drizzle push for Postgres) before using the app.'
	);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
