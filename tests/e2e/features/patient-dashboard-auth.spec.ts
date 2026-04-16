import { expect, test } from '@playwright/test';

test.describe('Patient dashboard protections', () => {
	test('unauthenticated access is denied', async ({ request }) => {
		const response = await request.get('/patient/dashboard/1');
		// SvelteKit may return 200 with redirect in HTML, 302 redirect, or 401
		expect([200, 302, 401]).toContain(response.status());
		if (response.status() === 200) {
			const body = await response.text();
			const redirectsToLogin = body.includes('/login') || body.includes('تسجيل الدخول');
			expect(redirectsToLogin).toBe(true);
		}
	});
});
