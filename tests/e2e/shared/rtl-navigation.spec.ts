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

test.describe('RTL layout and direction', () => {
	test.beforeEach(async ({ page }) => {
		await loginAsPatient(page);
	});

	test('patient layout shell has dir=rtl', async ({ page }) => {
		await page.goto('/patient/sessions');
		const dir = await page.locator('.layout-shell').getAttribute('dir');
		expect(dir).toBe('rtl');
	});

	test('chat shell has dir=rtl', async ({ page }) => {
		await page.goto('/patient/messages');
		const chatShell = page.locator('.chat-shell');
		if (await chatShell.count() > 0) {
			const dir = await chatShell.getAttribute('dir');
			expect(dir).toBe('rtl');
		}
	});

	test('sessions page has dir=rtl on root element', async ({ page }) => {
		await page.goto('/patient/sessions');
		const dir = await page.locator('.page').getAttribute('dir');
		expect(dir).toBe('rtl');
	});

	test('recipes page has dir=rtl on root element', async ({ page }) => {
		await page.goto('/patient/recipes');
		const dir = await page.locator('.page').getAttribute('dir');
		expect(dir).toBe('rtl');
	});
});
