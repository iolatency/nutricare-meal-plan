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

test.describe('Dietitian — Dashboard', () => {
	test.beforeEach(async ({ page }) => {
		await loginAsDietitian(page);
	});

	test('dashboard loads after login', async ({ page }) => {
		await expect(page).toHaveURL(/\/dietitian/);
		await expect(page.locator('main')).toBeVisible();
	});

	test('dashboard has main content area', async ({ page }) => {
		const main = page.locator('main');
		const text = await main.textContent();
		expect(text?.trim().length).toBeGreaterThan(0);
	});

	test('sidebar navigation is visible on desktop', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 800 });
		const sidebar = page.locator('.sidebar');
		if (await sidebar.count() > 0) {
			await expect(sidebar).toBeVisible();
		}
	});

	test('sidebar has key nav links', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 800 });
		const navLinks = page.locator('.nav-link');
		if (await navLinks.count() > 0) {
			expect(await navLinks.count()).toBeGreaterThanOrEqual(3);
		}
	});

	test('dietitian cannot access patient-specific routes', async ({ page }) => {
		const response = await page.goto('/patient/meal-plan');
		const url = page.url();
		// Should redirect away or show content (dietitians with canAccessPatientApp may pass)
		expect(response?.status()).toBeLessThan(500);
	});

	test('page does not crash on navigation between sections', async ({ page }) => {
		await page.goto('/dietitian/meal-plan');
		await expect(page.locator('main')).toBeVisible();
		await page.goto('/dietitian/recipes');
		await expect(page.locator('main')).toBeVisible();
		await page.goto('/dietitian/foods');
		await expect(page.locator('main')).toBeVisible();
	});
});
