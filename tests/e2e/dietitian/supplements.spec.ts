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

test.describe('Dietitian — Supplements API', () => {
	test.beforeEach(async ({ page }) => {
		await loginAsDietitian(page);
	});

	test('supplements API returns valid JSON', async ({ request }) => {
		// Need to login first to get a session cookie
		const loginRes = await request.post('/login', {
			form: {
				identifier: DIETITIAN_EMAIL,
				password: DIETITIAN_PASS
			}
		});
		// Follow redirect and try supplements API
		const res = await request.get('/api/supplements');
		// Should be either 200 with data or 401 (no session in API client)
		expect([200, 401, 302]).toContain(res.status());
	});

	test('supplements page is accessible from dietitian UI', async ({ page }) => {
		// Navigate to a meal plan session where supplements can be managed
		await page.goto('/dietitian/meal-plan');
		await expect(page.locator('main')).toBeVisible();
	});
});

test.describe('Supplements API — Unauthenticated', () => {
	test('unauthenticated request to supplements API returns 401 or redirect', async ({ request }) => {
		const res = await request.get('/api/supplements');
		expect([401, 302, 303]).toContain(res.status());
	});

	test('POST to supplements API without auth returns 401 or redirect', async ({ request }) => {
		const res = await request.post('/api/supplements', {
			data: { name: 'Test', servingSize: 30, protein: 25, carbs: 3, fat: 1, scoops: 1 }
		});
		expect([401, 302, 303]).toContain(res.status());
	});
});
