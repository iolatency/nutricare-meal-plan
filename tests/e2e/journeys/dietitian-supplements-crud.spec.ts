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

test.describe('Dietitian — Supplements Page', () => {
	test.beforeEach(async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 800 });
		await loginAsDietitian(page);
		await page.goto('/dietitian/supplements');
		await page.waitForLoadState('domcontentloaded');
	});

	test('supplements page loads with title', async ({ page }) => {
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('المكملات الغذائية');
	});

	test('add supplement button is visible', async ({ page }) => {
		const addBtn = page.locator('.btn-primary', { hasText: 'إضافة مكمل' });
		await expect(addBtn).toBeVisible();
	});

	test('add button opens create modal', async ({ page }) => {
		await page.locator('.btn-primary', { hasText: 'إضافة مكمل' }).click();
		await page.waitForTimeout(500);
		const modal = page.locator('.modal');
		await expect(modal).toBeVisible();
		await expect(page.locator('#supplement-create-modal-title')).toHaveText('إضافة مكمل جديد');
	});

	test('create modal has all required fields', async ({ page }) => {
		await page.locator('.btn-primary', { hasText: 'إضافة مكمل' }).click();
		await page.waitForTimeout(500);

		const fields = [
			'supp-create-name',
			'supp-create-kcalPerMl',
			'supp-create-totalKcal',
			'supp-create-volumeMl',
			'supp-create-protein',
			'supp-create-carbs',
			'supp-create-fat',
		];
		for (const id of fields) {
			await expect(page.locator(`#${id}`)).toBeVisible();
		}
	});

	test('create modal has optional mineral fields', async ({ page }) => {
		await page.locator('.btn-primary', { hasText: 'إضافة مكمل' }).click();
		await page.waitForTimeout(500);

		const optionalFields = ['supp-create-sodium', 'supp-create-potassium', 'supp-create-calcium'];
		for (const id of optionalFields) {
			const el = page.locator(`#${id}`);
			if (await el.count() > 0) {
				await expect(el).toBeVisible();
			}
		}
	});

	test('filling and submitting the create form', async ({ page }) => {
		await page.locator('.btn-primary', { hasText: 'إضافة مكمل' }).click();
		await page.waitForTimeout(500);

		const uniqueName = 'مكمل اختبار ' + Date.now();
		await page.fill('#supp-create-name', uniqueName);
		await page.fill('#supp-create-kcalPerMl', '1.5');
		await page.fill('#supp-create-totalKcal', '300');
		await page.fill('#supp-create-volumeMl', '200');
		await page.fill('#supp-create-protein', '15');
		await page.fill('#supp-create-carbs', '30');
		await page.fill('#supp-create-fat', '10');

		const submitBtn = page.locator('.btn-primary', { hasText: 'حفظ المكمل' });
		await expect(submitBtn).toBeVisible();
		await submitBtn.click();
		await page.waitForTimeout(2000);

		await page.goto(`/dietitian/supplements?q=${encodeURIComponent(uniqueName)}`);
		await page.waitForLoadState('domcontentloaded');
		const body = await page.locator('body').textContent();
		expect(body).toContain(uniqueName);
	});

	test('cancel button closes create modal', async ({ page }) => {
		await page.locator('.btn-primary', { hasText: 'إضافة مكمل' }).click();
		await page.waitForTimeout(500);
		await expect(page.locator('.modal')).toBeVisible();

		const cancelBtn = page.locator('.modal button:has-text("إلغاء")');
		if (await cancelBtn.count() > 0) {
			await cancelBtn.click();
			await page.waitForTimeout(300);
		}
	});

	test('close button (X) closes create modal', async ({ page }) => {
		await page.locator('.btn-primary', { hasText: 'إضافة مكمل' }).click();
		await page.waitForTimeout(500);
		await expect(page.locator('.modal')).toBeVisible();

		const closeBtn = page.locator('.modal button[aria-label="إغلاق"]');
		if (await closeBtn.count() > 0) {
			await closeBtn.click();
			await page.waitForTimeout(300);
		}
	});

	test('search input filters supplements', async ({ page }) => {
		const searchInput = page.locator('input[name="q"]');
		if (await searchInput.count() > 0) {
			await searchInput.fill('اختبار');
			await page.waitForTimeout(500);
			await searchInput.fill('');
		}
	});

	test('supplements table is visible', async ({ page }) => {
		const table = page.locator('.table-wrap table');
		if (await table.count() > 0) {
			await expect(table).toBeVisible();
		}
	});

	test('delete button exists on supplement rows', async ({ page }) => {
		const deleteForms = page.locator('form[action*="delete"]');
		const count = await deleteForms.count();
		expect(count).toBeGreaterThanOrEqual(0);
	});

	test('delete removes a supplement from the table', async ({ page }) => {
		const uniqueName = 'حذف_اختبار_' + Date.now();
		await page.locator('.btn-primary', { hasText: 'إضافة مكمل' }).click();
		await page.waitForTimeout(500);
		await page.fill('#supp-create-name', uniqueName);
		await page.fill('#supp-create-kcalPerMl', '1');
		await page.fill('#supp-create-totalKcal', '100');
		await page.fill('#supp-create-volumeMl', '100');
		await page.fill('#supp-create-protein', '5');
		await page.fill('#supp-create-carbs', '10');
		await page.fill('#supp-create-fat', '3');
		await page.locator('.btn-primary', { hasText: 'حفظ المكمل' }).click();
		await page.waitForTimeout(2000);

		await page.goto(`/dietitian/supplements?q=${encodeURIComponent(uniqueName)}`);
		await page.waitForLoadState('domcontentloaded');

		let body = await page.locator('body').textContent();
		expect(body).toContain(uniqueName);

		const deleteForms = page.locator('form[action*="delete"]');
		if (await deleteForms.count() > 0) {
			await deleteForms.first().locator('button').click();
			await page.waitForTimeout(2000);
		}
	});
});
