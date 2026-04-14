/**
 * Dietitian — Foods Page E2E Tests
 *
 * Requires the dev seed user: npm run db:seed-dev-user
 * Dev credentials: dev@example.com / password (role: dietitian)
 */
import { test, expect, type Page } from '@playwright/test';

async function loginAsDietitian(page: Page) {
	await page.goto('/login');
	await page.fill('#identifier', 'dev@example.com');
	await page.fill('#password', 'password');
	await page.click('button[type="submit"]');
	await expect(page).not.toHaveURL(/\/login/, { timeout: 8000 });
}

test.describe('Dietitian — Foods', () => {
	test.beforeEach(async ({ page }) => {
		await loginAsDietitian(page);
	});

	test('foods page loads and displays correct title', async ({ page }) => {
		await page.goto('/dietitian/foods');
		await expect(page).toHaveURL(/\/dietitian\/foods/);
		await expect(page).toHaveTitle(/الأطعمة/);
	});

	test('foods page renders without a 500 error', async ({ page }) => {
		await page.goto('/dietitian/foods');
		const bodyText = await page.locator('body').innerText();
		expect(bodyText).not.toMatch(/500|Internal Server Error/i);
	});

	test('food search API rejects unauthenticated requests', async ({ page, context }) => {
		await context.clearCookies();
		const res = await page.request.get('/api/foods/search?q=chicken');
		expect(res.status()).toBe(401);
	});

	test('local food search API works for authenticated dietitian', async ({ page }) => {
		const res = await page.request.get('/api/foods/local-search?q=chicken');
		// 200 or empty results — but not an auth error
		expect([200, 204]).toContain(res.status());
	});

	test('unauthenticated access to foods page redirects to login', async ({ page, context }) => {
		await context.clearCookies();
		await page.goto('/dietitian/foods');
		await expect(page).toHaveURL(/\/login/);
	});
});
