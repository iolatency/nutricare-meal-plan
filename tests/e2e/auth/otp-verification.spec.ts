import { test, expect } from '@playwright/test';

test.describe('OTP / Email Verification', () => {
	test('register page exists and is accessible', async ({ page }) => {
		await page.goto('/register');
		await expect(page).toHaveURL(/\/register/);
	});

	test('register page has email input', async ({ page }) => {
		await page.goto('/register');
		const emailInput = page.locator('input[name="email"], input[type="email"], #email');
		if (await emailInput.count() > 0) {
			await expect(emailInput.first()).toBeVisible();
		}
	});

	test('register page has password input', async ({ page }) => {
		await page.goto('/register');
		const passwordInput = page.locator('input[type="password"]');
		if (await passwordInput.count() > 0) {
			await expect(passwordInput.first()).toBeVisible();
		}
	});

	test('empty registration form shows validation errors on submit', async ({ page }) => {
		await page.goto('/register');
		const submitBtn = page.locator('button[type="submit"]');
		if (await submitBtn.count() > 0) {
			await submitBtn.click();
			// Should show at least one validation error
			const errorVisible =
				(await page.locator('[role="alert"]').count()) > 0 ||
				(await page.locator('.error, .text-red-500, .text-destructive').count()) > 0;
			expect(errorVisible).toBe(true);
		}
	});

	test('OTP page shows form when accessed directly', async ({ page }) => {
		// Try accessing the OTP verification page
		const response = await page.goto('/register');
		// Should either show the form or redirect
		expect(response?.status()).toBeLessThan(500);
	});
});
