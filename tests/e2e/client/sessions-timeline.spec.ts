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

test.describe('Patient — Sessions Timeline', () => {
	test.beforeEach(async ({ page }) => {
		await loginAsPatient(page);
	});

	test('sessions page loads without errors', async ({ page }) => {
		await page.goto('/patient/sessions');
		await expect(page).not.toHaveURL(/\/login/);
		await expect(page.locator('.page-title')).toBeVisible();
	});

	test('shows page title in Arabic', async ({ page }) => {
		await page.goto('/patient/sessions');
		await expect(page.locator('.page-title')).toContainText('الجلسات');
	});

	test('shows empty state when no sessions exist', async ({ page }) => {
		await page.goto('/patient/sessions');
		// Either sessions exist or empty state is shown
		const hasTimeline = await page.locator('.timeline-root').count() > 0;
		const hasEmpty = await page.locator('.empty-state').count() > 0;
		expect(hasTimeline || hasEmpty).toBe(true);
	});

	test('section headers use correct Arabic labels', async ({ page }) => {
		await page.goto('/patient/sessions');
		const timelineRoot = page.locator('.timeline-root');
		if (await timelineRoot.count() > 0) {
			const sectionTitles = page.locator('.section-title');
			const count = await sectionTitles.count();
			for (let i = 0; i < count; i++) {
				const text = await sectionTitles.nth(i).textContent();
				expect(['الحالية', 'السابقة']).toContain(text?.trim());
			}
		}
	});

	test('CTA buttons link to correct dashboard paths', async ({ page }) => {
		await page.goto('/patient/sessions');
		const ctaLinks = page.locator('.card-cta');
		const count = await ctaLinks.count();

		for (let i = 0; i < count; i++) {
			const href = await ctaLinks.nth(i).getAttribute('href');
			expect(href).toMatch(/\/patient\/dashboard\/\d+/);
		}
	});

	test('status badges have correct text', async ({ page }) => {
		await page.goto('/patient/sessions');
		const badges = page.locator('.status-badge');
		const count = await badges.count();
		for (let i = 0; i < count; i++) {
			const text = await badges.nth(i).textContent();
			expect(['نشطة', 'مكتملة']).toContain(text?.trim());
		}
	});

	test('session card navigates to dashboard on CTA click', async ({ page }) => {
		await page.goto('/patient/sessions');
		const ctaLink = page.locator('.card-cta').first();
		if (await ctaLink.count() > 0) {
			await ctaLink.click();
			await expect(page).toHaveURL(/\/patient\/dashboard\/\d+/);
		}
	});
});
