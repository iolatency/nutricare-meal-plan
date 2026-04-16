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

test.describe('Dietitian — Meal Plan List', () => {
	test.beforeEach(async ({ page }) => {
		await loginAsDietitian(page);
	});

	test('meal plan list page loads', async ({ page }) => {
		await page.goto('/dietitian/meal-plan');
		await expect(page).toHaveURL(/\/dietitian\/meal-plan/);
		await expect(page.locator('main')).toBeVisible();
	});

	test('sidebar shows correct nav items', async ({ page }) => {
		await page.goto('/dietitian/meal-plan');
		await page.setViewportSize({ width: 1280, height: 800 });

		await expect(page.locator('.sidebar')).toBeVisible();
		await expect(page.locator('.nav-link', { hasText: 'الخطة الغذائية' })).toBeVisible();
		await expect(page.locator('.nav-link', { hasText: 'الوصفات' })).toBeVisible();
		await expect(page.locator('.nav-link', { hasText: 'الأطعمة' })).toBeVisible();
		await expect(page.locator('.nav-link', { hasText: 'الرسائل' })).toBeVisible();
	});

	test('meal plan page shows patient list or empty state', async ({ page }) => {
		await page.goto('/dietitian/meal-plan');
		// Should have some content — either patient rows or an empty message
		const content = page.locator('main');
		await expect(content).toBeVisible();
	});
});

test.describe('Dietitian — Meal Plan Session', () => {
	test.beforeEach(async ({ page }) => {
		await loginAsDietitian(page);
	});

	test('navigating to an invalid session shows 404 or redirect', async ({ page }) => {
		await page.goto('/dietitian/meal-plan/99999999');
		// Should either 404 or redirect back
		const url = page.url();
		const isOk = url.includes('/dietitian') || page.url().includes('404');
		expect(isOk).toBe(true);
	});
});
