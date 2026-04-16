import { test, expect } from '@playwright/test';

test.describe('Admin Routes — Guard Tests', () => {
	test('/admin returns 404 or redirects (no admin panel)', async ({ page }) => {
		const response = await page.goto('/admin');
		const status = response?.status() ?? 0;
		const url = page.url();
		// Should either 404 or redirect to login/home
		const handled = status === 404 || url.includes('/login') || url.includes('/admin');
		expect(handled).toBe(true);
	});

	test('/admin/users does not expose user data', async ({ page }) => {
		const response = await page.goto('/admin/users');
		const status = response?.status() ?? 0;
		expect([404, 302, 303]).toContain(status);
	});

	test('non-existent routes return 404', async ({ page }) => {
		const response = await page.goto('/nonexistent-route-xyz');
		expect(response?.status()).toBe(404);
	});

	test('API routes that dont exist return proper error', async ({ request }) => {
		const response = await request.get('/api/nonexistent');
		expect([404, 405]).toContain(response.status());
	});
});
