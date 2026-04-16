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

test.describe('Dietitian — Tracking View', () => {
	test.beforeEach(async ({ page }) => {
		await loginAsDietitian(page);
	});

	test('tracking page for a real session loads', async ({ page }) => {
		// First, find a session ID from the meal plan list
		await page.goto('/dietitian/meal-plan');
		const sessionLink = page.locator('a[href*="/dietitian/meal-plan/"]').first();

		if ((await sessionLink.count()) > 0) {
			const href = await sessionLink.getAttribute('href');
			if (href) {
				const sessionId = href.split('/').at(-1);
				await page.goto(`/dietitian/meal-plan/${sessionId}/tracking`);
				await expect(page).not.toHaveURL(/\/login/);
				await expect(page.locator('main')).toBeVisible();
			}
		}
	});

	test('meal type labels are localized in tracking card', async ({ page }) => {
		await page.goto('/dietitian/meal-plan');
		const sessionLink = page.locator('a[href*="/dietitian/meal-plan/"]').first();
		if ((await sessionLink.count()) === 0) {
			test.skip();
			return;
		}
		const href = await sessionLink.getAttribute('href');
		if (!href) {
			test.skip();
			return;
		}
		const sessionId = href.split('/').filter(Boolean).at(-1);
		await page.goto(`/dietitian/meal-plan/${sessionId}/tracking?type=weekly`);
		await expect(page.getByText('الالتزام حسب نوع الوجبة')).toBeVisible({ timeout: 15000 });
		await expect(page.locator('.type-label').filter({ hasText: 'supplement' })).toHaveCount(0);
	});
});
