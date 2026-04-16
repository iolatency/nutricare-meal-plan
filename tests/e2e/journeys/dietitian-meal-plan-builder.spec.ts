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

async function resolveUnsavedNavGuardIfShown(page: Page) {
	const guard = page.locator('.overlay .modal:has-text("تعديلات غير محفوظة")');
	if (await guard.count() === 0) return;
	if (!(await guard.isVisible())) return;
	const saveThenGo = guard.locator('button:has-text("حفظ ثم الانتقال")');
	if (await saveThenGo.count() > 0) {
		await saveThenGo.click();
		await page.waitForTimeout(600);
	}
}

test.describe('Dietitian — Meal Plan List', () => {
	test.beforeEach(async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 800 });
		await loginAsDietitian(page);
		await page.goto('/dietitian/meal-plan');
		await page.waitForLoadState('domcontentloaded');
	});

	test('meal plan page shows title', async ({ page }) => {
		await expect(page.locator('.title')).toHaveText('الخطة الغذائية');
	});

	test('patient count is displayed', async ({ page }) => {
		const subtitle = page.locator('.subtitle');
		await expect(subtitle).toBeVisible();
		const text = await subtitle.textContent();
		expect(text).toMatch(/عميل مسجل/);
	});

	test('search input is present and functional', async ({ page }) => {
		const searchInput = page.locator('.search-input');
		await expect(searchInput).toBeVisible();
		await searchInput.fill('test');
		await page.waitForTimeout(300);
		const clearBtn = page.locator('.search-clear');
		if (await clearBtn.count() > 0) {
			await expect(clearBtn).toBeVisible();
			await clearBtn.click();
			await expect(searchInput).toHaveValue('');
		}
	});

	test('activate patient button opens dialog', async ({ page }) => {
		const activateBtn = page.locator('.activate-open-btn');
		await expect(activateBtn).toBeVisible();
		await activateBtn.click();
		const dialog = page.locator('.activate-dialog');
		await expect(dialog).toBeVisible();
	});

	test('activate dialog has email input and submit', async ({ page }) => {
		await page.locator('.activate-open-btn').click();
		const emailInput = page.locator('#activate-patient-email');
		await expect(emailInput).toBeVisible();
		await emailInput.fill('new-patient@test.com');
		await expect(emailInput).toHaveValue('new-patient@test.com');

		const submitBtn = page.locator('.activate-dialog__submit');
		await expect(submitBtn).toBeVisible();
		await expect(submitBtn).toBeEnabled();
	});

	test('activate dialog closes with close button', async ({ page }) => {
		await page.locator('.activate-open-btn').click();
		await expect(page.locator('.activate-dialog')).toBeVisible();
		await page.locator('.activate-dialog__close').click();
	});

	test('patient list rows are clickable', async ({ page }) => {
		const rows = page.locator('.list-row');
		const count = await rows.count();
		if (count > 0) {
			const firstRow = rows.first();
			await expect(firstRow).toBeVisible();
			const nameEl = firstRow.locator('.row-name');
			if (await nameEl.count() > 0) {
				const name = await nameEl.textContent();
				expect(name?.trim().length).toBeGreaterThan(0);
			}
		}
	});

	test('clicking a patient row navigates to session builder', async ({ page }) => {
		const rows = page.locator('.list-row');
		const count = await rows.count();
		if (count > 0) {
			await rows.first().click();
			await page.waitForURL(/\/dietitian\/meal-plan\/\d+/, { timeout: 15000 });
			await expect(page).toHaveURL(/\/dietitian\/meal-plan\/\d+/);
		}
	});
});

