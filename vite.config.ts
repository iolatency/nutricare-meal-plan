import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	test: {
		include: ['src/**/*.test.ts'],
		environment: 'node',
		fileParallelism: false,
		coverage: {
			provider: 'v8',
			include: ['src/lib/**'],
			exclude: ['src/lib/server/db/**', 'src/lib/assets/**']
		}
	}
});
