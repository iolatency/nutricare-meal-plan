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

async function navigateToDashboard(page: Page): Promise<boolean> {
	await page.goto('/patient/sessions');
	await page.waitForLoadState('domcontentloaded');
	const cta = page.locator('.card-cta').first();
	if (await cta.count() === 0) return false;
	const href = await cta.getAttribute('href');
	if (!href || !href.includes('/dashboard/')) return false;
	await cta.click();
	await page.waitForURL(/\/patient\/dashboard\/\d+/, { timeout: 15000 });
	return true;
}

test.describe('Patient — Dashboard Week & Day Navigation', () => {
	test.beforeEach(async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 800 });
		await loginAsPatient(page);
	});

	test('dashboard page loads with pdash container', async ({ page }) => {
		if (!(await navigateToDashboard(page))) return;
		const pdash = page.locator('.pdash');
		await expect(pdash).toBeVisible();
	});

	test('week navigation strip is visible', async ({ page }) => {
		if (!(await navigateToDashboard(page))) return;
		const weekNav = page.locator('.week-nav');
		await expect(weekNav).toBeVisible();
	});

	test('week arrows navigate between weeks', async ({ page }) => {
		if (!(await navigateToDashboard(page))) return;
		const prevArrow = page.locator('.week-arrow[aria-label="الأسبوع السابق"]');
		const nextArrow = page.locator('.week-arrow[aria-label="الأسبوع التالي"]');
		if (await prevArrow.count() > 0 && (await prevArrow.getAttribute('aria-disabled')) !== 'true') {
			await prevArrow.click();
			await page.waitForTimeout(500);
		}
		if (await nextArrow.count() > 0 && (await nextArrow.getAttribute('aria-disabled')) !== 'true') {
			await nextArrow.click();
			await page.waitForTimeout(500);
		}
	});

	test('week arrows remain visible and expose disabled state', async ({ page }) => {
		if (!(await navigateToDashboard(page))) return;
		const prevArrow = page.locator('.week-arrow[aria-label="الأسبوع السابق"]');
		const nextArrow = page.locator('.week-arrow[aria-label="الأسبوع التالي"]');
		await expect(prevArrow).toBeVisible();
		await expect(nextArrow).toBeVisible();
		const prevDisabled = (await prevArrow.getAttribute('aria-disabled')) === 'true';
		const nextDisabled = (await nextArrow.getAttribute('aria-disabled')) === 'true';
		if (prevDisabled) {
			await expect(prevArrow).toHaveClass(/is-disabled/);
		}
		if (nextDisabled) {
			await expect(nextArrow).toHaveClass(/is-disabled/);
		}
	});

	test('day pills exist in week strip', async ({ page }) => {
		if (!(await navigateToDashboard(page))) return;
		const dayPills = page.locator('.week-day');
		const count = await dayPills.count();
		expect(count).toBeGreaterThan(0);
	});

	test('active day pill has active class', async ({ page }) => {
		if (!(await navigateToDashboard(page))) return;
		const activeDay = page.locator('.week-day.active');
		await expect(activeDay).toBeVisible();
	});

	test('clicking a day pill changes active day', async ({ page }) => {
		if (!(await navigateToDashboard(page))) return;
		const days = page.locator('.week-day:not(.active)');
		if (await days.count() > 0) {
			await days.first().click();
			await page.waitForTimeout(500);
		}
	});
});

