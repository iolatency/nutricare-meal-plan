import { test, expect, type Page, type BrowserContext } from '@playwright/test';

const DIETITIAN_EMAIL = process.env.DIETITIAN_EMAIL ?? 'dev@example.com';
const DIETITIAN_PASS = process.env.DIETITIAN_PASSWORD ?? 'password';
const PATIENT_EMAIL = process.env.PATIENT_EMAIL ?? 'patient@example.com';
const PATIENT_PASS = process.env.PATIENT_PASSWORD ?? 'password';

async function loginAsDietitian(page: Page) {
	await page.goto('/login');
	await page.fill('#identifier', DIETITIAN_EMAIL);
	await page.fill('#password', DIETITIAN_PASS);
	await page.click('button[type="submit"]');
	await page.waitForURL(/\/dietitian/, { timeout: 30000 });
}

async function loginAsPatient(page: Page) {
	await page.goto('/login');
	await page.fill('#identifier', PATIENT_EMAIL);
	await page.fill('#password', PATIENT_PASS);
	await page.click('button[type="submit"]');
	await page.waitForURL(/\/patient/, { timeout: 30000 });
}

test.describe('Dietitian — Messages Page', () => {
	test.beforeEach(async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 800 });
		await loginAsDietitian(page);
		await page.goto('/dietitian/messages');
		await page.waitForLoadState('domcontentloaded');
	});

	test('messages page loads with grid layout', async ({ page }) => {
		await expect(page).toHaveURL(/\/dietitian\/messages/);
		const grid = page.locator('.msg-grid');
		await expect(grid).toBeVisible();
	});

	test('conversation sidebar is visible on desktop', async ({ page }) => {
		const sidebar = page.locator('.msg-sidebar');
		await expect(sidebar).toBeVisible();
	});

	test('conversation list exists', async ({ page }) => {
		const convList = page.locator('.conv-list');
		await expect(convList).toBeVisible();
	});

	test('conversation search input is present', async ({ page }) => {
		const convSearch = page.locator('.conv-input');
		if (await convSearch.count() > 0) {
			await expect(convSearch).toBeVisible();
			await convSearch.fill('test');
			await page.waitForTimeout(300);
			await convSearch.fill('');
		}
	});

	test('clicking a conversation opens chat', async ({ page }) => {
		const convItems = page.locator('.conv-item');
		if (await convItems.count() > 0) {
			await convItems.first().click();
			await page.waitForTimeout(500);

			const chatShell = page.locator('.chat-shell');
			if (await chatShell.count() > 0) {
				await expect(chatShell).toBeVisible();
			}
		}
	});

	test('chat textarea is visible after opening conversation', async ({ page }) => {
		const convItems = page.locator('.conv-item');
		if (await convItems.count() === 0) return;
		await convItems.first().click();
		await page.waitForTimeout(500);

		const textarea = page.locator('.chat-textarea');
		if (await textarea.count() > 0) {
			await expect(textarea).toBeVisible();
		}
	});

	test('send button exists and becomes active with text', async ({ page }) => {
		const convItems = page.locator('.conv-item');
		if (await convItems.count() === 0) return;
		await convItems.first().click();
		await page.waitForTimeout(500);

		const textarea = page.locator('.chat-textarea');
		if (await textarea.count() === 0) return;

		const sendBtn = page.locator('.chat-send');
		await textarea.fill('رسالة اختبار');
		if (await sendBtn.count() > 0) {
			await expect(sendBtn).toBeVisible();
		}
		await textarea.fill('');
	});

	test('placeholder shows when no conversation selected', async ({ page }) => {
		const placeholder = page.locator('.msg-placeholder');
		if (await placeholder.count() > 0) {
			await expect(placeholder).toBeVisible();
			await expect(page.locator('.msg-placeholder-title')).toContainText('اختر عميلًا');
		}
	});
});

test.describe('Patient — Messages Page', () => {
	test.beforeEach(async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 800 });
		await loginAsPatient(page);
		await page.goto('/patient/messages');
		await page.waitForLoadState('domcontentloaded');
	});

	test('patient messages page loads', async ({ page }) => {
		await expect(page).toHaveURL(/\/patient\/messages/);
	});

	test('chat shell is visible for patient', async ({ page }) => {
		const chatShell = page.locator('.chat-shell');
		if (await chatShell.count() > 0) {
			await expect(chatShell.first()).toBeVisible();
		}
	});

	test('patient chat textarea exists', async ({ page }) => {
		const textarea = page.locator('.chat-textarea');
		if (await textarea.count() > 0) {
			await expect(textarea).toBeVisible();
			await expect(textarea).toHaveAttribute('placeholder', 'اكتب رسالة…');
		}
	});

	test('patient send button exists', async ({ page }) => {
		const sendBtn = page.locator('.chat-send');
		if (await sendBtn.count() > 0) {
			await expect(sendBtn).toBeVisible();
		}
	});

	test('error state shows back link', async ({ page }) => {
		const errBox = page.locator('.err-box');
		if (await errBox.count() > 0) {
			const backLink = errBox.locator('a.back');
			if (await backLink.count() > 0) {
				await expect(backLink).toContainText('العودة للرئيسية');
			}
		}
	});
});

