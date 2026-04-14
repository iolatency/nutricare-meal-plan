import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
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

/** Ensure parent dir exists (e.g. Render disk mount at `/var/data/...` may be empty until mkdir). */
function ensureSqliteParentDir(absDbPath: string) {
	if (absDbPath === ':memory:') return;
	mkdirSync(path.dirname(absDbPath), { recursive: true });
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
	console.warn(
		'[db] Empty-DB schema bootstrap finished. (drizzle-kit may print [✓] Changes applied above when SQL ran.)'
	);
}

/** SvelteKit build loads server modules; never migrate or open the real DB file during `vite build` (avoids empty/partial DB errors on CI/Render). */
const sqliteFilePath = building ? ':memory:' : resolvedSqlitePath(env.DATABASE_URL!);

let sqliteStorageSyncCfg: SqliteStorageSyncConfig | null = null;
if (!building && sqliteFilePath !== ':memory:') {
	sqliteStorageSyncCfg = parseSqliteStorageSyncFromEnv(env);
	if (sqliteStorageSyncCfg) {
		await pullSqliteFromSupabaseStorage(sqliteStorageSyncCfg, sqliteFilePath);
	}
	ensureSqliteParentDir(sqliteFilePath);
	if (sqliteNeedsSchemaBootstrap(sqliteFilePath)) {
		console.warn('[db] SQLite has no app tables yet; running drizzle-kit push --force…');
		drizzlePushSqliteSchema();
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
		// Legacy migration can clash after a full schema push/reset (already-applied DDL).
		if (combined.includes('duplicate column name: image_url')) {
			console.warn('[db] Skipping legacy migration step (duplicate image_url column).');
		} else if (
			combined.includes('no such column: "remember_token"') ||
			combined.includes('no such column: remember_token')
		) {
			// Migration 0003 drops columns that were never present in bootstrap-created DBs (fresh dev/test).
			console.warn(
				'[db] Skipping legacy drop-columns migration (columns already absent in schema).'
			);
		} else {
			throw err;
		}
	}
}

function applySqlitePragmas(c: Database.Database) {
	// WAL creates -wal/-shm siblings; Storage sync keeps a single portable .db file.
	c.pragma(sqliteStorageSyncCfg ? 'journal_mode = DELETE' : 'journal_mode = WAL');
	c.pragma('foreign_keys = ON');
	c.pragma('busy_timeout = 8000');
}

let client: Database.Database = building ? new Database(':memory:') : new Database(sqliteFilePath);

export let db = drizzle(client, { schema });

if (!building) {
	applySqlitePragmas(client);
	runSqliteMigrations(db);

	const skipSeed = process.env.SKIP_DB_SEED === '1' || process.env.SKIP_DB_SEED === 'true';
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
					env: { ...process.env, DATABASE_URL: env.DATABASE_URL! },
					stdio: 'inherit'
				});
				if (r.error) throw r.error;
				if (r.status !== 0) {
					throw new Error(`[db] Auto-seed failed (exit ${r.status ?? 'unknown'})`);
				}
				client = new Database(sqliteFilePath);
				applySqlitePragmas(client);
				db = drizzle(client, { schema });
				runSqliteMigrations(db);
			}
		}
	}
}
