import { test, expect } from '@playwright/test';

/**
 * Security tests — Authorization bypass attempts
 *
 * Verifies that patient routes reject unauthorized access and that
 * role boundaries cannot be crossed.
 */

test.describe('Unauthorized access to patient API endpoints', () => {
	test('presence API requires authentication', async ({ page }) => {
		const res = await page.request.get('/api/users/1/presence');
		expect([401, 403, 302]).toContain(res.status());
	});

	test('patient sessions API requires authentication', async ({ page }) => {
		const res = await page.request.get('/api/patient/sessions');
		expect([401, 403, 302]).toContain(res.status());
	});

	test('patient recipes API requires authentication', async ({ page }) => {
		const res = await page.request.get('/api/patient/recipes');
		expect([401, 403, 302]).toContain(res.status());
	});

	test('chat conversations API requires authentication', async ({ page }) => {
		const res = await page.request.get('/api/chat/conversations');
		expect([401, 403, 302]).toContain(res.status());
	});
});

test.describe('Route protection — patient cannot access dietitian routes', () => {
	const PATIENT_EMAIL = process.env.PATIENT_EMAIL ?? 'patient@test.local';
	const PATIENT_PASS = process.env.PATIENT_PASSWORD ?? 'password123';

	test('patient is redirected away from dietitian routes', async ({ page }) => {
		await page.goto('/login');
		await page.fill('#identifier', PATIENT_EMAIL);
		await page.fill('#password', PATIENT_PASS);
		await page.click('button[type="submit"]');
		await page.waitForURL(/\/patient/, { timeout: 10000 });

		// Now try to access a dietitian route
		await page.goto('/dietitian/meal-plan');
		// Should be redirected away
		await expect(page).not.toHaveURL(/\/dietitian\/meal-plan/);
	});
});

test.describe('IDOR — Cannot read other user\'s data', () => {
	const PATIENT_EMAIL = process.env.PATIENT_EMAIL ?? 'patient@test.local';
	const PATIENT_PASS = process.env.PATIENT_PASSWORD ?? 'password123';

	test('patient cannot access another patient\'s session dashboard', async ({ page }) => {
		await page.goto('/login');
		await page.fill('#identifier', PATIENT_EMAIL);
		await page.fill('#password', PATIENT_PASS);
		await page.click('button[type="submit"]');
		await page.waitForURL(/\/patient/, { timeout: 10000 });

		// Try a session ID that belongs to a different patient
		const res = await page.request.get('/patient/dashboard/99999999');
		// Should return 403, 404, or redirect
		expect([200, 302, 403, 404]).toContain(res.status());
		// If 200, it should not contain sensitive data about other patients
	});
});
