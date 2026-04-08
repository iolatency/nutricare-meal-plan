import { test, expect } from '@playwright/test';

test.describe('Login page', () => {
	test('unauthenticated visit to / redirects to /login', async ({ page }) => {
		await page.goto('/');
		await expect(page).toHaveURL(/\/login/);
	});

	test('login page renders email and password fields', async ({ page }) => {
		await page.goto('/login');
		await expect(page.locator('#identifier')).toBeVisible();
		await expect(page.locator('#password')).toBeVisible();
		await expect(page.locator('button[type="submit"]')).toBeVisible();
	});

	test('shows error for wrong credentials', async ({ page }) => {
		await page.goto('/login');
		await page.fill('#identifier', 'wrong@example.com');
		await page.fill('#password', 'wrongpassword');
		await page.click('button[type="submit"]');
		await expect(page.locator('[role="alert"]')).toBeVisible();
	});

	test('successful login with dev user redirects away from /login', async ({ page }) => {
		// Requires: npm run db:seed-dev-user to have been run once
		await page.goto('/login');
		await page.fill('#identifier', 'dev@example.com');
		await page.fill('#password', 'password');
		await page.click('button[type="submit"]');
		await expect(page).not.toHaveURL(/\/login/);
	});
});
