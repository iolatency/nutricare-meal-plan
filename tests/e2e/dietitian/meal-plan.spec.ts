/**
 * Dietitian — Meal Plan E2E Tests
 *
 * Requires the dev seed user: npm run db:seed-dev-user
 * Dev credentials: dev@example.com / password (role: dietitian)
 */
import { test, expect, type Page } from '@playwright/test';

async function loginAsDietitian(page: Page) {
	await page.goto('/login');
	await page.fill('#identifier', 'dev@example.com');
	await page.fill('#password', 'password');
	await page.click('button[type="submit"]');
	await expect(page).not.toHaveURL(/\/login/, { timeout: 8000 });
}

test.describe('Dietitian — Meal Plan Sessions', () => {
	test.beforeEach(async ({ page }) => {
		await loginAsDietitian(page);
	});

	test('dietitian can navigate to meal plan list', async ({ page }) => {
		await page.goto('/dietitian/meal-plan');
		await expect(page).toHaveURL(/\/dietitian\/meal-plan/);
	});

	test('meal plan page renders without crashing', async ({ page }) => {
		await page.goto('/dietitian/meal-plan');
		// Page should not show a 500 error
		const bodyText = await page.locator('body').innerText();
		expect(bodyText).not.toMatch(/500|Internal Server Error/i);
	});

	test('unauthenticated access to meal plan redirects to login', async ({ page, context }) => {
		await context.clearCookies();
		await page.goto('/dietitian/meal-plan');
		await expect(page).toHaveURL(/\/login/);
	});

	test('meal plan session page loads for a valid session ID', async ({ page }) => {
		// Navigate to the meal plan list first, then click the first session if any
		await page.goto('/dietitian/meal-plan');
		const firstSession = page.locator('a[href*="/dietitian/meal-plan/"]').first();
		const hasSession = (await firstSession.count()) > 0;

		if (hasSession) {
			await firstSession.click();
			await expect(page).toHaveURL(/\/dietitian\/meal-plan\/.+/);
			const bodyText = await page.locator('body').innerText();
			expect(bodyText).not.toMatch(/500|not found/i);
		} else {
			// No sessions seeded — acceptable for clean test DB
			test.skip();
		}
	});

	test('meal plan tracking page loads for a valid session', async ({ page }) => {
		await page.goto('/dietitian/meal-plan');
		const trackingLink = page.locator('a[href*="tracking"]').first();
		if ((await trackingLink.count()) > 0) {
			await trackingLink.click();
			await expect(page).toHaveURL(/tracking/);
		} else {
			test.skip();
		}
	});

	test('AI meal plan API rejects unauthenticated requests', async ({ page, context }) => {
		await context.clearCookies();
		const res = await page.request.post('/api/ai/meal-plan', {
			data: { targetCalories: 2000 }
		});
		expect(res.status()).toBe(401);
	});
});