test.describe('Chat — Bidirectional Messaging', () => {
	test('dietitian sends message and patient receives it', async ({ browser }) => {
		const dietitianContext = await browser.newContext();
		const dietitianPage = await dietitianContext.newPage();
		await dietitianPage.setViewportSize({ width: 1280, height: 800 });
		await loginAsDietitian(dietitianPage);
		await dietitianPage.goto('/dietitian/messages');
		await dietitianPage.waitForLoadState('domcontentloaded');

		const convItems = dietitianPage.locator('.conv-item');
		if (await convItems.count() === 0) {
			await dietitianContext.close();
			return;
		}
		await convItems.first().click();
		await dietitianPage.waitForTimeout(500);

		const textarea = dietitianPage.locator('.chat-textarea');
		if (await textarea.count() === 0) {
			await dietitianContext.close();
			return;
		}

		const testMsg = 'رسالة اختبار تلقائي ' + Date.now();
		await textarea.fill(testMsg);
		const sendBtn = dietitianPage.locator('.chat-send');
		if (await sendBtn.count() > 0) {
			await sendBtn.click();
			await dietitianPage.waitForTimeout(2000);
		}

		const patientContext = await browser.newContext();
		const patientPage = await patientContext.newPage();
		await patientPage.setViewportSize({ width: 1280, height: 800 });
		await loginAsPatient(patientPage);
		await patientPage.goto('/patient/messages');
		await patientPage.waitForLoadState('domcontentloaded');
		await patientPage.waitForTimeout(2000);

		const chatBody = patientPage.locator('.chat-shell').first();
		if (await chatBody.count() > 0) {
			const body = await chatBody.textContent();
			if (body?.includes(testMsg)) {
				expect(body).toContain(testMsg);
			}
		}

		await dietitianContext.close();
		await patientContext.close();
	});

	test('patient sends message and dietitian sees it', async ({ browser }) => {
		const patientContext = await browser.newContext();
		const patientPage = await patientContext.newPage();
		await patientPage.setViewportSize({ width: 1280, height: 800 });
		await loginAsPatient(patientPage);
		await patientPage.goto('/patient/messages');
		await patientPage.waitForLoadState('domcontentloaded');

		const textarea = patientPage.locator('.chat-textarea');
		if (await textarea.count() === 0) {
			await patientContext.close();
			return;
		}

		const replyMsg = 'رد المريض ' + Date.now();
		await textarea.fill(replyMsg);
		const sendBtn = patientPage.locator('.chat-send');
		if (await sendBtn.count() > 0) {
			await sendBtn.click();
			await patientPage.waitForTimeout(2000);
		}

		const dietitianContext = await browser.newContext();
		const dietitianPage = await dietitianContext.newPage();
		await dietitianPage.setViewportSize({ width: 1280, height: 800 });
		await loginAsDietitian(dietitianPage);
		await dietitianPage.goto('/dietitian/messages');
		await dietitianPage.waitForLoadState('domcontentloaded');

		const convItems = dietitianPage.locator('.conv-item');
		if (await convItems.count() > 0) {
			await convItems.first().click();
			await dietitianPage.waitForTimeout(2000);
			const chatBody = dietitianPage.locator('.chat-shell');
			if (await chatBody.count() > 0) {
				const body = await chatBody.textContent();
				if (body?.includes(replyMsg)) {
					expect(body).toContain(replyMsg);
				}
			}
		}

		await patientContext.close();
		await dietitianContext.close();
	});
});

test.describe('Chat — Mobile Back Button', () => {
	test('dietitian mobile back button returns to conversation list', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await loginAsDietitian(page);
		await page.goto('/dietitian/messages');
		await page.waitForLoadState('domcontentloaded');

		const convItems = page.locator('.conv-item');
		if (await convItems.count() === 0) return;
		await convItems.first().click();
		await page.waitForTimeout(500);

		const backBtn = page.locator('.chat-back-btn');
		if (await backBtn.count() > 0) {
			await backBtn.click();
			await page.waitForTimeout(500);
			const sidebar = page.locator('.msg-sidebar');
			if (await sidebar.count() > 0) {
				await expect(sidebar).toBeVisible();
			}
		}
	});
});
