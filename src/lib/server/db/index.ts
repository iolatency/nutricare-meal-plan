import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema';
import { building } from '$app/environment';
import { env } from '$env/dynamic/private';
import {
	parseSqliteStorageSyncFromEnv,
	pullSqliteFromSupabaseStorage,
	pushSqliteToSupabaseStorage,
	MissingRemoteSqliteError,
	type SqliteStorageSyncConfig
} from './sqlite-storage-sync';

if (!building && !env.DATABASE_URL) {
	throw new Error('DATABASE_URL is not set');
}

function sqlitePathFromUrl(url: string): string {
	return url.startsWith('file:') ? url.slice('file:'.length) : url;
}

function resolvedSqlitePath(databaseUrl: string): string {
	const tail = sqlitePathFromUrl(databaseUrl);
	if (tail === ':memory:' || databaseUrl === ':memory:') return ':memory:';
	return path.resolve(process.cwd(), tail);
}

function localDevSqliteEnabled(): boolean {
	const on =
		env.ALLOW_LOCAL_DEV_SQLITE === '1' ||
		env.ALLOW_LOCAL_DEV_SQLITE === 'true' ||
		env.ALLOW_LOCAL_DEV_SQLITE === 'yes';
	return process.env.NODE_ENV === 'development' && on;
}

function assertSupabaseOnlySqlitePath(absDbPath: string): void {
	if (localDevSqliteEnabled()) {
		if (absDbPath !== ':memory:') {
			mkdirSync(path.dirname(absDbPath), { recursive: true });
		}
		return;
	}
	if (absDbPath === ':memory:') {
		const allowInMemoryTests =
			(process.env.NODE_ENV === 'test' || process.env.CI === 'true') &&
			(env.ALLOW_IN_MEMORY_SQLITE_FOR_TESTS === '1' ||
				env.ALLOW_IN_MEMORY_SQLITE_FOR_TESTS === 'true');
		if (allowInMemoryTests) return;
		throw new Error('[db] DATABASE_URL=:memory: is not allowed in Supabase-only SQLite mode.');
	}
	if (!path.isAbsolute(absDbPath)) {
		throw new Error('[db] DATABASE_URL must resolve to an absolute path (example: file:/tmp/nutricare.db).');
	}
	if (!absDbPath.startsWith('/tmp/')) {
		throw new Error(
			`[db] DATABASE_URL must use /tmp in Supabase-only mode. Received "${absDbPath}".`
		);
	}
	mkdirSync(path.dirname(absDbPath), { recursive: true });
}

function sqliteBootstrapEnabled(): boolean {
	return (
		env.SQLITE_STORAGE_BOOTSTRAP === '1' ||
		env.SQLITE_STORAGE_BOOTSTRAP === 'true' ||
		env.SQLITE_STORAGE_BOOTSTRAP === 'yes'
	);
}

