import { expect, test } from '@playwright/test';

test.describe('Patient dashboard protections', () => {
	test('unauthenticated access is denied', async ({ page }) => {
		// Playwright follows redirects by default, so we navigate and assert the final URL
		await page.goto('/patient/dashboard/1');
		await expect(page).toHaveURL(/\/login/);
	});
});
