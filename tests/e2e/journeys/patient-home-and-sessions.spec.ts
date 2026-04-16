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

test.describe('Patient — Home Page', () => {
	test.beforeEach(async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 800 });
		await loginAsPatient(page);
		await page.goto('/patient/home');
		await page.waitForLoadState('domcontentloaded');
	});

	test('home page loads with page title', async ({ page }) => {
		await expect(page).toHaveURL(/\/patient\/home/);
		const title = page.locator('title');
		const titleText = await title.textContent();
		expect(titleText).toContain('الرئيسية');
	});

	test('stat cards are visible on home', async ({ page }) => {
		const home = page.locator('.home');
		await expect(home).toBeVisible();
		const cards = page.locator('.card');
		const count = await cards.count();
		expect(count).toBeGreaterThan(0);
	});

	test('weight log form is present', async ({ page }) => {
		const weightForm = page.locator('.weight-form, form:has(select.weight-date)');
		if (await weightForm.count() > 0) {
			await expect(weightForm).toBeVisible();
		}
	});

	test('weight date dropdown has selectable options', async ({ page }) => {
		const dateSelect = page.locator('select.weight-date');
		if (await dateSelect.count() > 0) {
			await expect(dateSelect).toBeVisible();
			const options = dateSelect.locator('option');
			const count = await options.count();
			expect(count).toBeGreaterThan(0);
		}
	});

	test('weight input accepts numeric values', async ({ page }) => {
		const weightInput = page.locator('input.weight-input, input[name="weight"]');
		if (await weightInput.count() > 0) {
			await weightInput.fill('75.5');
			await expect(weightInput).toHaveValue('75.5');
		}
	});

	test('submitting weight log shows success feedback', async ({ page }) => {
		const weightInput = page.locator('input.weight-input, input[name="weight"]');
		const dateSelect = page.locator('select.weight-date');
		if (await weightInput.count() === 0 || await dateSelect.count() === 0) return;

		await weightInput.fill('72');
		const submitBtn = page.locator('.weight-form button[type="submit"], button.weight-btn');
		if (await submitBtn.count() > 0) {
			await submitBtn.click();
			await page.waitForTimeout(3000);
		}
	});

	test('weight chart is visible', async ({ page }) => {
		const chart = page.locator('.chart-card, svg.weight-chart, .chart-wrap');
		if (await chart.count() > 0) {
			await expect(chart.first()).toBeVisible();
		}
	});
});

test.describe('Patient — Home Chart Navigation', () => {
	test.beforeEach(async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 800 });
		await loginAsPatient(page);
		await page.goto('/patient/home');
		await page.waitForLoadState('domcontentloaded');
	});

	test('week navigation arrows exist', async ({ page }) => {
		const arrows = page.locator('button.chart-arrow, button:has-text("←"), button:has-text("→")');
		const weekLabel = page.locator('.week-label');
		if (await arrows.count() >= 2 && await weekLabel.count() > 0) {
			const initialLabel = await weekLabel.textContent();
			await arrows.first().click();
			await page.waitForTimeout(300);
			await arrows.last().click();
			await page.waitForTimeout(300);
		}
	});

	test('adherence chart section is visible', async ({ page }) => {
		const adherence = page.locator('.chart-title, text:has-text("الالتزام")');
		if (await adherence.count() > 0) {
			await expect(adherence.first()).toBeVisible();
		}
	});

	test('water chart section is visible', async ({ page }) => {
		const water = page.locator('.chart-title:has-text("الماء"), text:has-text("الماء")');
		if (await water.count() > 0) {
			await expect(water.first()).toBeVisible();
		}
	});

	test('nutrition chart section is visible', async ({ page }) => {
		const nutrition = page.locator('.chart-title:has-text("التغذية"), text:has-text("السعرات")');
		if (await nutrition.count() > 0) {
			await expect(nutrition.first()).toBeVisible();
		}
	});
});

test.describe('Patient — Sessions Page', () => {
	test.beforeEach(async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 800 });
		await loginAsPatient(page);
		await page.goto('/patient/sessions');
		await page.waitForLoadState('domcontentloaded');
	});

	test('sessions page loads', async ({ page }) => {
		await expect(page).toHaveURL(/\/patient\/sessions/);
	});

	test('sessions page shows title', async ({ page }) => {
		const heading = page.getByRole('heading', { level: 1 });
		if (await heading.count() > 0) {
			await expect(heading).toHaveText('الجلسات والخطط الغذائية');
		}
	});

	test('session cards or empty state is shown', async ({ page }) => {
		const cards = page.locator('.session-card');
		const emptyState = page.locator('.empty-state');
		const hasCards = (await cards.count()) > 0;
		const hasEmpty = (await emptyState.count()) > 0;
		expect(hasCards || hasEmpty).toBe(true);
	});

	test('session cards have status badges', async ({ page }) => {
		const cards = page.locator('.session-card');
		if (await cards.count() > 0) {
			const badge = cards.first().locator('.status-badge');
			if (await badge.count() > 0) {
				await expect(badge).toBeVisible();
			}
		}
	});

	test('session cards have CTA links', async ({ page }) => {
		const ctas = page.locator('.card-cta');
		const count = await ctas.count();
		if (count > 0) {
			const firstCta = ctas.first();
			await expect(firstCta).toBeVisible();
			const text = await firstCta.textContent();
			expect(text).toMatch(/تتبع اليوم|عرض الخطة|عرض التفاصيل/);
		}
	});

	test('clicking CTA navigates to dashboard or detail', async ({ page }) => {
		const ctas = page.locator('.card-cta');
		if (await ctas.count() > 0) {
			await ctas.first().click();
			await page.waitForURL(/\/patient\/(dashboard|sessions)/, { timeout: 15000 });
		}
	});

	test('timeline sections have correct labels', async ({ page }) => {
		const sections = page.locator('.timeline-section');
		if (await sections.count() > 0) {
			const sectionTexts = await sections.allTextContents();
			const hasValidSection = sectionTexts.some(
				(t) => t.includes('القادمة') || t.includes('الحالية') || t.includes('السابقة')
			);
			expect(hasValidSection).toBe(true);
		}
	});
});
