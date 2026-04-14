import { defineConfig } from '@playwright/test';

export default defineConfig({
	testDir: './tests',
	testMatch: ['**/e2e/**/*.spec.ts', '**/security/**/*.spec.ts'],
	use: {
		baseURL: 'http://localhost:5173',
		navigationTimeout: 30000,
		actionTimeout: 10000
	},
	webServer: {
		command: 'npm run dev',
		url: 'http://localhost:5173',
		reuseExistingServer: !process.env.CI
	}
});
