import { expect, test } from '@playwright/test';

const DIETITIAN_EMAIL = process.env.DIETITIAN_EMAIL ?? 'dietitian@example.com';
const DIETITIAN_PASS = process.env.DIETITIAN_PASSWORD ?? 'password';

test.describe('Supplements API authz', () => {
	test('rejects unauthenticated create supplement', async ({ request }) => {
		const response = await request.post('/api/supplements', {
			data: { name: 'Test Supplement' }
		});
		expect(response.status()).toBe(401);
	});

	test('allows dietitian to view foods page after login', async ({ page }) => {
		await page.goto('/login');
		await page.fill('#identifier', DIETITIAN_EMAIL);
		await page.fill('#password', DIETITIAN_PASS);
		await page.click('button[type="submit"]');
		await page.waitForURL(/\/dietitian/, { timeout: 30000 });
		await page.goto('/dietitian/foods');
		await page.waitForLoadState('domcontentloaded');
		// The foods page should load within the dietitian area
		await expect(page).toHaveURL(/\/dietitian/);
		await expect(page.locator('main')).toBeVisible();
	});
});