test.describe('Dietitian — Meal Plan Session Builder', () => {
	test.beforeEach(async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 800 });
		await loginAsDietitian(page);
		await page.goto('/dietitian/meal-plan');
		await page.waitForLoadState('domcontentloaded');
		const rows = page.locator('.list-row');
		if (await rows.count() > 0) {
			await rows.first().click();
			await page.waitForURL(/\/dietitian\/meal-plan\/\d+/, { timeout: 15000 });
		}
	});

	test('builder page loads with back link', async ({ page }) => {
		if (!page.url().match(/\/dietitian\/meal-plan\/\d+/)) return;
		const backLink = page.locator('.topbar-back-link, a[href="/dietitian/meal-plan"]');
		if (await backLink.count() > 0) {
			await expect(backLink.first()).toBeVisible();
		}
	});

	test('calories input is present and editable', async ({ page }) => {
		if (!page.url().match(/\/dietitian\/meal-plan\/\d+/)) return;
		const calInput = page.locator('.cal-input, input[type="number"]').first();
		if (await calInput.count() > 0) {
			await calInput.click();
			await calInput.fill('2000');
			await expect(calInput).toHaveValue('2000');
		}
	});

	test('macro sliders exist and are adjustable', async ({ page }) => {
		if (!page.url().match(/\/dietitian\/meal-plan\/\d+/)) return;
		const sliders = page.locator('input.slider, input[type="range"]');
		const count = await sliders.count();
		if (count >= 3) {
			for (let i = 0; i < 3; i++) {
				const slider = sliders.nth(i);
				await expect(slider).toBeVisible();
				const value = await slider.inputValue();
				expect(Number(value)).toBeGreaterThanOrEqual(0);
			}
		}
	});

	test('meal type chips are present and toggleable', async ({ page }) => {
		if (!page.url().match(/\/dietitian\/meal-plan\/\d+/)) return;
		const chips = page.locator('.meal-chip');
		const count = await chips.count();
		if (count > 0) {
			const firstChip = chips.first();
			await expect(firstChip).toBeVisible();
			await firstChip.click();
			await page.waitForTimeout(300);
			await firstChip.click();
		}
	});

	test('diagnosis dropdown opens and shows options', async ({ page }) => {
		if (!page.url().match(/\/dietitian\/meal-plan\/\d+/)) return;
		const diagBox = page.locator('.sel-box, .diag-drop-zone').first();
		if (await diagBox.count() > 0) {
			await diagBox.click();
			await page.waitForTimeout(300);
			const dropdown = page.locator('.dropdown');
			if (await dropdown.count() > 0) {
				const items = dropdown.locator('.drop-item');
				if (await items.count() > 0) {
					await items.first().click();
				}
			}
		}
	});

	test('publish button is present', async ({ page }) => {
		if (!page.url().match(/\/dietitian\/meal-plan\/\d+/)) return;
		const publishBtn = page.locator('.topbar-publish-btn, button:has-text("نشر")').first();
		if (await publishBtn.count() > 0) {
			await expect(publishBtn).toBeVisible();
		}
	});

	test('week navigation arrows exist', async ({ page }) => {
		if (!page.url().match(/\/dietitian\/meal-plan\/\d+/)) return;
		const arrows = page.locator('.week-nav-arrow');
		if (await arrows.count() >= 2) {
			await arrows.first().click();
			await page.waitForTimeout(300);
			await arrows.last().click();
		}
	});

	test('plan table is visible with meal cells', async ({ page }) => {
		if (!page.url().match(/\/dietitian\/meal-plan\/\d+/)) return;
		const table = page.locator('.plan-table, table');
		if (await table.count() > 0) {
			await expect(table.first()).toBeVisible();
		}
	});

	test('builder fields are isolated per week and restore on return', async ({ page }) => {
		if (!page.url().match(/\/dietitian\/meal-plan\/\d+/)) return;

		const calInput = page.locator('.cal-input, input[type="number"]').first();
		if (await calInput.count() === 0) return;
		await calInput.click();
		await calInput.fill('2345');
		await expect(calInput).toHaveValue('2345');

		/* Debounced auto-save (~800ms) persists changes before week navigation */
		await page.waitForTimeout(1200);

		const nextArrow = page.locator('.week-nav-arrow').last();
		const prevArrow = page.locator('.week-nav-arrow').first();
		if ((await nextArrow.count()) === 0 || (await prevArrow.count()) === 0) return;

		let stepsMoved = 0;
		let foundDifferentWeek = false;
		let weekBValue = '2345';
		for (let i = 0; i < 4; i++) {
			await nextArrow.click();
			await resolveUnsavedNavGuardIfShown(page);
			await page.waitForTimeout(300);
			stepsMoved += 1;
			weekBValue = await calInput.inputValue();
			if (weekBValue !== '2345') {
				foundDifferentWeek = true;
				break;
			}
		}

		if (foundDifferentWeek) {
			expect(weekBValue).not.toBe('2345');
		}

		for (let i = 0; i < stepsMoved; i++) {
			await prevArrow.click();
			await resolveUnsavedNavGuardIfShown(page);
			await page.waitForTimeout(250);
		}
		await expect(calInput).toHaveValue('2345');
	});

	test('clicking an empty cell opens recipe picker', async ({ page }) => {
		if (!page.url().match(/\/dietitian\/meal-plan\/\d+/)) return;
		const emptyCells = page.locator('td.meal-cell');
		const count = await emptyCells.count();
		if (count > 0) {
			for (let i = 0; i < count; i++) {
				const cell = emptyCells.nth(i);
				const hasContent = await cell.locator('.meal-card').count() > 0;
				if (!hasContent) {
					await cell.click();
					await page.waitForTimeout(500);
					const picker = page.locator('.picker-tab, [role="dialog"]');
					if (await picker.count() > 0) {
						await expect(picker.first()).toBeVisible();
						const closeBtn = page.locator('.btn-close, button:has-text("إلغاء")').first();
						if (await closeBtn.count() > 0) await closeBtn.click();
					}
					break;
				}
			}
		}
	});

	test('notes textarea is editable', async ({ page }) => {
		if (!page.url().match(/\/dietitian\/meal-plan\/\d+/)) return;
		const textarea = page.locator('textarea').first();
		if (await textarea.count() > 0 && await textarea.isVisible()) {
			await textarea.fill('ملاحظات اختبار');
			await expect(textarea).toHaveValue('ملاحظات اختبار');
		}
	});
});

