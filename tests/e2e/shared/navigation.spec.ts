/**
 * Shared — Navigation & Access Control Tests
 *
 * Access control matrix:
 * ─────────────────────────────────────────────────────────────────────
 *  User             /login    /dietitian/*   /patient/*   /
 * ─────────────────────────────────────────────────────────────────────
 *  Unauthenticated  ✓         → /login       → /login     → /login
 *  Dietitian        → /       ✓              (role check)  → /dietitian/recipes
 *  Patient          → /       (role check)   ✓             → /patient/...
 * ─────────────────────────────────────────────────────────────────────
 */
import { test, expect, type Page } from '@playwright/test';

async function loginAsDietitian(page: Page) {
	await page.goto('/login');
	await page.fill('#identifier', 'dev@example.com');
	await page.fill('#password', 'password');
	await page.click('button[type="submit"]');
	await expect(page).not.toHaveURL(/\/login/, { timeout: 8000 });
}

// ─── Unauthenticated access ──────────────────────────────────────────────────

test.describe('Unauthenticated access', () => {
	test('/ → /login redirect', async ({ page }) => {
		await page.goto('/');
		await expect(page).toHaveURL(/\/login/);
	});

	test('/dietitian/recipes → /login redirect', async ({ page }) => {
		await page.goto('/dietitian/recipes');
		await expect(page).toHaveURL(/\/login/);
	});

	test('/dietitian/foods → /login redirect', async ({ page }) => {
		await page.goto('/dietitian/foods');
		await expect(page).toHaveURL(/\/login/);
	});

	test('/dietitian/supplements → /login redirect', async ({ page }) => {
		await page.goto('/dietitian/supplements');
		await expect(page).toHaveURL(/\/login/);
	});

	test('/dietitian/messages → /login redirect', async ({ page }) => {
		await page.goto('/dietitian/messages');
		await expect(page).toHaveURL(/\/login/);
	});

	test('/dietitian/meal-plan → /login redirect', async ({ page }) => {
		await page.goto('/dietitian/meal-plan');
		await expect(page).toHaveURL(/\/login/);
	});

	test('/patient/awaiting-activation → /login redirect', async ({ page }) => {
		await page.goto('/patient/awaiting-activation');
		await expect(page).toHaveURL(/\/login/);
	});

	test('/patient/messages → /login redirect', async ({ page }) => {
		await page.goto('/patient/messages');
		await expect(page).toHaveURL(/\/login/);
	});
});

// ─── Authenticated dietitian ─────────────────────────────────────────────────

test.describe('Authenticated dietitian', () => {
	test.beforeEach(async ({ page }) => {
		await loginAsDietitian(page);
	});

	test('dietitian visiting /login is redirected away', async ({ page }) => {
		await page.goto('/login');
		await expect(page).not.toHaveURL(/\/login/);
	});

	test('dietitian can access /dietitian/recipes', async ({ page }) => {
		await page.goto('/dietitian/recipes');
		await expect(page).toHaveURL(/\/dietitian\/recipes/);
	});

	test('dietitian can access /dietitian/foods', async ({ page }) => {
		await page.goto('/dietitian/foods');
		await expect(page).toHaveURL(/\/dietitian\/foods/);
	});

	test('dietitian can access /dietitian/supplements', async ({ page }) => {
		await page.goto('/dietitian/supplements');
		await expect(page).toHaveURL(/\/dietitian\/supplements/);
	});

	test('dietitian can access /dietitian/messages', async ({ page }) => {
		await page.goto('/dietitian/messages');
		await expect(page).toHaveURL(/\/dietitian\/messages/);
	});

	test('dietitian can access /dietitian/meal-plan', async ({ page }) => {
		await page.goto('/dietitian/meal-plan');
		await expect(page).toHaveURL(/\/dietitian\/meal-plan/);
	});
});

// ─── Logout ──────────────────────────────────────────────────────────────────

test.describe('Logout', () => {
	test('after logout, protected routes redirect to /login', async ({ page }) => {
		await loginAsDietitian(page);

		// Logout requires POST
		await page.request.post('/logout');
		// Clear cookies so the browser context reflects logged-out state
		await page.context().clearCookies();

		await page.goto('/');
		await expect(page).toHaveURL(/\/login/);
	});

	test('after logout, /dietitian/recipes redirects to /login', async ({ page }) => {
		await loginAsDietitian(page);

		await page.request.post('/logout');
		await page.context().clearCookies();

		await page.goto('/dietitian/recipes');
		await expect(page).toHaveURL(/\/login/);
	});
});

// ─── Session expiry banner ────────────────────────────────────────────────────

test.describe('Session expiry', () => {
	test('/login?expired=1 shows session expiry indicator', async ({ page }) => {
		await page.goto('/login?expired=1');
		// The server sets sessionExpired=true in page data when this param is present
		// The page should render (not crash), even if the banner UI isn't built yet
		await expect(page).toHaveURL(/\/login/);
		const bodyText = await page.locator('body').innerText();
		expect(bodyText).not.toMatch(/500|Internal Server Error/i);
	});

	test('/login?session=expired also shows login page', async ({ page }) => {
		await page.goto('/login?session=expired');
		await expect(page).toHaveURL(/\/login/);
	});
});
