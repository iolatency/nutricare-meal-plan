/**
 * Security — HTTP Headers & OWASP Hardening Tests
 *
 * Verifies that the server sends security headers aligned with OWASP best
 * practices and Saudi PDPL data protection requirements.
 *
 * Run against the dev server: npm run dev
 */
import { test, expect } from '@playwright/test';

test.describe('Security Headers', () => {
	test('login page responds with 200', async ({ page }) => {
		const res = await page.request.get('/login');
		expect(res.status()).toBe(200);
	});

	test('Content-Type header is set', async ({ page }) => {
		const res = await page.request.get('/login');
		const ct = res.headers()['content-type'];
		expect(ct).toBeTruthy();
		expect(ct).toContain('text/html');
	});

	test('server does not expose version info in headers', async ({ page }) => {
		const res = await page.request.get('/login');
		const headers = res.headers();
		// Should not expose internal server version
		expect(headers['x-powered-by']).toBeUndefined();
	});

	test('session cookie is HttpOnly', async ({ page }) => {
		await page.goto('/login');
		await page.fill('#identifier', 'dev@example.com');
		await page.fill('#password', 'password');

		const [response] = await Promise.all([
			page.waitForResponse((r) => r.url().includes('/login')),
			page.click('button[type="submit"]')
		]);

		const setCookie = response.headers()['set-cookie'] ?? '';
		if (setCookie.includes('nc_session')) {
			expect(setCookie.toLowerCase()).toContain('httponly');
		}
	});

	test('session cookie has SameSite attribute', async ({ page }) => {
		await page.goto('/login');
		await page.fill('#identifier', 'dev@example.com');
		await page.fill('#password', 'password');

		const [response] = await Promise.all([
			page.waitForResponse((r) => r.url().includes('/login')),
			page.click('button[type="submit"]')
		]);

		const setCookie = response.headers()['set-cookie'] ?? '';
		if (setCookie.includes('nc_session')) {
			expect(setCookie.toLowerCase()).toMatch(/samesite=(strict|lax)/);
		}
	});
});

test.describe('CORS & API Security', () => {
	test('API endpoints do not expose unrestricted CORS', async ({ page }) => {
		const res = await page.request.get('/api/supplements', {
			headers: { Origin: 'http://evil.attacker.com' }
		});
		const corsHeader = res.headers()['access-control-allow-origin'] ?? '';
		// Should NOT be '*' or the attacker domain
		expect(corsHeader).not.toBe('*');
		expect(corsHeader).not.toBe('http://evil.attacker.com');
	});

	test('API endpoints require authentication — no open endpoints', async ({ page, context }) => {
		await context.clearCookies();
		const protectedEndpoints = [
			'/api/supplements',
			'/api/chat/conversations',
			'/api/foods/search?q=test'
		];
		for (const endpoint of protectedEndpoints) {
			const res = await page.request.get(endpoint);
			expect(res.status()).toBe(401);
		}
	});

	test('POST /api/ai/meal-plan rejects unauthenticated requests', async ({ page, context }) => {
		await context.clearCookies();
		const res = await page.request.post('/api/ai/meal-plan', {
			data: { targetCalories: 2000 }
		});
		expect(res.status()).toBe(401);
	});

	test('POST /api/ai/recipe rejects unauthenticated requests', async ({ page, context }) => {
		await context.clearCookies();
		const res = await page.request.post('/api/ai/recipe', {
			data: { prompt: 'test recipe' }
		});
		// Endpoint checks role before auth, so 403 is also a valid rejection
		expect([401, 403]).toContain(res.status());
	});
});

test.describe('Rate Limiting', () => {
	test('login endpoint handles repeated failures gracefully', async ({ page }) => {
		const statuses: number[] = [];
		for (let i = 0; i < 10; i++) {
			const res = await page.request.post('/login', {
				form: { identifier: 'bruteforce@test.sa', password: 'wrong' }
			});
			statuses.push(res.status());
		}
		// All responses must be < 500 (no server crash)
		expect(statuses.every((s) => s < 500)).toBe(true);
		// After many failures, either still 400 or rate-limited (429)
		expect(statuses.every((s) => s === 400 || s === 429 || s === 302 || s === 200)).toBe(true);
	});
});

test.describe('Input Validation', () => {
	test('supplement endpoint rejects very large input without crashing', async ({ page }) => {
		await page.goto('/login');
		await page.fill('#identifier', 'dev@example.com');
		await page.fill('#password', 'password');
		await page.click('button[type="submit"]');
		await expect(page).not.toHaveURL(/\/login/, { timeout: 8000 });

		const largeString = 'A'.repeat(100_000);
		const res = await page.request.post('/api/supplements', {
			data: { name: largeString }
		});
		// Must not crash
		expect(res.status()).toBeLessThan(500);
	});

	test('login with SQL injection payload does not crash and rejects auth', async ({ page }) => {
		await page.goto('/login');
		await page.fill('#identifier', "' OR '1'='1");
		await page.fill('#password', "' OR '1'='1");
		await page.click('button[type="submit"]');
		// Must not crash — stay on login page or show an error
		await expect(page).toHaveURL(/\/login/);
		// Page body must not contain a raw SQL error or stack trace
		const body = await page.content();
		expect(body.toLowerCase()).not.toContain('sqlite_error');
		expect(body.toLowerCase()).not.toContain('syntax error in sql');
		expect(body).not.toContain('at Object.<anonymous>');
	});

	test('login with XSS payload in identifier does not execute script', async ({ page }) => {
		await page.goto('/login');
		const xssPayload = '<script>window.__XSS__=true</script>';
		await page.fill('#identifier', xssPayload);
		await page.fill('#password', 'password');
		await page.click('button[type="submit"]');
		// XSS must not execute
		const xssExecuted = await page.evaluate(() => (window as any).__XSS__);
		expect(xssExecuted).toBeFalsy();
	});
});
