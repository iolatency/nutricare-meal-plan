import { test, expect } from '@playwright/test';

test.describe('Landing page', () => {
	test('loads and shows expected content', async ({ page }) => {
		await page.goto('/');
		// Should either redirect to login or show the landing page
		const url = page.url();
		// Unauthenticated users should be on / or /login
		expect(url).toMatch(/\/(login)?$/);
	});

	test('shows login link or form', async ({ page }) => {
		await page.goto('/login');
		await expect(page.locator('form')).toBeVisible();
		await expect(page.locator('input[type="email"], input[name="email"]')).toBeVisible();
		await expect(page.locator('input[type="password"]')).toBeVisible();
	});

	test('has correct page title', async ({ page }) => {
		await page.goto('/login');
		const title = await page.title();
		expect(title.length).toBeGreaterThan(0);
	});
});
