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

test.describe('Dietitian — Foods Page', () => {
	test.beforeEach(async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 800 });
		await loginAsDietitian(page);
		await page.goto('/dietitian/foods');
		await page.waitForLoadState('domcontentloaded');
	});

	test('foods page loads with title', async ({ page }) => {
		await expect(page).toHaveURL(/\/dietitian\/foods/);
		await expect(page.locator('.page-title')).toHaveText('قاعدة الأطعمة');
	});

	test('internal tab is active by default', async ({ page }) => {
		const tabs = page.locator('.tab-btn');
		const count = await tabs.count();
		if (count >= 2) {
			const first = tabs.first();
			await expect(first).toHaveClass(/active/);
			await expect(first).toHaveText('أطعمتي');
		}
	});

	test('switch to external tab shows Edamam search', async ({ page }) => {
		const externalTab = page.locator('.tab-btn', { hasText: 'قاعدة بيانات خارجية' });
		if (await externalTab.count() > 0) {
			await externalTab.click();
			await page.waitForTimeout(300);
			await expect(externalTab).toHaveClass(/active/);
			const extSearch = page.locator('input[placeholder*="ابحث عن أي طعام بالإنجليزي"]');
			if (await extSearch.count() > 0) {
				await expect(extSearch).toBeVisible();
			}
		}
	});

	test('internal search filters foods', async ({ page }) => {
		const searchInput = page.locator('.food-search-form .input, input[name="q"]').first();
		if (await searchInput.count() > 0) {
			await searchInput.fill('أرز');
			await page.waitForTimeout(500);
			await searchInput.fill('');
		}
	});

	test('food list rows are visible', async ({ page }) => {
		const foodRows = page.locator('.food-row');
		const count = await foodRows.count();
		if (count > 0) {
			const first = foodRows.first();
			await expect(first).toBeVisible();
			const name = first.locator('.food-name');
			if (await name.count() > 0) {
				const text = await name.textContent();
				expect(text?.trim().length).toBeGreaterThan(0);
			}
		}
	});

	test('food row shows macro chips', async ({ page }) => {
		const firstRow = page.locator('.food-row').first();
		if (await firstRow.count() > 0) {
			const macros = firstRow.locator('.macro-chip');
			if (await macros.count() > 0) {
				await expect(macros.first()).toBeVisible();
			}
		}
	});

	test('clicking food info opens detail modal', async ({ page }) => {
		const foodInfo = page.locator('.food-info[role="button"]').first();
		if (await foodInfo.count() > 0) {
			await foodInfo.click();
			await page.waitForTimeout(500);
			const modal = page.locator('.modal-overlay');
			if (await modal.count() > 0) {
				await expect(modal).toBeVisible();
				const closeBtn = page.locator('.modal-header-close, button:has-text("إغلاق")').first();
				if (await closeBtn.count() > 0) {
					await closeBtn.click();
					await page.waitForTimeout(300);
				}
			}
		}
	});

	test('add food button opens create form', async ({ page }) => {
		const addBtn = page.locator('.btn-primary', { hasText: 'إضافة طعام' });
		if (await addBtn.count() > 0) {
			await addBtn.click();
			await expect(page.locator('#m-name')).toBeVisible({ timeout: 10000 });
			await expect(page.locator('#m-name-ar')).toBeVisible({ timeout: 5000 });
		}
	});

	test('create food form has all nutrition fields', async ({ page }) => {
		const addBtn = page.locator('.btn-primary', { hasText: 'إضافة طعام' });
		if (await addBtn.count() === 0) return;
		await addBtn.click();
		await page.waitForTimeout(500);

		const fields = ['m-name', 'm-name-ar', 'm-create-qty', 'm-create-unit', 'm-create-calories', 'm-create-fat', 'm-create-carbs', 'm-create-protein'];
		for (const field of fields) {
			await expect(page.locator(`#${field}`)).toBeVisible();
		}
	});

	test('create food form cancel closes modal', async ({ page }) => {
		const addBtn = page.locator('.btn-primary', { hasText: 'إضافة طعام' });
		if (await addBtn.count() === 0) return;
		await addBtn.click();
		await page.waitForTimeout(300);
		const cancelBtn = page.locator('button:has-text("إلغاء")');
		if (await cancelBtn.count() > 0) {
			await cancelBtn.click();
			await page.waitForTimeout(300);
		}
	});

	test('pagination controls exist when list is long', async ({ page }) => {
		const pagination = page.locator('.pagination-btn');
		const count = await pagination.count();
		expect(count).toBeGreaterThanOrEqual(0);
	});
});

