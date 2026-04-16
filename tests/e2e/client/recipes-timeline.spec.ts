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

test.describe('Patient — Recipes Timeline', () => {
	test.beforeEach(async ({ page }) => {
		await loginAsPatient(page);
	});

	test('recipes page loads without errors', async ({ page }) => {
		await page.goto('/patient/recipes');
		await expect(page).not.toHaveURL(/\/login/);
		await expect(page.locator('.page-title')).toBeVisible();
	});

	test('shows page title in Arabic', async ({ page }) => {
		await page.goto('/patient/recipes');
		await expect(page.locator('.page-title')).toContainText('وصفات');
	});

	test('shows empty state or recipe groups', async ({ page }) => {
		await page.goto('/patient/recipes');
		const hasGroups = await page.locator('.groups-list').count() > 0;
		const hasEmpty = await page.locator('.empty-state').count() > 0;
		expect(hasGroups || hasEmpty).toBe(true);
	});

	test('recipe cards have expandable ingredient lists', async ({ page }) => {
		await page.goto('/patient/recipes');
		const firstCard = page.locator('.recipe-card').first();
		if (await firstCard.count() > 0) {
			const header = firstCard.locator('.recipe-header');
			await header.click();
			const body = firstCard.locator('.recipe-body');
			await expect(body).toBeVisible();
		}
	});

	test('expanded recipe shows ingredients', async ({ page }) => {
		await page.goto('/patient/recipes');
		const firstCard = page.locator('.recipe-card').first();
		if (await firstCard.count() > 0) {
			const header = firstCard.locator('.recipe-header');
			await header.click();
			const body = firstCard.locator('.recipe-body');
			if (await body.count() > 0) {
				// Should have either ingredients list or steps or both
				const hasIngredients = await body.locator('.ingredients-list').count() > 0;
				const hasSteps = await body.locator('.steps-section').count() > 0;
				expect(hasIngredients || hasSteps).toBe(true);
			}
		}
	});

	test('no duplicate recipe cards across groups', async ({ page }) => {
		await page.goto('/patient/recipes');
		const recipeNames = await page.locator('.recipe-name').allTextContents();
		const uniqueNames = new Set(recipeNames);
		// All recipe names should be unique (no duplicates)
		expect(recipeNames.length).toBe(uniqueNames.size);
	});

	test('group headers show valid session status badges', async ({ page }) => {
		await page.goto('/patient/recipes');
		const statusBadges = page.locator('.group-status');
		const count = await statusBadges.count();
		for (let i = 0; i < count; i++) {
			const text = await statusBadges.nth(i).textContent();
			expect(['نشطة', 'مكتملة', 'مسودة']).toContain(text?.trim());
		}
	});

	test('macro pills show on recipe cards', async ({ page }) => {
		await page.goto('/patient/recipes');
		const firstCard = page.locator('.recipe-card').first();
		if (await firstCard.count() > 0) {
			const macroPills = firstCard.locator('.macro-pills .pill');
			const count = await macroPills.count();
			// If recipe has macros, pills should be shown
			if (count > 0) {
				const firstPill = await macroPills.first().textContent();
				expect(firstPill?.length).toBeGreaterThan(0);
			}
		}
	});
});
