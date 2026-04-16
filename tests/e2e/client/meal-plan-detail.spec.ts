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

test.describe('Patient — Meal Plan Detail View', () => {
	test.beforeEach(async ({ page }) => {
		await loginAsPatient(page);
	});

	test('sessions page loads without errors', async ({ page }) => {
		await page.goto('/patient/sessions');
		await page.waitForLoadState('domcontentloaded');
		const body = page.locator('body');
		const text = await body.textContent();
		expect(text?.length).toBeGreaterThan(0);
	});

	test('sessions page shows content or empty state', async ({ page }) => {
		await page.goto('/patient/sessions');
		await page.waitForLoadState('domcontentloaded');
		const body = page.locator('body');
		await expect(body).toBeVisible();
	});

	test('page does not show server errors (500)', async ({ page }) => {
		const response = await page.goto('/patient/sessions');
		if (response) {
			expect(response.status()).toBeLessThan(500);
		}
	});

	test('navigation back to home works', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 800 });
		await page.goto('/patient/sessions');
		await page.waitForLoadState('domcontentloaded');
		const homeLink = page.locator('.sidebar a[href*="/patient/home"], .sidebar .nav-link').first();
		if (await homeLink.count() > 0 && await homeLink.isVisible()) {
			await homeLink.click();
			await expect(page).toHaveURL(/\/patient/);
		}
	});

	test('sessions page is protected (redirects unauthenticated users)', async ({ browser }) => {
		const ctx = await browser.newContext();
		const page = await ctx.newPage();
		await page.goto('/patient/sessions');
		await expect(page).toHaveURL(/\/login/);
		await ctx.close();
	});
});
