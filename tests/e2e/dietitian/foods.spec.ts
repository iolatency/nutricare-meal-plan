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

test.describe('Dietitian — Foods', () => {
	test.beforeEach(async ({ page }) => {
		await loginAsDietitian(page);
	});

	test('foods page loads', async ({ page }) => {
		await page.goto('/dietitian/foods');
		await expect(page).not.toHaveURL(/\/login/);
		await expect(page.locator('main')).toBeVisible();
	});
});
