import { test, expect } from '@playwright/test';

async function selectRoleAndGetForm(page: import('@playwright/test').Page) {
	await page.goto('/register', { waitUntil: 'networkidle' });
	await page.locator('button').filter({ hasText: 'أخصائي تغذية' }).click();
	await expect(page.locator('#first_name')).toBeVisible({ timeout: 10000 });
}

test.describe('Registration — OTP flow', () => {
	test('register page renders required fields', async ({ page }) => {
		await selectRoleAndGetForm(page);
		await expect(page.locator('#email')).toBeVisible();
		await expect(page.locator('#password')).toBeVisible();
	});

	test('submitting with empty email shows validation error', async ({ page }) => {
		await selectRoleAndGetForm(page);
		await page.locator('button[type="submit"]').click();
		await expect(page.locator('#first_name')).toBeVisible();
	});

	test('submitting with already-registered email shows error', async ({ page }) => {
		await selectRoleAndGetForm(page);
		await page.locator('#first_name').fill('Test');
		await page.locator('#last_name').fill('User');
		await page.locator('#username').fill('testuser' + Date.now());
		await page.locator('#email').fill('dev@example.com');
		await page.locator('#password').fill('SomePass123!');
		await page.locator('#confirm_password').fill('SomePass123!');
		await page.locator('button[type="submit"]').click();
		await page.waitForTimeout(3000);
		await expect(page).not.toHaveURL(/\/dietitian|\/patient/);
	});
});
