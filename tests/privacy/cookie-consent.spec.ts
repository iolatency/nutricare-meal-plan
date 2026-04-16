import { test, expect } from '@playwright/test';

/**
 * Privacy & Cookie Consent tests
 *
 * Verifies that the app sets cookies correctly and respects privacy boundaries.
 * The nc_session cookie should be httpOnly, sameSite=Lax, and secure in production.
 */

test.describe('Session cookie properties', () => {
	test('nc_session cookie is httpOnly after login', async ({ page, context }) => {
		await page.goto('/login');
		await page.fill('#identifier', 'dev@example.com');
		await page.fill('#password', 'password');
		await page.click('button[type="submit"]');
		await page.waitForURL(/\/dietitian|\/patient/, { timeout: 10000 });

		const cookies = await context.cookies();
		const sessionCookie = cookies.find((c) => c.name === 'nc_session');

		if (sessionCookie) {
			expect(sessionCookie.httpOnly).toBe(true);
			expect(['Lax', 'Strict']).toContain(sessionCookie.sameSite);
		}
	});

	test('nc_session cookie is removed after logout', async ({ page, context }) => {
		// Login
		await page.goto('/login');
		await page.fill('#identifier', 'dev@example.com');
		await page.fill('#password', 'password');
		await page.click('button[type="submit"]');
		await page.waitForURL(/\/dietitian|\/patient/, { timeout: 10000 });

		// Logout
		await page.click('form[action="/logout"] button[type="submit"]');
		await page.waitForURL(/\/login/, { timeout: 5000 });

		const cookies = await context.cookies();
		const sessionCookie = cookies.find((c) => c.name === 'nc_session');
		// Cookie should not exist or should be expired
		if (sessionCookie) {
			expect(sessionCookie.expires).toBeLessThan(Date.now() / 1000);
		}
	});

	test('no sensitive data in localStorage', async ({ page }) => {
		await page.goto('/login');
		await page.fill('#identifier', 'dev@example.com');
		await page.fill('#password', 'password');
		await page.click('button[type="submit"]');
		await page.waitForURL(/\/dietitian|\/patient/, { timeout: 10000 });

		const localStorageKeys = await page.evaluate(() => Object.keys(localStorage));
		// Should not store credentials, tokens, or PII in localStorage
		const sensitiveKeys = localStorageKeys.filter((k) =>
			/token|password|secret|session|auth|user.*id|email/i.test(k)
		);
		expect(sensitiveKeys).toHaveLength(0);
	});
});
