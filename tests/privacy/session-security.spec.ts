import { test, expect, type Page } from '@playwright/test';

const DIETITIAN_EMAIL = process.env.DIETITIAN_EMAIL ?? 'dev@example.com';
const DIETITIAN_PASS = process.env.DIETITIAN_PASSWORD ?? 'password';

async function loginAsDietitian(page: Page) {
	await page.goto('/login');
	await page.fill('#identifier', DIETITIAN_EMAIL);
	await page.fill('#password', DIETITIAN_PASS);
	await page.click('button[type="submit"]');
	await page.waitForURL(/\/dietitian/, { timeout: 10000 });
}

test.describe('Session Security', () => {
	test('session cookie is set after login', async ({ page, context }) => {
		await loginAsDietitian(page);
		const cookies = await context.cookies();
		const session = cookies.find((c) => c.name === 'nc_session');
		expect(session).toBeDefined();
	});

	test('session cookie has httpOnly flag', async ({ page, context }) => {
		await loginAsDietitian(page);
		const cookies = await context.cookies();
		const session = cookies.find((c) => c.name === 'nc_session');
		if (session) {
			expect(session.httpOnly).toBe(true);
		}
	});

	test('session cookie uses sameSite Lax or Strict', async ({ page, context }) => {
		await loginAsDietitian(page);
		const cookies = await context.cookies();
		const session = cookies.find((c) => c.name === 'nc_session');
		if (session) {
			expect(['Lax', 'Strict']).toContain(session.sameSite);
		}
	});

	test('session cookie is cleared after logout', async ({ page, context }) => {
		await loginAsDietitian(page);
		// Logout
		const logoutForm = page.locator('form[action="/logout"]');
		if (await logoutForm.count() > 0) {
			await logoutForm.locator('button[type="submit"]').click();
			await page.waitForURL(/\/login/, { timeout: 5000 });
			const cookies = await context.cookies();
			const session = cookies.find((c) => c.name === 'nc_session');
			if (session) {
				expect(session.expires).toBeLessThan(Date.now() / 1000);
			}
		}
	});

	test('invalid session token redirects to login', async ({ browser }) => {
		const ctx = await browser.newContext();
		await ctx.addCookies([{
			name: 'nc_session',
			value: 'invalid-token-that-should-not-work',
			domain: 'localhost',
			path: '/'
		}]);
		const page = await ctx.newPage();
		await page.goto('/dietitian/meal-plan');
		await expect(page).toHaveURL(/\/login/);
		await ctx.close();
	});

	test('concurrent sessions from different browsers work independently', async ({ browser }) => {
		// Session 1
		const ctx1 = await browser.newContext();
		const page1 = await ctx1.newPage();
		await page1.goto('/login');
		await page1.fill('#identifier', DIETITIAN_EMAIL);
		await page1.fill('#password', DIETITIAN_PASS);
		await page1.click('button[type="submit"]');
		await page1.waitForURL(/\/dietitian/, { timeout: 10000 });

		// Session 2
		const ctx2 = await browser.newContext();
		const page2 = await ctx2.newPage();
		await page2.goto('/login');
		await page2.fill('#identifier', DIETITIAN_EMAIL);
		await page2.fill('#password', DIETITIAN_PASS);
		await page2.click('button[type="submit"]');
		await page2.waitForURL(/\/dietitian/, { timeout: 10000 });

		// Both should still be logged in
		await page1.reload();
		await expect(page1).toHaveURL(/\/dietitian/);
		await page2.reload();
		await expect(page2).toHaveURL(/\/dietitian/);

		await ctx1.close();
		await ctx2.close();
	});
});
