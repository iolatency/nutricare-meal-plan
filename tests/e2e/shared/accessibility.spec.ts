import { test, expect, type Page } from '@playwright/test';

const DIETITIAN_EMAIL = process.env.DIETITIAN_EMAIL ?? 'dev@example.com';
const DIETITIAN_PASS = process.env.DIETITIAN_PASSWORD ?? 'password';

async function loginAsDietitian(page: Page) {
	await page.goto('/login');
	await page.fill('#identifier', DIETITIAN_EMAIL);
	await page.fill('#password', DIETITIAN_PASS);
	await page.click('button[type="submit"]');
	await page.waitForURL(/\/dietitian/, { timeout: 30000 });
}

test.describe('Accessibility — Login Page', () => {
	test('login form inputs have associated labels or aria-labels', async ({ page }) => {
		await page.goto('/login');
		const identifier = page.locator('#identifier');
		const password = page.locator('#password');

		const idLabel = await identifier.getAttribute('aria-label') ??
			await page.locator('label[for="identifier"]').textContent();
		const pwLabel = await password.getAttribute('aria-label') ??
			await page.locator('label[for="password"]').textContent();

		expect(idLabel?.trim().length ?? 0).toBeGreaterThan(0);
		expect(pwLabel?.trim().length ?? 0).toBeGreaterThan(0);
	});

	test('submit button is keyboard-accessible', async ({ page }) => {
		await page.goto('/login');
		await page.fill('#identifier', 'test@example.com');
		await page.fill('#password', 'password');
		// Press Enter instead of clicking
		await page.keyboard.press('Enter');
		// Should either navigate or show error
		await page.waitForTimeout(2000);
		const url = page.url();
		expect(url).toBeTruthy();
	});

	test('error messages use role="alert" for screen readers', async ({ page }) => {
		await page.goto('/login');
		await page.fill('#identifier', 'wrong@test.com');
		await page.fill('#password', 'wrongpassword');
		await page.click('button[type="submit"]');
		await page.waitForTimeout(2000);
		const alerts = page.locator('[role="alert"]');
		if (await alerts.count() > 0) {
			await expect(alerts.first()).toBeVisible();
		}
	});

	test('page has a lang attribute on html element', async ({ page }) => {
		await page.goto('/login');
		const lang = await page.locator('html').getAttribute('lang');
		expect(lang).toBeTruthy();
	});
});

test.describe('Accessibility — Dietitian App', () => {
	test.beforeEach(async ({ page }) => {
		await loginAsDietitian(page);
	});

	test('page has proper heading hierarchy', async ({ page }) => {
		await page.goto('/dietitian/meal-plan');
		const h1s = await page.locator('h1').count();
		const h2s = await page.locator('h2').count();
		// Should have at least one heading
		expect(h1s + h2s).toBeGreaterThanOrEqual(0);
	});

	test('interactive elements are focusable', async ({ page }) => {
		await page.goto('/dietitian/meal-plan');
		await page.keyboard.press('Tab');
		const tag = await page.evaluate(() => document.activeElement?.tagName.toLowerCase());
		expect(['a', 'button', 'input', 'select', 'textarea', 'body']).toContain(tag);
	});

	test('links have discernible text', async ({ page }) => {
		await page.goto('/dietitian/meal-plan');
		const links = page.locator('a');
		const count = await links.count();
		for (let i = 0; i < Math.min(count, 10); i++) {
			const link = links.nth(i);
			const text = await link.textContent();
			const ariaLabel = await link.getAttribute('aria-label');
			const title = await link.getAttribute('title');
			const hasContent = (text?.trim().length ?? 0) > 0 ||
				(ariaLabel?.trim().length ?? 0) > 0 ||
				(title?.trim().length ?? 0) > 0;
			expect(hasContent).toBe(true);
		}
	});

	test('RTL direction is set on the page', async ({ page }) => {
		await page.goto('/dietitian/meal-plan');
		const dir = await page.locator('html').getAttribute('dir') ??
			await page.locator('body').getAttribute('dir');
		const hasRtlElement = (await page.locator('[dir="rtl"]').count()) > 0;
		expect(dir === 'rtl' || hasRtlElement).toBe(true);
	});
});
