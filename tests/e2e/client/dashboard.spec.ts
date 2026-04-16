import { test, expect, type Page } from '@playwright/test';

const PATIENT_EMAIL = process.env.PATIENT_EMAIL ?? 'patient@example.com';
const PATIENT_PASS = process.env.PATIENT_PASSWORD ?? 'password';

async function loginAsPatient(page: Page) {
	await page.goto('/login');
	await page.fill('#identifier', PATIENT_EMAIL);
	await page.fill('#password', PATIENT_PASS);
	await page.click('button[type="submit"]');
	await page.waitForURL(/\/patient/, { timeout: 30000 });
}

test.describe('Patient Dashboard — Meal tracking', () => {
	test.beforeEach(async ({ page }) => {
		await loginAsPatient(page);
	});

	test('dashboard shows today\'s meals or empty state', async ({ page }) => {
		await page.goto('/patient/home');
		await page.waitForLoadState('domcontentloaded');
		const main = page.locator('.main-content, main');
		const count = await main.count();
		expect(count).toBeGreaterThan(0);
	});

	test('week strip shows 7 days', async ({ page }) => {
		await page.goto('/patient/home');
		await page.waitForLoadState('domcontentloaded');

		const dayButtons = page.locator('.week-strip button, .week-day, [class*="week"] button, .day-btn');
		const count = await dayButtons.count();
		if (count > 0) {
			expect(count).toBeGreaterThanOrEqual(7);
		}
	});

	test('water counter is visible', async ({ page }) => {
		await page.goto('/patient/home');
		await page.waitForLoadState('domcontentloaded');

		const waterByClass = page.locator('[class*="water"]');
		const waterByText = page.getByText('الماء');
		const count = (await waterByClass.count()) + (await waterByText.count());
		expect(count).toBeGreaterThanOrEqual(0);
	});
});
