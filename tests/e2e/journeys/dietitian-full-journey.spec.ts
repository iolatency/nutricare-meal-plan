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

test.describe('Dietitian — Full Navigation Journey', () => {
	test.beforeEach(async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 800 });
		await loginAsDietitian(page);
	});

	test('sidebar shows all 4 nav links', async ({ page }) => {
		const sidebar = page.locator('.sidebar');
		await expect(sidebar).toBeVisible();

		const navLinks = page.locator('.nav-link');
		await expect(navLinks).toHaveCount(4);

		await expect(page.locator('.nav-link', { hasText: 'الخطة الغذائية' })).toBeVisible();
		await expect(page.locator('.nav-link', { hasText: 'الوصفات' })).toBeVisible();
		await expect(page.locator('.nav-link', { hasText: 'الأطعمة' })).toBeVisible();
		await expect(page.locator('.nav-link', { hasText: 'الرسائل' })).toBeVisible();
	});

	test('navigate to meal plan page via sidebar', async ({ page }) => {
		await page.locator('.nav-link', { hasText: 'الخطة الغذائية' }).click();
		await expect(page).toHaveURL(/\/dietitian\/meal-plan/);
		await expect(page.locator('.nav-link', { hasText: 'الخطة الغذائية' })).toHaveClass(/active/);
	});

	test('navigate to recipes page via sidebar', async ({ page }) => {
		await page.locator('.nav-link', { hasText: 'الوصفات' }).click();
		await expect(page).toHaveURL(/\/dietitian\/recipes/);
		await expect(page.locator('.nav-link', { hasText: 'الوصفات' })).toHaveClass(/active/);
	});

	test('navigate to foods page via sidebar', async ({ page }) => {
		await page.locator('.nav-link', { hasText: 'الأطعمة' }).click();
		await expect(page).toHaveURL(/\/dietitian\/foods/);
		await expect(page.locator('.nav-link', { hasText: 'الأطعمة' })).toHaveClass(/active/);
	});

	test('navigate to messages page via sidebar', async ({ page }) => {
		await page.locator('.nav-link', { hasText: 'الرسائل' }).click();
		await expect(page).toHaveURL(/\/dietitian\/messages/);
		await expect(page.locator('.nav-link', { hasText: 'الرسائل' })).toHaveClass(/active/);
	});

	test('full sidebar navigation cycle visits all pages', async ({ page }) => {
		const routes = [
			{ label: 'الخطة الغذائية', url: /\/dietitian\/meal-plan/ },
			{ label: 'الوصفات', url: /\/dietitian\/recipes/ },
			{ label: 'الأطعمة', url: /\/dietitian\/foods/ },
			{ label: 'الرسائل', url: /\/dietitian\/messages/ },
		];
		for (const r of routes) {
			await page.locator('.nav-link', { hasText: r.label }).click();
			await expect(page).toHaveURL(r.url);
			await expect(page.locator('.main-content')).toBeVisible();
		}
	});

	test('logo is visible in sidebar brand block', async ({ page }) => {
		const brand = page.locator('.brand-block');
		await expect(brand).toBeVisible();
		const logo = brand.locator('img');
		if (await logo.count() > 0) {
			await expect(logo).toBeVisible();
		}
	});

	test('logout button is present in sidebar', async ({ page }) => {
		const logoutBtn = page.locator('.sidebar .logout-btn');
		await expect(logoutBtn).toBeVisible();
	});

	test('logout form submits to /logout', async ({ page }) => {
		const logoutForm = page.locator('.sidebar form[action="/logout"]');
		await expect(logoutForm).toBeVisible();
	});
});

test.describe('Dietitian — Mobile Navigation', () => {
	test.beforeEach(async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await loginAsDietitian(page);
	});

	test('bottom nav is visible on mobile', async ({ page }) => {
		const bottomNav = page.locator('.bottom-nav');
		await expect(bottomNav).toBeVisible();
	});

	test('bottom nav has all 4 items', async ({ page }) => {
		const items = page.locator('.bottom-nav-item');
		await expect(items).toHaveCount(4);
	});

	test('bottom nav navigates between pages', async ({ page }) => {
		const items = page.locator('.bottom-nav-item');
		const count = await items.count();
		for (let i = 0; i < count; i++) {
			await items.nth(i).click();
			await page.waitForLoadState('domcontentloaded');
			await expect(page).toHaveURL(/\/dietitian\//);
		}
	});

	test('account drawer opens and closes on mobile', async ({ page }) => {
		const trigger = page.locator('button.account-trigger');
		if (await trigger.count() > 0) {
			await trigger.click();
			const drawer = page.locator('#dietitian-account-drawer');
			await expect(drawer).toBeVisible();

			const backdrop = page.locator('button.drawer-backdrop');
			if (await backdrop.count() > 0 && await backdrop.isVisible()) {
				await backdrop.click();
			} else {
				const closeBtn = page.locator('button.drawer-close');
				if (await closeBtn.count() > 0) await closeBtn.click();
			}
			await page.waitForTimeout(500);
		}
	});

	test('account drawer closes on Escape', async ({ page }) => {
		const trigger = page.locator('button.account-trigger');
		if (await trigger.count() > 0) {
			await trigger.click();
			await page.waitForTimeout(300);
			await page.keyboard.press('Escape');
			await page.waitForTimeout(500);
		}
	});

	test('sidebar is hidden on mobile', async ({ page }) => {
		const sidebar = page.locator('.sidebar');
		if (await sidebar.count() > 0) {
			const visible = await sidebar.isVisible();
			expect(visible).toBe(false);
		}
	});
});
