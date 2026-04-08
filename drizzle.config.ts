import { defineConfig } from 'drizzle-kit';

const url = process.env.DATABASE_URL;
if (!url) {
	throw new Error('Set DATABASE_URL (e.g. in .env) for drizzle-kit');
}

export default defineConfig({
	schema: './src/lib/server/db/schema/index.ts',
	dialect: 'sqlite',
	dbCredentials: { url },
	strict: true,
	verbose: true
});
