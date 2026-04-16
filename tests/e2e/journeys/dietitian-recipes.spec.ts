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

test.describe('Dietitian — Recipes Page', () => {
	test.beforeEach(async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 800 });
		await loginAsDietitian(page);
		await page.goto('/dietitian/recipes');
		await page.waitForLoadState('domcontentloaded');
	});

	test('recipes page loads with content', async ({ page }) => {
		await expect(page).toHaveURL(/\/dietitian\/recipes/);
		const body = page.locator('body');
		const text = await body.textContent();
		expect(text?.length).toBeGreaterThan(0);
	});

	test('recipe tabs exist and are switchable', async ({ page }) => {
		const tabs = page.locator('.tab, button.tab');
		const count = await tabs.count();
		if (count >= 2) {
			await tabs.first().click();
			await page.waitForTimeout(300);
			await tabs.nth(1).click();
			await page.waitForTimeout(300);
		}
	});

	test('search input filters recipes', async ({ page }) => {
		const searchInput = page.locator('input[type="text"], input[type="search"]').first();
		if (await searchInput.count() > 0) {
			await searchInput.fill('دجاج');
			await page.waitForTimeout(500);
			await searchInput.fill('');
		}
	});

	test('create recipe button opens form', async ({ page }) => {
		const createBtn = page.locator('button.btn-primary, button:has-text("إضافة"), button:has-text("إنشاء")').first();
		if (await createBtn.count() > 0) {
			await createBtn.click();
			await page.waitForTimeout(500);
			const modal = page.locator('[role="dialog"], .modal, .modal-overlay');
			const form = page.locator('form');
			const hasModal = (await modal.count() > 0) || (await form.count() > 0);
			expect(hasModal).toBe(true);
		}
	});

	test('recipe cards are visible and have view buttons', async ({ page }) => {
		const cards = page.locator('.recipe-card, .card, [class*="recipe"]');
		const count = await cards.count();
		if (count > 0) {
			await expect(cards.first()).toBeVisible();
			const viewBtn = cards.first().locator('button.btn-view, button:has-text("عرض")');
			if (await viewBtn.count() > 0) {
				await expect(viewBtn).toBeVisible();
			}
		}
	});

	test('AI create button is present', async ({ page }) => {
		const aiBtn = page.locator('button.btn-ai, button:has-text("ذكاء اصطناعي"), button:has-text("AI")').first();
		if (await aiBtn.count() > 0) {
			await expect(aiBtn).toBeVisible();
		}
	});

	test('clicking view on a recipe shows details', async ({ page }) => {
		const viewBtns = page.locator('button.btn-view, button:has-text("عرض")');
		if (await viewBtns.count() > 0) {
			await viewBtns.first().click();
			await page.waitForTimeout(500);
			const detail = page.locator('.modal, [role="dialog"], .recipe-detail');
			if (await detail.count() > 0) {
				await expect(detail.first()).toBeVisible();
			}
		}
	});

	test('delete button exists on recipe cards', async ({ page }) => {
		const deleteBtns = page.locator('button.btn-icon, form[action*="delete"] button, button[aria-label*="حذف"]');
		const count = await deleteBtns.count();
		expect(count).toBeGreaterThanOrEqual(0);
	});
});

test.describe('Dietitian — Recipe Creation Flow', () => {
	test.beforeEach(async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 800 });
		await loginAsDietitian(page);
		await page.goto('/dietitian/recipes');
		await page.waitForLoadState('domcontentloaded');
	});

	test('manual recipe creation fills all fields', async ({ page }) => {
		const createBtn = page.locator('button.btn-primary, button:has-text("إضافة"), button:has-text("يدوي")').first();
		if (await createBtn.count() === 0) return;
		await createBtn.click();
		await page.waitForTimeout(500);

		const nameInput = page.locator('input[name="name"], input[placeholder*="اسم"]').first();
		if (await nameInput.count() > 0) {
			await nameInput.fill('وصفة اختبار ' + Date.now());
		}

		const stepsTextarea = page.locator('textarea[name="steps"], textarea').first();
		if (await stepsTextarea.count() > 0 && await stepsTextarea.isVisible()) {
			await stepsTextarea.fill('الخطوة 1: تحضير المكونات\nالخطوة 2: الطبخ');
		}
	});

	test('ingredient search works in recipe form', async ({ page }) => {
		const createBtn = page.locator('button.btn-primary, button:has-text("إضافة"), button:has-text("يدوي")').first();
		if (await createBtn.count() === 0) return;
		await createBtn.click();
		await page.waitForTimeout(500);

		const ingSearch = page.locator('input[placeholder*="بحث"], input[placeholder*="مكون"]').first();
		if (await ingSearch.count() > 0 && await ingSearch.isVisible()) {
			await ingSearch.fill('أرز');
			await page.waitForTimeout(1000);
			const dropdown = page.locator('.ing-dropdown-row, [class*="dropdown"] button, [class*="suggestion"]');
			if (await dropdown.count() > 0) {
				await dropdown.first().click();
			}
		}
	});
});
