import path from 'node:path';
import { unlink } from 'node:fs/promises';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
	console.error(
		'DATABASE_URL is not set. Example: DATABASE_URL=file:local.db npm run db:hard-reset'
	);
	process.exit(1);
}
const RESOLVED_DATABASE_URL = DATABASE_URL;

function sqlitePathFromUrl(url: string): string {
	return url.startsWith('file:') ? url.slice('file:'.length) : url;
}

async function removeIfExists(targetPath: string) {
	try {
		await unlink(targetPath);
		console.log(`  ✓ removed ${targetPath}`);
	} catch (err: unknown) {
		const msg = err instanceof Error ? err.message : String(err);
		if (msg.includes('no such file')) {
			console.log(`  - ${targetPath} not found (skipped)`);
			return;
		}
		throw err;
	}
}

async function main() {
	const dbPath = path.resolve(process.cwd(), sqlitePathFromUrl(RESOLVED_DATABASE_URL));
	console.log(`Hard-resetting SQLite database at: ${dbPath}`);
	await removeIfExists(dbPath);
	await removeIfExists(`${dbPath}-wal`);
	await removeIfExists(`${dbPath}-shm`);
	console.log('Database files removed.');
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
