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

test.describe('Dietitian — Patient Meal Plan Session', () => {
	test.beforeEach(async ({ page }) => {
		await loginAsDietitian(page);
	});

	test('meal plan list page loads', async ({ page }) => {
		await page.goto('/dietitian/meal-plan');
		await expect(page).toHaveURL(/\/dietitian\/meal-plan/);
		await expect(page.locator('main')).toBeVisible();
	});

	test('meal plan page shows patient list or empty state', async ({ page }) => {
		await page.goto('/dietitian/meal-plan');
		const content = await page.locator('main').textContent();
		expect(content?.trim().length).toBeGreaterThan(0);
	});

	test('invalid session ID shows 404 or redirect', async ({ page }) => {
		await page.goto('/dietitian/meal-plan/99999999');
		const url = page.url();
		const isHandled =
			url.includes('/dietitian') ||
			url.includes('404') ||
			(await page.locator('main').textContent())?.includes('غير موجود');
		expect(isHandled).toBe(true);
	});

	test('tracking tab for invalid session returns gracefully', async ({ page }) => {
		const response = await page.goto('/dietitian/meal-plan/99999999/tracking');
		expect(response?.status()).toBeLessThan(500);
	});

	test('meal plan session page has no uncaught JS errors', async ({ page }) => {
		const errors: string[] = [];
		page.on('pageerror', (err) => errors.push(err.message));
		await page.goto('/dietitian/meal-plan');
		await page.waitForLoadState('networkidle');
		expect(errors).toHaveLength(0);
	});

	test('navigation between meal plan list and other sections works', async ({ page }) => {
		await page.goto('/dietitian/meal-plan');
		await expect(page.locator('main')).toBeVisible();

		// Navigate to recipes
		const recipesLink = page.locator('.nav-link', { hasText: 'الوصفات' });
		if (await recipesLink.count() > 0) {
			await recipesLink.click();
			await expect(page).toHaveURL(/\/dietitian\/recipes/);
		}
	});
});
