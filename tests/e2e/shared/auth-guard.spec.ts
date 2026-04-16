import { test, expect } from '@playwright/test';

/**
 * Auth guard — ensures protected routes redirect unauthenticated users
 */
const PROTECTED_PATIENT_ROUTES = [
	'/patient/sessions',
	'/patient/recipes',
	'/patient/messages',
];

const PROTECTED_DIETITIAN_ROUTES = [
	'/dietitian/meal-plan',
	'/dietitian/recipes',
	'/dietitian/foods',
	'/dietitian/messages',
];

test.describe('Auth guard — patient routes', () => {
	for (const route of PROTECTED_PATIENT_ROUTES) {
		test(`${route} redirects to /login when not authenticated`, async ({ page }) => {
			await page.goto(route);
			await expect(page).toHaveURL(/\/login/);
		});
	}
});

test.describe('Auth guard — dietitian routes', () => {
	for (const route of PROTECTED_DIETITIAN_ROUTES) {
		test(`${route} redirects to /login when not authenticated`, async ({ page }) => {
			await page.goto(route);
			await expect(page).toHaveURL(/\/login/);
		});
	}
});
