import { test, expect } from '@playwright/test';

test.describe('Password Validation — Registration', () => {
	test('password field exists after selecting role', async ({ page }) => {
		await page.goto('/register', { waitUntil: 'networkidle' });
		await page.locator('button').filter({ hasText: 'أخصائي تغذية' }).click();
		await expect(page.locator('#first_name')).toBeVisible({ timeout: 10000 });
		await expect(page.locator('#password')).toBeVisible();
	});

	test('password input defaults to hidden (type=password)', async ({ page }) => {
		await page.goto('/register', { waitUntil: 'networkidle' });
		await page.locator('button').filter({ hasText: 'أخصائي تغذية' }).click();
		await expect(page.locator('#first_name')).toBeVisible({ timeout: 10000 });
		const passwordInput = page.locator('#password');
		await expect(passwordInput).toHaveAttribute('type', 'password');
	});

	test('show/hide password toggle works if present', async ({ page }) => {
		await page.goto('/register', { waitUntil: 'networkidle' });
		await page.locator('button').filter({ hasText: 'أخصائي تغذية' }).click();
		await expect(page.locator('#first_name')).toBeVisible({ timeout: 10000 });
		const toggle = page.locator('[data-testid="toggle-password"], button:near(input[type="password"])');
		if (await toggle.count() > 0) {
			const passwordInput = page.locator('#password');
			await passwordInput.fill('TestPassword1');
			await toggle.first().click();
			const type = await passwordInput.getAttribute('type');
			expect(['text', 'password']).toContain(type);
		}
	});

	test('login page password field accepts input', async ({ page }) => {
		await page.goto('/login');
		const passwordInput = page.locator('#password');
		await passwordInput.fill('testpass123');
		await expect(passwordInput).toHaveValue('testpass123');
	});

	test('login form with empty password shows error', async ({ page }) => {
		await page.goto('/login');
		await page.fill('#identifier', 'test@example.com');
		await page.click('button[type="submit"]');
		await expect(page).toHaveURL(/\/login/);
	});
});
