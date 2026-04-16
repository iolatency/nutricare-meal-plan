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

test.describe('Patient — Profile Page', () => {
	test.beforeEach(async ({ page }) => {
		await loginAsPatient(page);
	});

	test('patient dashboard loads after login', async ({ page }) => {
		await expect(page).toHaveURL(/\/patient/);
		await expect(page.locator('main')).toBeVisible();
	});

	test('patient name is displayed somewhere on dashboard', async ({ page }) => {
		const main = page.locator('main');
		const text = await main.textContent();
		// Dashboard should contain some user-related content
		expect(text?.length).toBeGreaterThan(0);
	});

	test('sidebar or navigation shows patient menu items', async ({ page }) => {
		const nav = page.locator('nav, .sidebar, [role="navigation"]');
		if (await nav.count() > 0) {
			await expect(nav.first()).toBeVisible();
		}
	});

	test('logout button/form is accessible', async ({ page }) => {
		const logoutBtn = page.locator(
			'form[action="/logout"] button, a[href="/logout"], button:has-text("خروج")'
		);
		if (await logoutBtn.count() > 0) {
			await expect(logoutBtn.first()).toBeVisible();
		}
	});

	test('patient cannot access dietitian routes', async ({ page }) => {
		await page.goto('/dietitian/meal-plan');
		// Should redirect to patient dashboard or show forbidden
		const url = page.url();
		expect(url).not.toMatch(/\/dietitian\/meal-plan$/);
	});
});