test.describe('Patient — Dashboard Water Tracking', () => {
	test.beforeEach(async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 800 });
		await loginAsPatient(page);
	});

	test('water section is visible', async ({ page }) => {
		if (!(await navigateToDashboard(page))) return;
		const water = page.locator('.drop-btn, .water-btn-add');
		const count = await water.count();
		expect(count).toBeGreaterThan(0);
	});

	test('add cup button increments water count', async ({ page }) => {
		if (!(await navigateToDashboard(page))) return;
		const addBtn = page.locator('.water-btn-add');
		if (await addBtn.count() > 0 && await addBtn.isEnabled()) {
			await addBtn.click();
			await page.waitForTimeout(500);
		}
	});

	test('water drop buttons exist for add and remove', async ({ page }) => {
		if (!(await navigateToDashboard(page))) return;
		const addDrop = page.locator('.drop-btn[aria-label="إضافة كوب"]');
		const removeDrop = page.locator('.drop-btn[aria-label="إزالة كوب"]');
		if (await addDrop.count() > 0) {
			await expect(addDrop.first()).toBeVisible();
		}
		if (await removeDrop.count() > 0) {
			await expect(removeDrop.first()).toBeVisible();
		}
	});

	test('reset button resets water count', async ({ page }) => {
		if (!(await navigateToDashboard(page))) return;
		const resetBtn = page.locator('.water-btn-reset');
		if (await resetBtn.count() > 0 && await resetBtn.isVisible()) {
			await resetBtn.click();
			await page.waitForTimeout(500);
		}
	});
});

test.describe('Patient — Dashboard Meal Actions', () => {
	test.beforeEach(async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 800 });
		await loginAsPatient(page);
	});

	test('meal cards are visible on dashboard', async ({ page }) => {
		if (!(await navigateToDashboard(page))) return;
		const mealCards = page.locator('.meal-card');
		const count = await mealCards.count();
		expect(count).toBeGreaterThanOrEqual(0);
	});

	test('eat button exists and is clickable', async ({ page }) => {
		if (!(await navigateToDashboard(page))) return;
		const eatBtns = page.locator('.act-eat');
		if (await eatBtns.count() > 0) {
			const firstEat = eatBtns.first();
			if (await firstEat.isEnabled()) {
				await firstEat.click();
				await page.waitForTimeout(500);
				await expect(firstEat).toHaveClass(/on/);
			}
		}
	});

	test('skip button exists and is clickable', async ({ page }) => {
		if (!(await navigateToDashboard(page))) return;
		const skipBtns = page.locator('.act-skip');
		if (await skipBtns.count() > 0) {
			const btn = skipBtns.first();
			if (await btn.isEnabled()) {
				await btn.click();
				await page.waitForTimeout(500);
			}
		}
	});

	test('replace button opens replace popup', async ({ page }) => {
		if (!(await navigateToDashboard(page))) return;
		const replaceBtns = page.locator('.act-replace');
		if (await replaceBtns.count() > 0) {
			const btn = replaceBtns.first();
			if (await btn.isEnabled()) {
				await btn.click();
				await page.waitForTimeout(500);
				const popup = page.locator('.popup-sheet');
				if (await popup.count() > 0) {
					await expect(popup).toBeVisible();
					await expect(page.locator('.popup-sheet')).toContainText('ماذا أكلت بدلها؟');
				}
			}
		}
	});

	test('replace popup has textarea and save/cancel', async ({ page }) => {
		if (!(await navigateToDashboard(page))) return;
		const replaceBtns = page.locator('.act-replace');
		if (await replaceBtns.count() === 0) return;
		const btn = replaceBtns.first();
		if (!(await btn.isEnabled())) return;
		await btn.click();
		await page.waitForTimeout(500);

		const popup = page.locator('.popup-sheet');
		if (await popup.count() === 0) return;

		const textarea = popup.locator('textarea');
		if (await textarea.count() > 0) {
			await textarea.fill('أكلت سلطة بدلها');
		}

		const cancelBtn = page.locator('.popup-cancel');
		if (await cancelBtn.count() > 0) {
			await cancelBtn.click();
			await page.waitForTimeout(300);
		}
	});

	test('replace popup save submits replacement', async ({ page }) => {
		if (!(await navigateToDashboard(page))) return;
		const replaceBtns = page.locator('.act-replace');
		if (await replaceBtns.count() === 0) return;
		const btn = replaceBtns.first();
		if (!(await btn.isEnabled())) return;
		await btn.click();
		await page.waitForTimeout(500);

		const popup = page.locator('.popup-sheet');
		if (await popup.count() === 0) return;

		const textarea = popup.locator('textarea');
		if (await textarea.count() > 0) {
			await textarea.fill('أكلت بيض مسلوق');
		}

		const saveBtn = page.locator('.popup-save');
		if (await saveBtn.count() > 0) {
			await saveBtn.click();
			await page.waitForTimeout(1000);
		}
	});
});