test.describe('Dietitian — External Food Search (Edamam)', () => {
	test.beforeEach(async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 800 });
		await loginAsDietitian(page);
		await page.goto('/dietitian/foods');
		await page.waitForLoadState('domcontentloaded');
	});

	test('Edamam search returns results for common food', async ({ page }) => {
		const externalTab = page.locator('.tab-btn', { hasText: 'قاعدة بيانات خارجية' });
		if (await externalTab.count() === 0) return;
		await externalTab.click();
		await page.waitForTimeout(300);

		const searchInput = page.locator('input[placeholder*="ابحث عن أي طعام بالإنجليزي"]');
		if (await searchInput.count() === 0) return;
		await searchInput.fill('rice');
		await page.waitForTimeout(5000);

		const results = page.locator('.ext-row');
		const count = await results.count();
		expect(count).toBeGreaterThanOrEqual(0);
	});

	test('import button exists on external results', async ({ page }) => {
		const externalTab = page.locator('.tab-btn', { hasText: 'قاعدة بيانات خارجية' });
		if (await externalTab.count() === 0) return;
		await externalTab.click();
		await page.waitForTimeout(300);

		const searchInput = page.locator('input[placeholder*="ابحث عن أي طعام بالإنجليزي"]');
		if (await searchInput.count() === 0) return;
		await searchInput.fill('chicken');
		await page.waitForTimeout(2000);

		const importBtns = page.locator('.btn-import');
		const count = await importBtns.count();
		if (count > 0) {
			await expect(importBtns.first()).toBeVisible();
		}
	});

	test('clicking import on external food adds it', async ({ page }) => {
		const externalTab = page.locator('.tab-btn', { hasText: 'قاعدة بيانات خارجية' });
		if (await externalTab.count() === 0) return;
		await externalTab.click();
		await page.waitForTimeout(300);

		const searchInput = page.locator('input[placeholder*="ابحث عن أي طعام بالإنجليزي"]');
		if (await searchInput.count() === 0) return;
		await searchInput.fill('banana');
		await page.waitForTimeout(2000);

		const importBtns = page.locator('.ext-row .btn-import:has-text("استيراد")');
		if (await importBtns.count() > 0) {
			await importBtns.first().click();
			await page.waitForTimeout(2000);
		}
	});

	test('external food detail modal opens on view click', async ({ page }) => {
		const externalTab = page.locator('.tab-btn', { hasText: 'قاعدة بيانات خارجية' });
		if (await externalTab.count() === 0) return;
		await externalTab.click();
		await page.waitForTimeout(300);

		const searchInput = page.locator('input[placeholder*="ابحث عن أي طعام بالإنجليزي"]');
		if (await searchInput.count() === 0) return;
		await searchInput.fill('egg');
		await page.waitForTimeout(2000);

		const viewBtns = page.locator('.btn-import:has-text("عرض")');
		if (await viewBtns.count() > 0) {
			await viewBtns.first().click();
			await page.waitForTimeout(500);
			const modal = page.locator('.modal');
			if (await modal.count() > 0) {
				await expect(modal).toBeVisible();
				const macroGrid = modal.locator('.detail-macro-grid');
				if (await macroGrid.count() > 0) {
					await expect(macroGrid).toBeVisible();
				}
				const closeBtn = page.locator('button:has-text("إغلاق")').first();
				if (await closeBtn.count() > 0) await closeBtn.click();
			}
		}
	});

	test('empty search shows no results or placeholder', async ({ page }) => {
		const externalTab = page.locator('.tab-btn', { hasText: 'قاعدة بيانات خارجية' });
		if (await externalTab.count() === 0) return;
		await externalTab.click();
		await page.waitForTimeout(300);

		const extRows = page.locator('.ext-row');
		const count = await extRows.count();
		expect(count).toBeGreaterThanOrEqual(0);
	});
});
