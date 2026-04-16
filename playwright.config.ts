import { defineConfig } from '@playwright/test';

const useSystemChrome = process.env.PW_USE_SYSTEM_CHROME === '1' || process.env.CI === '1';

export default defineConfig({
	testDir: './tests/e2e',
	fullyParallel: true,
	retries: process.env.CI ? 1 : 0,
	use: {
		browserName: 'chromium',
		// Prefer system Chrome in constrained/sandboxed environments where bundled binaries may fail.
		...(useSystemChrome ? { channel: 'chrome' as const } : {}),
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
