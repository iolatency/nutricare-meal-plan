import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export type SqliteStorageSyncConfig = {
	supabaseUrl: string;
	serviceRoleKey: string;
	bucket: string;
	objectPath: string;
};

function normalizeSupabaseUrl(url: string): string {
	return url.replace(/\/$/, '');
}

function encodeStorageObjectPath(objectPath: string): string {
	return objectPath
		.split('/')
		.filter((p) => p.length > 0)
		.map(encodeURIComponent)
		.join('/');
}

function objectUrl(cfg: SqliteStorageSyncConfig): string {
	const base = normalizeSupabaseUrl(cfg.supabaseUrl);
	const pathEnc = encodeStorageObjectPath(cfg.objectPath);
	return `${base}/storage/v1/object/${encodeURIComponent(cfg.bucket)}/${pathEnc}`;
}

function authHeaders(serviceRoleKey: string): HeadersInit {
	return {
		Authorization: `Bearer ${serviceRoleKey}`,
		apikey: serviceRoleKey
	};
}

export function parseSqliteStorageSyncFromEnv(env: Record<string, string | undefined>): SqliteStorageSyncConfig | null {
	const on =
		env.SQLITE_STORAGE_SYNC === '1' ||
		env.SQLITE_STORAGE_SYNC === 'true' ||
		env.SQLITE_STORAGE_SYNC === 'yes';
	if (!on) return null;
	const supabaseUrl = env.SUPABASE_URL?.trim();
	const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
	const bucket = env.SQLITE_STORAGE_BUCKET?.trim();
	const objectPath = (env.SQLITE_STORAGE_OBJECT_PATH ?? 'nutricare.sqlite').trim();
	if (!supabaseUrl || !serviceRoleKey || !bucket) {
		throw new Error(
			'[db] SQLITE_STORAGE_SYNC is enabled but SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and SQLITE_STORAGE_BUCKET must all be set.'
		);
	}
	return { supabaseUrl, serviceRoleKey, bucket, objectPath };
}

/** Download remote DB into `absoluteLocalPath` when it exists; no-op on 404. */
export async function pullSqliteFromSupabaseStorage(
	cfg: SqliteStorageSyncConfig,
	absoluteLocalPath: string
): Promise<void> {
	mkdirSync(path.dirname(absoluteLocalPath), { recursive: true });

	const url = objectUrl(cfg);
	const res = await fetch(url, { headers: authHeaders(cfg.serviceRoleKey) });
	if (res.ok) {
		const buf = Buffer.from(await res.arrayBuffer());
		writeFileSync(absoluteLocalPath, buf);
		return;
	}
	if (res.status === 404) return;
	const errText = await res.text().catch(() => '');
	// Some Storage routes return 400 + JSON not_found instead of bare 404.
	if (res.status === 400 && /"error"\s*:\s*"not_found"|Object not found/i.test(errText)) {
		return;
	}
	throw new Error(`[db] Storage download failed (${res.status}): ${errText.slice(0, 200)}`);
}

/** Upload local DB file to Storage (upsert). */
export async function pushSqliteToSupabaseStorage(
	cfg: SqliteStorageSyncConfig,
	absoluteLocalPath: string
): Promise<void> {
	const body = readFileSync(absoluteLocalPath);
	const url = objectUrl(cfg);
	const res = await fetch(url, {
		method: 'POST',
		headers: {
			...authHeaders(cfg.serviceRoleKey),
			'Content-Type': 'application/octet-stream',
			'x-upsert': 'true'
		},
		body
	});
	if (!res.ok) {
		const text = await res.text().catch(() => '');
		throw new Error(`[db] Storage upload failed (${res.status}): ${text.slice(0, 200)}`);
	}
}
