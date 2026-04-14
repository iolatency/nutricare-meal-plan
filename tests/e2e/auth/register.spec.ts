import { test, expect } from '@playwright/test';
async function gotoRegister(page: import('@playwright/test').Page) {
	await page.goto('/register', { waitUntil: 'networkidle' });
}

test.describe('Registration page', () => {
	test('shows role selection step on first load', async ({ page }) => {
		await gotoRegister(page);
		await expect(page.getByText('إنشاء حساب')).toBeVisible();
		await expect(page.locator('button').filter({ hasText: 'أخصائي تغذية' })).toBeVisible();
		await expect(page.locator('button').filter({ hasText: 'مريض' })).toBeVisible();
	});

	test('clicking dietitian role reveals the registration form', async ({ page }) => {
		await gotoRegister(page);
		await page.locator('button').filter({ hasText: 'أخصائي تغذية' }).click();
		await expect(page.locator('#first_name')).toBeVisible();
		await expect(page.locator('#last_name')).toBeVisible();
		await expect(page.locator('#email')).toBeVisible();
		await expect(page.locator('#username')).toBeVisible();
		await expect(page.locator('#password')).toBeVisible();
	});

	test('clicking patient role reveals the registration form', async ({ page }) => {
		await gotoRegister(page);
		await page.locator('button').filter({ hasText: 'مريض' }).click();
		await expect(page.locator('#first_name')).toBeVisible();
		await expect(page.locator('#email')).toBeVisible();
	});

	test('submitting empty form shows validation errors', async ({ page }) => {
		await gotoRegister(page);
		await page.locator('button').filter({ hasText: 'أخصائي تغذية' }).click();
		await expect(page.locator('#first_name')).toBeVisible();
		await page.locator('button[type="submit"]').click();
		// Validation errors appear as paragraph elements containing "مطلوب" (required)
		await expect(page.locator('p').filter({ hasText: 'مطلوب' }).first()).toBeVisible();
	});

	test('back button returns to role selection', async ({ page }) => {
		await gotoRegister(page);
		await page.locator('button').filter({ hasText: 'أخصائي تغذية' }).click();
		await expect(page.locator('#first_name')).toBeVisible();
		await page.locator('button').filter({ hasText: 'العودة لاختيار نوع الحساب' }).click();
		await expect(page.getByText('اختر نوع الحساب')).toBeVisible();
	});

	test('link to login page is present on role selection step', async ({ page }) => {
		await gotoRegister(page);
		await expect(page.getByRole('link', { name: 'دخول' })).toBeVisible();
	});
});
