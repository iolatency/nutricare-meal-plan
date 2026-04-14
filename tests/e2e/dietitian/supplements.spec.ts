/**
 * Dietitian — Supplements Page E2E Tests
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

test.describe('Dietitian — Supplements', () => {
	test.beforeEach(async ({ page }) => {
		await loginAsDietitian(page);
	});

	test('supplements page loads for authenticated dietitian', async ({ page }) => {
		const res = await page.goto('/dietitian/supplements');
		await expect(page).toHaveURL(/\/dietitian\/supplements/);
		// HTTP status must be 200 (page body may contain "500" as a supplement volume value)
		expect(res?.status()).toBe(200);
	});

	test('unauthenticated access to supplements page redirects to login', async ({
		page,
		context
	}) => {
		await context.clearCookies();
		await page.goto('/dietitian/supplements');
		await expect(page).toHaveURL(/\/login/);
	});

	test('GET /api/supplements rejects unauthenticated requests', async ({ page, context }) => {
		await context.clearCookies();
		const res = await page.request.get('/api/supplements');
		expect(res.status()).toBe(401);
	});

	test('POST /api/supplements rejects unauthenticated requests', async ({ page, context }) => {
		await context.clearCookies();
		const res = await page.request.post('/api/supplements', {
			data: { name: 'Test Supplement' }
		});
		expect(res.status()).toBe(401);
	});

	test('authenticated dietitian can fetch supplements list', async ({ page }) => {
		const res = await page.request.get('/api/supplements');
		expect([200, 204]).toContain(res.status());
		if (res.status() === 200) {
			const body = await res.json();
			expect(Array.isArray(body)).toBe(true);
		}
	});

	test('creating a supplement with missing name does not crash the server', async ({ page }) => {
		const res = await page.request.post('/api/supplements', {
			data: {}
		});
		// Must not be a server error
		expect(res.status()).toBeLessThan(500);
	});

	test('supplement by unknown ID does not crash the server', async ({ page }) => {
		const res = await page.request.get('/api/supplements/999999');
		// Any non-5xx response is acceptable
		expect(res.status()).toBeLessThan(500);
	});
});
