import adapterNode from '@sveltejs/adapter-node';
import adapterVercel from '@sveltejs/adapter-vercel';

/** Vercel sets `VERCEL` during build; adapter-node outputs `build/` which Vercel does not treat as a deployable web app (expects adapter output / SvelteKit preset). */
const adapter = process.env.VERCEL ? adapterVercel() : adapterNode();

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
	},
	kit: {
		adapter
	}
};

export default config;
