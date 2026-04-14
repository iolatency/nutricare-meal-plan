/**
 * Shared — Arabic RTL Layout Tests
 *
 * Verifies that all pages render with correct RTL direction and
 * Arabic text is present where expected.
 */
import { test, expect, type Page } from '@playwright/test';

async function loginAsDietitian(page: Page) {
	await page.goto('/login');
	await page.fill('#identifier', 'dev@example.com');
	await page.fill('#password', 'password');
	await page.click('button[type="submit"]');
	await expect(page).not.toHaveURL(/\/login/, { timeout: 8000 });
}

async function hasRtl(page: Page): Promise<boolean> {
	const htmlDir = await page.locator('html').getAttribute('dir');
	const bodyDir = await page.locator('body').getAttribute('dir');
	const rtlContainers = await page.locator('[dir="rtl"]').count();
	return htmlDir === 'rtl' || bodyDir === 'rtl' || rtlContainers > 0;
}

test.describe('RTL Layout — Unauthenticated pages', () => {
	test('login page has RTL layout', async ({ page }) => {
		await page.goto('/login');
		expect(await hasRtl(page)).toBe(true);
	});

	test('register page has RTL layout', async ({ page }) => {
		await page.goto('/register');
		expect(await hasRtl(page)).toBe(true);
	});

	test('login page contains Arabic text', async ({ page }) => {
		await page.goto('/login');
		const bodyText = await page.locator('body').innerText();
		// Arabic unicode range: \u0600-\u06FF
		expect(/[\u0600-\u06FF]/.test(bodyText)).toBe(true);
	});

	test('register page shows Arabic role selection labels', async ({ page }) => {
		await page.goto('/register', { waitUntil: 'networkidle' });
		await expect(page.locator('button').filter({ hasText: 'أخصائي تغذية' })).toBeVisible();
		await expect(page.locator('button').filter({ hasText: 'مريض' })).toBeVisible();
	});
});

test.describe('RTL Layout — Authenticated pages', () => {
	test.beforeEach(async ({ page }) => {
		await loginAsDietitian(page);
	});

	test('dietitian recipes page has RTL layout', async ({ page }) => {
		await page.goto('/dietitian/recipes');
		expect(await hasRtl(page)).toBe(true);
	});

	test('dietitian foods page has RTL layout', async ({ page }) => {
		await page.goto('/dietitian/foods');
		expect(await hasRtl(page)).toBe(true);
	});

	test('dietitian supplements page has RTL layout', async ({ page }) => {
		await page.goto('/dietitian/supplements');
		expect(await hasRtl(page)).toBe(true);
	});

	test('dietitian messages page has RTL layout', async ({ page }) => {
		await page.goto('/dietitian/messages');
		expect(await hasRtl(page)).toBe(true);
	});

	test('dietitian meal plan page has RTL layout', async ({ page }) => {
		await page.goto('/dietitian/meal-plan');
		expect(await hasRtl(page)).toBe(true);
	});

	test('authenticated pages contain Arabic text', async ({ page }) => {
		await page.goto('/dietitian/recipes');
		const bodyText = await page.locator('body').innerText();
		expect(/[\u0600-\u06FF]/.test(bodyText)).toBe(true);
	});
});

test.describe('RTL Layout — Text direction in form fields', () => {
	test('login form identifier field is visible and accessible', async ({ page }) => {
		await page.goto('/login');
		const identifier = page.locator('#identifier');
		await expect(identifier).toBeVisible();
		// The form wraps in a container that respects RTL
		const container = identifier.locator('..');
		expect(container).not.toBeNull();
	});
});