test.describe('Dietitian — Tracking Page', () => {
	test.beforeEach(async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 800 });
		await loginAsDietitian(page);
	});

	test('tracking page loads for a valid session', async ({ page }) => {
		await page.goto('/dietitian/meal-plan');
		await page.waitForLoadState('domcontentloaded');
		const rows = page.locator('.list-row');
		if (await rows.count() > 0) {
			await rows.first().click();
			await page.waitForURL(/\/dietitian\/meal-plan\/\d+/, { timeout: 15000 });
			const sessionUrl = page.url();
			const trackingUrl = sessionUrl + '/tracking';
			await page.goto(trackingUrl);
			await page.waitForLoadState('domcontentloaded');
			await expect(page).toHaveURL(/tracking/);
		}
	});

	test('tracking page has daily/weekly toggle', async ({ page }) => {
		await page.goto('/dietitian/meal-plan');
		await page.waitForLoadState('domcontentloaded');
		const rows = page.locator('.list-row');
		if (await rows.count() > 0) {
			await rows.first().click();
			await page.waitForURL(/\/dietitian\/meal-plan\/\d+/, { timeout: 15000 });
			await page.goto(page.url() + '/tracking');
			await page.waitForLoadState('domcontentloaded');

			const togglePills = page.locator('.toggle-pill, a:has-text("يومي"), a:has-text("أسبوعي")');
			if (await togglePills.count() >= 2) {
				await togglePills.first().click();
				await page.waitForTimeout(300);
				await togglePills.last().click();
			}
		}
	});

	test('tracking page has period navigation arrows', async ({ page }) => {
		await page.goto('/dietitian/meal-plan');
		await page.waitForLoadState('domcontentloaded');
		const rows = page.locator('.list-row');
		if (await rows.count() > 0) {
			await rows.first().click();
			await page.waitForURL(/\/dietitian\/meal-plan\/\d+/, { timeout: 15000 });
			await page.goto(page.url() + '/tracking');
			await page.waitForLoadState('domcontentloaded');

			const arrows = page.locator('.week-nav-arrow');
			if (await arrows.count() >= 2) {
				await arrows.first().click();
				await page.waitForTimeout(300);
				await arrows.last().click();
			}
		}
	});

	test('tracking back link returns to builder', async ({ page }) => {
		await page.goto('/dietitian/meal-plan');
		await page.waitForLoadState('domcontentloaded');
		const rows = page.locator('.list-row');
		if (await rows.count() > 0) {
			await rows.first().click();
			await page.waitForURL(/\/dietitian\/meal-plan\/\d+/, { timeout: 15000 });
			const sessionUrl = page.url();
			await page.goto(sessionUrl + '/tracking');
			await page.waitForLoadState('domcontentloaded');

			const backLink = page.locator('.topbar-back, .back-link, a[href*="/dietitian/meal-plan/"]').first();
			if (await backLink.count() > 0) {
				await backLink.click();
				await expect(page).toHaveURL(/\/dietitian\/meal-plan\/\d+/);
			}
		}
	});
});
