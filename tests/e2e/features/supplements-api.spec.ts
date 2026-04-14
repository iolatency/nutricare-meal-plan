import { expect, test } from '@playwright/test';

test.describe('Supplements API authz', () => {
	test('rejects unauthenticated create supplement', async ({ request }) => {
		const response = await request.post('/api/supplements', {
			data: { name: 'Test Supplement' }
		});
		expect(response.status()).toBe(401);
	});

	test('allows dietitian to view foods page after login', async ({ page }) => {
		await page.goto('/login');
		await page.fill('#identifier', 'dev@example.com');
		await page.fill('#password', 'password');
		await page.click('button[type="submit"]');
		// Wait for the post-login redirect to complete before navigating further
		await expect(page).not.toHaveURL(/\/login/, { timeout: 8000 });
		await page.goto('/dietitian/foods');
		await expect(page).toHaveURL(/\/dietitian\/foods/);
		await expect(page).toHaveTitle(/الأطعمة/);
	});
});
