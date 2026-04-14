/**
 * Landing / Entry-point Tests
 *
 * This app redirects unauthenticated users from / → /login.
 * The /login page is the effective "landing" for new visitors.
 */
import { test, expect } from '@playwright/test';

test.describe('Entry page (unauthenticated)', () => {
	test('root / redirects unauthenticated users to /login', async ({ page }) => {
		await page.goto('/');
		await expect(page).toHaveURL(/\/login/);
	});

	test('login page renders within 3 seconds', async ({ page }) => {
		const start = Date.now();
		await page.goto('/login');
		await page.waitForLoadState('networkidle');
		expect(Date.now() - start).toBeLessThan(3000);
	});

	test('page has a meaningful <title>', async ({ page }) => {
		await page.goto('/login');
		const title = await page.title();
		expect(title.length).toBeGreaterThan(0);
	});

	test('identifier and password fields are visible', async ({ page }) => {
		await page.goto('/login');
		await expect(page.locator('#identifier')).toBeVisible();
		await expect(page.locator('#password')).toBeVisible();
	});

	test('submit button is present', async ({ page }) => {
		await page.goto('/login');
		await expect(page.locator('button[type="submit"]')).toBeVisible();
	});

	test('register link is present', async ({ page }) => {
		await page.goto('/login');
		// Should be a link pointing to /register
		const registerLink = page.locator('a[href*="register"]');
		await expect(registerLink).toBeVisible();
	});

	test('page renders in Arabic (RTL direction)', async ({ page }) => {
		await page.goto('/login');
		// Either html or body carries dir="rtl", or a top-level container does
		const htmlDir = await page.locator('html').getAttribute('dir');
		const bodyDir = await page.locator('body').getAttribute('dir');
		const hasRtlContainer = (await page.locator('[dir="rtl"]').count()) > 0;
		const isRtl = htmlDir === 'rtl' || bodyDir === 'rtl' || hasRtlContainer;
		expect(isRtl).toBe(true);
	});

	test('/register page is accessible without login', async ({ page }) => {
		await page.goto('/register');
		await expect(page).toHaveURL(/\/register/);
		await expect(page.locator('body')).toBeVisible();
	});

	test('direct navigation to /dietitian redirects unauthenticated users', async ({ page }) => {
		await page.goto('/dietitian/recipes');
		// Should end up at login page
		await expect(page).toHaveURL(/\/login/);
	});

	test('direct navigation to /patient redirects unauthenticated users', async ({ page }) => {
		await page.goto('/patient/awaiting-activation');
		await expect(page).toHaveURL(/\/login/);
	});
});
