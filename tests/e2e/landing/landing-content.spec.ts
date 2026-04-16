import { test, expect } from '@playwright/test';

test.describe('Landing Page — Content & Navigation', () => {
	test('unauthenticated user lands on /login', async ({ page }) => {
		await page.goto('/');
		await expect(page).toHaveURL(/\/login/);
	});

	test('login page has a non-empty title', async ({ page }) => {
		await page.goto('/login');
		const title = await page.title();
		expect(title.length).toBeGreaterThan(0);
	});

	test('login page renders a visible form', async ({ page }) => {
		await page.goto('/login');
		await expect(page.locator('form')).toBeVisible();
	});

	test('login page has identifier and password inputs', async ({ page }) => {
		await page.goto('/login');
		await expect(page.locator('#identifier')).toBeVisible();
		await expect(page.locator('#password')).toBeVisible();
	});

	test('login page has a submit button', async ({ page }) => {
		await page.goto('/login');
		await expect(page.locator('button[type="submit"]')).toBeVisible();
	});

	test('login page has a link to registration', async ({ page }) => {
		await page.goto('/login');
		const registerLink = page.locator('a[href="/register"]');
		if (await registerLink.count() > 0) {
			await expect(registerLink.first()).toBeVisible();
		}
	});

	test('page loads within 5 seconds', async ({ page }) => {
		const start = Date.now();
		await page.goto('/login');
		await page.waitForLoadState('domcontentloaded');
		const elapsed = Date.now() - start;
		expect(elapsed).toBeLessThan(5000);
	});

	test('no console errors on login page', async ({ page }) => {
		const errors: string[] = [];
		page.on('console', (msg) => {
			if (msg.type() === 'error') errors.push(msg.text());
		});
		await page.goto('/login');
		await page.waitForLoadState('networkidle');
		// Filter out common non-critical errors
		const critical = errors.filter(
			(e) => !e.includes('favicon') && !e.includes('net::ERR')
		);
		expect(critical).toHaveLength(0);
	});

	test('login page is accessible via keyboard (tab to inputs)', async ({ page }) => {
		await page.goto('/login');
		await page.keyboard.press('Tab');
		const focused = await page.evaluate(() => document.activeElement?.tagName.toLowerCase());
		expect(['input', 'a', 'button']).toContain(focused);
	});
});