function sqliteNeedsSchemaBootstrap(absDbPath: string): boolean {
	let c: Database.Database | undefined;
	try {
		c = new Database(absDbPath);
		const row = c
			.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'users' LIMIT 1`)
			.get();
		return !row;
	} finally {
		c?.close();
	}
}

/** Fresh disk / empty file: apply TypeScript schema before SQL migrations (migrations assume base tables). */
function drizzlePushSqliteSchema() {
	const kit = path.join(process.cwd(), 'node_modules', 'drizzle-kit', 'bin.cjs');
	if (!existsSync(kit)) {
		throw new Error(
			'[db] Empty SQLite but drizzle-kit is missing (npm install drizzle-kit in dependencies for production).'
		);
	}
	const bootstrapConfig = path.join(process.cwd(), 'drizzle.bootstrap.config.ts');
	// --strict=false: no stdin prompts on Render/CI. Bootstrap config: verbose off (no huge SQL preview).
	const r = spawnSync(
		process.execPath,
		[kit, 'push', '--force', '--strict=false', '--config', bootstrapConfig],
		{
			cwd: process.cwd(),
			env: { ...process.env, CI: 'true' },
			stdio: 'inherit'
		}
	);
	if (r.error) throw r.error;
	if (r.status !== 0) {
		throw new Error(`[db] drizzle-kit push --force failed with exit ${r.status}`);
	}
	console.log(
		'[db] Empty-DB schema bootstrap finished. (drizzle-kit may print [✓] Changes applied above when SQL ran.)'
	);
}

/**
 * After `drizzle-kit push --force` bootstraps a fresh DB, the `__drizzle_migrations` table
 * is empty. Seed it with all journal entries so the migrator skips already-applied DDL.
 */
function seedMigrationsAfterBootstrap(absDbPath: string) {
	const journalPath = path.resolve(process.cwd(), 'drizzle', 'meta', '_journal.json');
	if (!existsSync(journalPath)) return;

	const journal = JSON.parse(readFileSync(journalPath, 'utf8'));
	const c = new Database(absDbPath);
	try {
		c.exec(`CREATE TABLE IF NOT EXISTS __drizzle_migrations (
			id SERIAL PRIMARY KEY,
			hash text NOT NULL,
			created_at numeric
		)`);

		const ins = c.prepare('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)');
		let count = 0;
		for (const entry of journal.entries) {
			const sqlPath = path.resolve(process.cwd(), 'drizzle', `${entry.tag}.sql`);
			if (!existsSync(sqlPath)) continue;
			const content = readFileSync(sqlPath);
			const hash = crypto.createHash('sha256').update(content).digest('hex');
			ins.run(hash, entry.when);
			count++;
		}
		console.log(`[db] Seeded __drizzle_migrations with ${count} entries after bootstrap.`);
	} finally {
		c.close();
	}
}

/** SvelteKit build loads server modules; never migrate or open the real DB file during `vite build` (avoids empty/partial DB errors on CI/Render). */
let sqliteFilePath = building ? ':memory:' : resolvedSqlitePath(env.DATABASE_URL!);

let sqliteStorageSyncCfg: SqliteStorageSyncConfig | null = null;
if (!building) {
	assertSupabaseOnlySqlitePath(sqliteFilePath);
	if (sqliteFilePath === ':memory:' || localDevSqliteEnabled()) {
		// Explicit test-only gate. Production/runtime paths must use Supabase Storage sync.
	} else {
		sqliteStorageSyncCfg = parseSqliteStorageSyncFromEnv(env);
		if (!sqliteStorageSyncCfg) {
			throw new Error(
				'[db] Supabase-only SQLite requires SQLITE_STORAGE_SYNC=1 with SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and SQLITE_STORAGE_BUCKET.'
			);
		}
		const allowBootstrap = sqliteBootstrapEnabled();
		let pulledRemote = false;
		try {
			pulledRemote = await pullSqliteFromSupabaseStorage(sqliteStorageSyncCfg, sqliteFilePath, {
				allowMissingRemote: allowBootstrap
			});
		} catch (error) {
			if (error instanceof MissingRemoteSqliteError) {
				throw error;
			}
			throw new Error(
				`[db] Failed to pull SQLite from Supabase Storage: ${
					error instanceof Error ? error.message : String(error)
				}`
			);
		}
		if (sqliteNeedsSchemaBootstrap(sqliteFilePath)) {
			if (!allowBootstrap && !pulledRemote) {
				throw new Error(
					'[db] SQLite bootstrap is blocked in strict mode. Upload an initialized remote DB or set SQLITE_STORAGE_BOOTSTRAP=1.'
				);
			}
			console.warn('[db] SQLite has no app tables yet; running drizzle-kit push --force…');
			drizzlePushSqliteSchema();
			seedMigrationsAfterBootstrap(sqliteFilePath);
			if (allowBootstrap) {
				await pushSqliteToSupabaseStorage(sqliteStorageSyncCfg, sqliteFilePath);
			}
		}
	}
}

/** When Storage sync is on, upload the on-disk SQLite file after each request (serverless-safe flush). */
export async function flushSqliteToSupabaseStorage(): Promise<void> {
	if (!sqliteStorageSyncCfg || sqliteFilePath === ':memory:') return;
	await pushSqliteToSupabaseStorage(sqliteStorageSyncCfg, sqliteFilePath);
}

const migrationsFolder = path.resolve(process.cwd(), 'drizzle');

function runSqliteMigrations(orm: ReturnType<typeof drizzle<typeof schema>>) {
	try {
		migrate(orm, { migrationsFolder });
	} catch (err: unknown) {
		const msg = err instanceof Error ? err.message : String(err);
		const causeMsg =
			err && typeof err === 'object' && 'cause' in err
				? String((err as { cause?: unknown }).cause ?? '')
				: '';
		const combined = `${msg}\n${causeMsg}`;
		// Migration can clash after a full schema push/reset (already-applied DDL).
		if (combined.includes('duplicate column name')) {
			console.warn('[db] Skipping already-applied migration step (duplicate column).');
		} else {
			throw err;
		}
	}
}

function applySqlitePragmas(c: Database.Database) {
	c.pragma('journal_mode = DELETE');
	c.pragma('foreign_keys = ON');
	c.pragma('busy_timeout = 8000');
}

function hasTableColumn(c: Database.Database, tableName: string, columnName: string): boolean {
	const safeTableName = tableName.replace(/'/g, "''");
	const rows = c
		.prepare(`SELECT name FROM pragma_table_info('${safeTableName}')`)
		.all() as Array<{ name: string }>;
	return rows.some((row) => row.name === columnName);
}

/**
 * Handles legacy schema drift in long-lived SQLite files before Drizzle migrations run.
 * Some older DBs miss columns referenced by later "rebuild table" migrations.
 */
function ensureLegacySchemaCompatibility(c: Database.Database) {
	if (!hasTableColumn(c, 'users', 'can_access_patient_app')) {
		console.warn('[db] users.can_access_patient_app missing; backfilling legacy column before migrations.');
		c.exec(
			"ALTER TABLE users ADD COLUMN can_access_patient_app INTEGER NOT NULL DEFAULT 1;"
		);
	}

	// Backfill late-added table on long-lived DBs where migrations were not fully applied.
	c.exec(`
		CREATE TABLE IF NOT EXISTS meal_plan_share_links (
			id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
			session_id integer NOT NULL,
			created_by integer NOT NULL,
			scope text NOT NULL,
			anchor_date text NOT NULL,
			token text NOT NULL,
			expires_at text NOT NULL,
			created_at text DEFAULT (datetime('now')) NOT NULL,
			revoked_at text,
			FOREIGN KEY (session_id) REFERENCES meal_plan_sessions(id) ON UPDATE no action ON DELETE cascade,
			FOREIGN KEY (created_by) REFERENCES users(id) ON UPDATE no action ON DELETE cascade
		);
		CREATE UNIQUE INDEX IF NOT EXISTS meal_plan_share_links_token_uidx
			ON meal_plan_share_links (token);
		CREATE INDEX IF NOT EXISTS meal_plan_share_links_session_idx
			ON meal_plan_share_links (session_id);
		CREATE INDEX IF NOT EXISTS meal_plan_share_links_expiry_idx
			ON meal_plan_share_links (expires_at);
	`);
}

let client: Database.Database = building ? new Database(':memory:') : new Database(sqliteFilePath);

export let db = drizzle(client, { schema });

if (!building) {
	applySqlitePragmas(client);
	ensureLegacySchemaCompatibility(client);
	runSqliteMigrations(db);

	const skipSeed =
		process.env.SKIP_DB_SEED === '1' || process.env.SKIP_DB_SEED === 'true';
	const forceSeed =
		process.env.RUN_DB_SEED_ON_START === '1' || process.env.RUN_DB_SEED_ON_START === 'true';

	if (!skipSeed) {
		let userCount = -1;
		try {
			const row = client.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number };
			userCount = Number(row.c);
		} catch {
			console.warn('[db] Could not read users count; skipping auto-seed.');
		}

		if (userCount >= 0 && (forceSeed || userCount === 0)) {
			const tsxCli = path.join(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs');
			const seedEntry = path.join(process.cwd(), 'scripts', 'seed.ts');
			if (!existsSync(tsxCli)) {
				console.warn(
					'[db] tsx is missing from node_modules; cannot auto-seed. On the host, run: npm run db:seed'
				);
			} else {
				if (userCount === 0) {
					console.warn(
						'[db] Empty database (no users); running seed (dietitian + patient accounts + meal catalog)…'
					);
				} else {
					console.warn('[db] RUN_DB_SEED_ON_START=1 set; re-running seed…');
				}
				client.close();
				const r = spawnSync(process.execPath, [tsxCli, seedEntry], {
					cwd: process.cwd(),
					env: { ...process.env, DATABASE_URL: `file:${sqliteFilePath}` },
					stdio: 'inherit'
				});
				if (r.error) throw r.error;
				if (r.status !== 0) {
					throw new Error(`[db] Auto-seed failed (exit ${r.status ?? 'unknown'})`);
				}
				client = new Database(sqliteFilePath);
				applySqlitePragmas(client);
				ensureLegacySchemaCompatibility(client);
				db = drizzle(client, { schema });
				runSqliteMigrations(db);
			}
		}
	}
}
