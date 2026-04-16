import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

type StorageProvider = 'local' | 'object_store';

type ObjectStoreConfig = {
	baseUrl: string;
	serviceKey: string;
	bucket: string;
	publicBaseUrl: string;
};

const IMAGE_MIME_EXT: Record<string, string> = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp'
};

const DEFAULT_LOCAL_UPLOADS_ROOT = path.join(process.cwd(), 'static', 'uploads');
const DEFAULT_PUBLIC_UPLOADS_PREFIX = '/uploads';

function localDevFileStorageEnabled(): boolean {
	const on =
		process.env.ALLOW_LOCAL_DEV_FILE_STORAGE === '1' ||
		process.env.ALLOW_LOCAL_DEV_FILE_STORAGE === 'true' ||
		process.env.ALLOW_LOCAL_DEV_FILE_STORAGE === 'yes';
	return process.env.NODE_ENV === 'development' && on;
}

function normalizePublicPrefix(prefix: string): string {
	const trimmed = prefix.trim();
	if (!trimmed) return DEFAULT_PUBLIC_UPLOADS_PREFIX;
	const withLeading = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
	return withLeading.replace(/\/+$/, '');
}

function localUploadsRoot(): string {
	const configured = process.env.FILE_STORAGE_LOCAL_DIR?.trim();
	if (!configured) return DEFAULT_LOCAL_UPLOADS_ROOT;
	return path.isAbsolute(configured) ? configured : path.resolve(process.cwd(), configured);
}

function publicUploadsPrefix(): string {
	return normalizePublicPrefix(process.env.FILE_STORAGE_PUBLIC_PREFIX ?? DEFAULT_PUBLIC_UPLOADS_PREFIX);
}

function objectKeyPrefix(): string {
	return (process.env.FILE_STORAGE_OBJECT_PREFIX ?? '').trim().replace(/^\/+|\/+$/g, '');
}

function withObjectKeyPrefix(objectPath: string): string {
	const base = objectPath.replace(/^\/+/, '');
	const prefix = objectKeyPrefix();
	return prefix ? `${prefix}/${base}` : base;
}

function normalizeBaseUrl(url: string): string {
	return url.replace(/\/$/, '');
}

function encodeObjectPath(objectPath: string): string {
	return objectPath
		.split('/')
		.filter((part) => part.length > 0)
		.map(encodeURIComponent)
		.join('/');
}

function readProvider(): StorageProvider {
	const raw = (process.env.FILE_STORAGE_PROVIDER ?? 'supabase').trim().toLowerCase();
	if (raw === 'supabase' || raw === 'object_store') return 'object_store';
	if (raw === 'local' && localDevFileStorageEnabled()) return 'local';
	throw new Error(
		`[storage] FILE_STORAGE_PROVIDER="${raw}" is not allowed. Use supabase by default, or enable ALLOW_LOCAL_DEV_FILE_STORAGE=1 in development.`
	);
}

function readObjectStoreConfig(): ObjectStoreConfig {
	if (readProvider() !== 'object_store') {
		throw new Error('[storage] Only object_store provider is supported.');
	}
	// Current object-store implementation uses Supabase Storage env vars.
	const supabaseUrl = process.env.SUPABASE_URL?.trim();
	const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
	const bucket = (process.env.SUPABASE_STORAGE_BUCKET ?? process.env.SQLITE_STORAGE_BUCKET)?.trim();
	if (!supabaseUrl || !serviceRoleKey || !bucket) {
		throw new Error(
			'[storage] Missing Supabase Storage configuration. Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and SUPABASE_STORAGE_BUCKET (or SQLITE_STORAGE_BUCKET).'
		);
	}
	const base = normalizeBaseUrl(supabaseUrl);
	return {
		baseUrl: base,
		serviceKey: serviceRoleKey,
		bucket,
		publicBaseUrl: `${base}/storage/v1/object/public/${encodeURIComponent(bucket)}`
	};
}

function authHeaders(serviceKey: string): HeadersInit {
	return {
		Authorization: `Bearer ${serviceKey}`,
		apikey: serviceKey
	};
}

function uploadUrl(cfg: ObjectStoreConfig, objectPath: string): string {
	return `${cfg.baseUrl}/storage/v1/object/${encodeURIComponent(cfg.bucket)}/${encodeObjectPath(objectPath)}`;
}

function objectPublicUrl(cfg: ObjectStoreConfig, objectPath: string): string {
	return `${cfg.publicBaseUrl}/${encodeObjectPath(objectPath)}`;
}

async function uploadImageToLocalDisk(params: {
	file: File;
	folder: string;
}): Promise<{ url: string | null; error?: string }> {
	const ext = IMAGE_MIME_EXT[params.file.type] ?? 'jpg';
	const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
	const uploadsDir = path.join(localUploadsRoot(), params.folder);
	const fullPath = path.join(uploadsDir, filename);
	await mkdir(uploadsDir, { recursive: true });
	const body = Buffer.from(await params.file.arrayBuffer());
	await writeFile(fullPath, body);
	return { url: `${publicUploadsPrefix()}/${params.folder}/${filename}` };
}

export async function uploadImage(params: {
	file: File;
	folder: string;
}): Promise<{ url: string | null; error?: string }> {
	try {
		if (readProvider() === 'local') {
			return await uploadImageToLocalDisk(params);
		}
		const cfg = readObjectStoreConfig();
		const ext = IMAGE_MIME_EXT[params.file.type] ?? 'jpg';
		const objectPath = withObjectKeyPrefix(
			`${params.folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
		);
		const body = Buffer.from(await params.file.arrayBuffer());
		const res = await fetch(uploadUrl(cfg, objectPath), {
			method: 'POST',
			headers: {
				...authHeaders(cfg.serviceKey),
				'Content-Type': params.file.type || 'application/octet-stream',
				'x-upsert': 'true'
			},
			body
		});
		if (!res.ok) {
			const text = await res.text().catch(() => '');
			console.error(`[storage] Supabase upload failed: ${res.status} ${res.statusText}`, text);
			return { url: null, error: `تعذر رفع الصورة (${res.status}) ${text.slice(0, 120)}` };
		}
		return { url: objectPublicUrl(cfg, objectPath) };
	} catch (err) {
		console.error('[storage] uploadImage threw:', err);
		return { url: null, error: 'تعذر رفع الصورة، يرجى المحاولة مرة أخرى' };
	}
}

export async function deleteImageByUrl(publicUrl: string | null | undefined): Promise<void> {
	if (!publicUrl) return;
	if (readProvider() === 'local') {
		const prefix = `${publicUploadsPrefix()}/`;
		if (!publicUrl.startsWith(prefix)) return;
		const rel = publicUrl.slice(prefix.length);
		const safe = rel.split('/').every((part) => /^[a-zA-Z0-9._-]+$/.test(part));
		if (!safe) return;
		const full = path.join(localUploadsRoot(), rel);
		await unlink(full).catch(() => {});
		return;
	}
	const cfg = readObjectStoreConfig();
	if (publicUrl.startsWith(cfg.publicBaseUrl + '/')) {
		const withoutQuery = publicUrl.split('?')[0]?.split('#')[0] ?? publicUrl;
		const objectPath = withoutQuery.slice((cfg.publicBaseUrl + '/').length);
		if (!objectPath) return;
		await fetch(
			`${cfg.baseUrl}/storage/v1/object/${encodeURIComponent(cfg.bucket)}/${encodeObjectPath(objectPath)}`,
			{
				method: 'DELETE',
				headers: authHeaders(cfg.serviceKey)
			}
		).catch(() => {});
	}
}
