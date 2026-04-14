/// <reference types="node" />
import { defineConfig } from 'drizzle-kit';

/**
 * Used only by server empty-DB bootstrap (`drizzlePushSqliteSchema` in db/index.ts).
 * `verbose: false` avoids the large "You are about to execute current statements" dump on Render/CI.
 * For local exploration, use `npm run db:push` with drizzle.config.ts (verbose: true).
 */
const url = process.env.DATABASE_URL;
if (!url) {
	throw new Error('Set DATABASE_URL (e.g. in .env) for drizzle-kit');
}

export default defineConfig({
	schema: './src/lib/server/db/schema/index.ts',
	dialect: 'sqlite',
	dbCredentials: { url },
	strict: false,
	verbose: false
});
