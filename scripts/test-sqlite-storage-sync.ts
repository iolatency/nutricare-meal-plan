/**
 * Verify Supabase Storage pull/push for the SQLite mirror (same logic as src/lib/server/db/sqlite-storage-sync.ts).
 *
 * Run (adds storage flags; reuses SUPABASE_* from .env):
 *   SQLITE_STORAGE_SYNC=1 SQLITE_STORAGE_BUCKET=media SQLITE_STORAGE_OBJECT_PATH=nutricare.sqlite \
 *     node --env-file=.env --import tsx scripts/test-sqlite-storage-sync.ts
 *
 * Uses ./local.db as upload payload if it exists; otherwise a tiny placeholder file.
 */
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
	parseSqliteStorageSyncFromEnv,
	pullSqliteFromSupabaseStorage,
	pushSqliteToSupabaseStorage
} from '../src/lib/server/db/sqlite-storage-sync.ts';

const root = path.resolve(import.meta.dirname, '..');
const cfg = parseSqliteStorageSyncFromEnv(process.env as Record<string, string | undefined>);
if (!cfg) {
	console.error(
		'[test] Storage sync not configured. Set SQLITE_STORAGE_SYNC=1, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SQLITE_STORAGE_BUCKET (and optional SQLITE_STORAGE_OBJECT_PATH).'
	);
	process.exit(1);
}

console.log('[test] Config:', {
	bucket: cfg.bucket,
	objectPath: cfg.objectPath,
	supabaseHost: new URL(cfg.supabaseUrl).host
});

const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'nutricare-storage-test-'));
const pulledPath = path.join(tmpDir, 'pulled.db');

console.log('[test] Pull from Storage →', pulledPath);
await pullSqliteFromSupabaseStorage(cfg, pulledPath);
const pulledSize = existsSync(pulledPath) ? readFileSync(pulledPath).length : 0;
console.log('[test] Pull result:', pulledSize > 0 ? `file written (${pulledSize} bytes)` : 'no remote object (404) — skipped write');

const sourceForPush = path.join(root, 'local.db');
let payloadPath: string;
if (existsSync(sourceForPush)) {
	payloadPath = path.join(tmpDir, 'push.db');
	copyFileSync(sourceForPush, payloadPath);
	console.log('[test] Push payload: copy of local.db →', payloadPath);
} else {
	payloadPath = path.join(tmpDir, 'tiny.db');
	writeFileSync(payloadPath, Buffer.from('SQLite format 3\x00'));
	console.log('[test] Push payload: minimal placeholder (no local.db)');
}

console.log('[test] Push to Storage (upsert)…');
await pushSqliteToSupabaseStorage(cfg, payloadPath);
console.log('[test] Push OK.');

console.log('[test] Pull again to confirm round-trip…');
const roundTrip = path.join(tmpDir, 'roundtrip.db');
await pullSqliteFromSupabaseStorage(cfg, roundTrip);
const rt = existsSync(roundTrip) ? readFileSync(roundTrip).length : 0;
console.log('[test] Round-trip file size:', rt, 'bytes');

process.exit(0);
