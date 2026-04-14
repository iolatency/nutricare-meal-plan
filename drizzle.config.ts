import { defineConfig } from 'drizzle-kit';

const url = process.env.DATABASE_URL;
if (!url) {
	throw new Error('Set DATABASE_URL (e.g. in .env) for drizzle-kit');
}

export default defineConfig({
	schema: './src/lib/server/db/schema/index.ts',
	dialect: 'sqlite',
	dbCredentials: { url },
	// If true, `drizzle-kit push` waits for stdin — breaks empty-DB bootstrap on Render.
	strict: false,
	// Verbose SQL preview for local `npm run db:push`. Render bootstrap uses drizzle.bootstrap.config.ts (quiet).
	verbose: true
});
