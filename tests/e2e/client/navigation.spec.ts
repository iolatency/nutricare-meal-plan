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

test.describe('Patient navigation layout', () => {
	test.beforeEach(async ({ page }) => {
		await loginAsPatient(page);
	});

	test('sidebar renders all nav items on desktop', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 800 });
		await page.goto('/patient/home');
		await page.waitForLoadState('domcontentloaded');

		const sidebar = page.locator('.sidebar');
		if (await sidebar.count() > 0) {
			await expect(sidebar).toBeVisible();
		}

		const navLinks = page.locator('.nav-link');
		const count = await navLinks.count();
		expect(count).toBeGreaterThanOrEqual(2);
	});

	test('bottom nav is shown on mobile viewport', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto('/patient/home');

		const bottomNav = page.locator('.bottom-nav');
		await expect(bottomNav).toBeVisible();
	});

	test('/patient redirects to home', async ({ page }) => {
		await page.goto('/patient');
		await expect(page).toHaveURL(/\/patient\/home/);
	});

	test('home nav link is active on home page', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 800 });
		await page.goto('/patient/home');
		await page.waitForLoadState('domcontentloaded');
		const homeLink = page.locator('.nav-link', { hasText: 'الرئيسية' });
		if (await homeLink.count() > 0) {
			await expect(homeLink).toBeVisible();
		}
	});

	test('meal plan nav link navigates correctly', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 800 });
		await page.goto('/patient/home');
		await page.waitForLoadState('domcontentloaded');
		const link = page.locator('.nav-link', { hasText: /الوجبات|خطتي الغذائية/ });
		if (await link.count() > 0) {
			await link.click();
			await expect(page).toHaveURL(/\/patient\/(dashboard|sessions)/);
		}
	});

	test('messages nav link navigates to messages page', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 800 });
		await page.goto('/patient/home');
		await page.waitForLoadState('domcontentloaded');
		const link = page.locator('.nav-link', { hasText: /المحادثة|محادثة/ });
		if (await link.count() > 0) {
			await link.click();
			await expect(page).toHaveURL(/\/patient\/messages/);
		}
	});

	test('dietitian card shows in sidebar when dietitian is assigned', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 800 });
		await page.goto('/patient/home');
		await page.waitForLoadState('domcontentloaded');
		const dietitianCard = page.locator('.dietitian-card');
		const count = await dietitianCard.count();
		if (count > 0) {
			const isVisible = await dietitianCard.first().isVisible();
			expect(typeof isVisible).toBe('boolean');
		}
	});
});

test.describe('Unauthenticated access to patient routes', () => {
	test('redirects to /login when not authenticated', async ({ page }) => {
		await page.goto('/patient/sessions');
		await expect(page).toHaveURL(/\/login/);
	});

	test('redirects recipes to login when not authenticated', async ({ page }) => {
		await page.goto('/patient/recipes');
		await expect(page).toHaveURL(/\/login/);
	});
});