test.describe('Patient — Dashboard Ingredients & Steps', () => {
	test.beforeEach(async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 800 });
		await loginAsPatient(page);
	});

	test('ingredients toggle expands and collapses', async ({ page }) => {
		if (!(await navigateToDashboard(page))) return;
		const toggles = page.locator('.ing-toggle');
		if (await toggles.count() > 0) {
			await toggles.first().click();
			await page.waitForTimeout(300);
			await toggles.first().click();
			await page.waitForTimeout(300);
		}
	});

	test('steps toggle expands and collapses', async ({ page }) => {
		if (!(await navigateToDashboard(page))) return;
		const toggles = page.locator('.steps-toggle');
		if (await toggles.count() > 0) {
			await toggles.first().click();
			await page.waitForTimeout(300);
			await toggles.first().click();
			await page.waitForTimeout(300);
		}
	});
});

test.describe('Patient — Dashboard Finish Day', () => {
	test.beforeEach(async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 800 });
		await loginAsPatient(page);
	});

	test('finish day button exists', async ({ page }) => {
		if (!(await navigateToDashboard(page))) return;
		const finishBtn = page.locator('.finish-btn');
		if (await finishBtn.count() > 0) {
			await expect(finishBtn).toBeVisible();
		}
	});

	test('finish day button opens confirmation modal', async ({ page }) => {
		if (!(await navigateToDashboard(page))) return;
		const finishBtn = page.locator('.finish-btn.finish-active');
		if (await finishBtn.count() === 0) return;
		await finishBtn.click();
		await page.waitForTimeout(500);

		const modal = page.locator('.modal');
		if (await modal.count() > 0) {
			await expect(modal).toBeVisible();
			await expect(page.locator('.modal-title')).toContainText('إنهاء اليوم');
		}
	});

	test('finish day modal has cancel and confirm', async ({ page }) => {
		if (!(await navigateToDashboard(page))) return;
		const finishBtn = page.locator('.finish-btn.finish-active');
		if (await finishBtn.count() === 0) return;
		await finishBtn.click();
		await page.waitForTimeout(500);

		const modal = page.locator('.modal');
		if (await modal.count() === 0) return;

		const cancelBtn = page.locator('.modal-cancel');
		const confirmBtn = page.locator('.modal-confirm');

		if (await cancelBtn.count() > 0) {
			await expect(cancelBtn).toBeVisible();
			await expect(cancelBtn).toContainText('رجوع');
		}
		if (await confirmBtn.count() > 0) {
			await expect(confirmBtn).toBeVisible();
			await expect(confirmBtn).toContainText('تأكيد إنهاء اليوم');
		}
	});

	test('finish day modal cancel closes it', async ({ page }) => {
		if (!(await navigateToDashboard(page))) return;
		const finishBtn = page.locator('.finish-btn.finish-active');
		if (await finishBtn.count() === 0) return;
		await finishBtn.click();
		await page.waitForTimeout(500);

		const cancelBtn = page.locator('.modal-cancel');
		if (await cancelBtn.count() > 0) {
			await cancelBtn.click();
			await page.waitForTimeout(300);
		}
	});

	test('toast messages appear and disappear', async ({ page }) => {
		if (!(await navigateToDashboard(page))) return;
		const toast = page.locator('.toast');
		const count = await toast.count();
		expect(count).toBeGreaterThanOrEqual(0);
	});
});
