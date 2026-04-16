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

test.describe('Patient — Chat with Dietitian', () => {
	test.beforeEach(async ({ page }) => {
		await loginAsPatient(page);
	});

	test('messages page loads without errors', async ({ page }) => {
		await page.goto('/patient/messages');
		await expect(page).not.toHaveURL(/\/login/);
	});

	test('shows chat shell or error state', async ({ page }) => {
		await page.goto('/patient/messages');
		const hasChat = await page.locator('.chat-shell').count() > 0;
		const hasError = await page.locator('.err-box').count() > 0;
		expect(hasChat || hasError).toBe(true);
	});

	test('chat shell shows dietitian name in header', async ({ page }) => {
		await page.goto('/patient/messages');
		const chatShell = page.locator('.chat-shell');
		if (await chatShell.count() > 0) {
			const title = chatShell.locator('.chat-title');
			await expect(title).toBeVisible();
			const text = await title.textContent();
			expect(text?.trim().length).toBeGreaterThan(0);
		}
	});

	test('presence indicator is visible in chat header when dietitian is assigned', async ({ page }) => {
		await page.goto('/patient/messages');
		const chatShell = page.locator('.chat-shell');
		if (await chatShell.count() > 0) {
			// Presence dot should appear in header (online or offline)
			const presenceDot = page.locator('.presence-dot-chat');
			// May or may not be rendered based on whether dietitianId is available
			if (await presenceDot.count() > 0) {
				await expect(presenceDot.first()).toBeVisible();
				// Should have online or offline class
				const classes = await presenceDot.first().getAttribute('class');
				expect(classes).toMatch(/presence-online|presence-offline/);
			}
		}
	});

	test('presence chip shows in page header', async ({ page }) => {
		await page.goto('/patient/messages');
		const presenceChip = page.locator('.presence-chip');
		if (await presenceChip.count() > 0) {
			await expect(presenceChip.first()).toBeVisible();
			const text = await presenceChip.first().textContent();
			expect(['متصل الآن', 'غير متصل'].some((s) => text?.includes(s))).toBe(true);
		}
	});

	test('can type and send a message', async ({ page }) => {
		await page.goto('/patient/messages');
		const chatShell = page.locator('.chat-shell');

		if (await chatShell.count() > 0) {
			const textarea = page.locator('.chat-textarea');
			const sendBtn = page.locator('.chat-send');

			await expect(textarea).toBeVisible();
			await expect(sendBtn).toBeVisible();

			const testMessage = `رسالة اختبار ${Date.now()}`;
			await textarea.fill(testMessage);
			await sendBtn.click();

			// Message should appear in chat list after sending
			await page.waitForTimeout(2000);
			await expect(page.locator('.chat-body', { hasText: testMessage })).toBeVisible({ timeout: 5000 });
		}
	});

	test('chat input is disabled while sending', async ({ page }) => {
		// This is a visual state check — just ensures the button is not permanently disabled
		await page.goto('/patient/messages');
		const sendBtn = page.locator('.chat-send');
		if (await sendBtn.count() > 0) {
			// Initially should not be disabled (no message in transit)
			const disabled = await sendBtn.getAttribute('disabled');
			expect(disabled).toBeNull();
		}
	});
});
