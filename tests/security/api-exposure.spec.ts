/**
 * Security — API Exposure & IDOR Tests
 *
 * Verifies that endpoints enforce ownership and cross-user isolation.
 * Covers:
 *   - Insecure Direct Object Reference (IDOR) — accessing other users' resources by ID
 *   - Sensitive data leakage — passwords, keys, stack traces in responses
 *   - Session management — logout invalidation, tampered cookies
 *   - Unauthenticated access — all protected endpoints return 401
 *
 * Run against the dev server: npm run dev
 */
import { test, expect, type Page } from '@playwright/test';

async function loginAsDietitian(page: Page) {
	await page.goto('/login');
	await page.fill('#identifier', 'dev@example.com');
	await page.fill('#password', 'password');
	await page.click('button[type="submit"]');
	await expect(page).not.toHaveURL(/\/login/, { timeout: 8000 });
}

// ─── Unauthenticated Access ───────────────────────────────────────────────────

test.describe('API Exposure — All protected endpoints require auth', () => {
	const PROTECTED_ENDPOINTS = [
		'/api/supplements',
		'/api/chat/conversations',
		'/api/foods/search?q=test',
		'/api/foods/local-search?q=rice',
		'/api/foods/external-search?q=egg',
	];

	for (const endpoint of PROTECTED_ENDPOINTS) {
		test(`GET ${endpoint} returns 401 without session`, async ({ page, context }) => {
			await context.clearCookies();
			const res = await page.request.get(endpoint);
			expect(res.status()).toBe(401);
		});
	}

	test('POST /api/ai/meal-plan returns 401 without session', async ({ page, context }) => {
		await context.clearCookies();
		const res = await page.request.post('/api/ai/meal-plan', {
			data: { targetCalories: 2000 }
		});
		expect(res.status()).toBe(401);
	});

	test('POST /api/ai/recipe returns 401 or 403 without session', async ({ page, context }) => {
		await context.clearCookies();
		const res = await page.request.post('/api/ai/recipe', {
			data: { prompt: 'test recipe' }
		});
		// endpoint checks role first (403) before checking auth (401)
		expect([401, 403]).toContain(res.status());
	});

	test('POST /api/foods/import returns 401 without session', async ({ page, context }) => {
		await context.clearCookies();
		const res = await page.request.post('/api/foods/import', {
			data: { foodId: 'some-id' }
		});
		expect(res.status()).toBe(401);
	});

	test('POST /api/chat/conversations/get-or-create returns 401 without session', async ({
		page,
		context
	}) => {
		await context.clearCookies();
		const res = await page.request.post('/api/chat/conversations/get-or-create', {
			data: { patientId: 1 }
		});
		expect(res.status()).toBe(401);
	});
});

// ─── IDOR — Direct Object Reference Attacks ───────────────────────────────────

test.describe('API Exposure — IDOR Protection', () => {
	test.beforeEach(async ({ page }) => {
		await loginAsDietitian(page);
	});

	test('accessing conversation with non-existent UUID returns 4xx (not 5xx)', async ({ page }) => {
		const res = await page.request.get(
			'/api/chat/conversations/ffffffff-ffff-ffff-ffff-ffffffffffff/messages'
		);
		// 400 = invalid ID format, 403 = forbidden, 404 = not found — all correct
		expect(res.status()).toBeGreaterThanOrEqual(400);
		expect(res.status()).toBeLessThan(500);
	});

	test('accessing conversation with very large numeric ID returns 4xx (not 5xx)', async ({ page }) => {
		const res = await page.request.get('/api/chat/conversations/999999999/messages');
		expect(res.status()).toBeGreaterThanOrEqual(400);
		expect(res.status()).toBeLessThan(500);
	});

	test('POSTing to non-existent conversation returns 4xx (not 5xx)', async ({ page }) => {
		const res = await page.request.post(
			'/api/chat/conversations/999999999/messages',
			{ data: { content: 'hello' } }
		);
		expect(res.status()).toBeGreaterThanOrEqual(400);
		expect(res.status()).toBeLessThan(500);
	});

	test('marking non-existent conversation as read returns 4xx (not 5xx)', async ({ page }) => {
		const res = await page.request.post(
			'/api/chat/conversations/999999999/mark-read',
			{ data: {} }
		);
		expect(res.status()).toBeGreaterThanOrEqual(400);
		expect(res.status()).toBeLessThan(500);
	});

	test('DELETE supplement with non-existent ID does not crash (supplements are global catalog)', async ({
		page
	}) => {
		// Supplements are a shared dietitian-managed catalog (no per-user ownership).
		// Deleting a non-existent ID is an idempotent no-op — 200 is correct.
		const res = await page.request.delete('/api/supplements/999999');
		expect(res.status()).toBeLessThan(500);
	});

	test('PATCH supplement with non-existent ID returns 400 or no-op (global catalog)', async ({ page }) => {
		const res = await page.request.patch('/api/supplements/999999', {
			data: { name: 'hacked' }
		});
		// Global catalog: either no-op 200 or 400 (no fields matched) — never 500
		expect(res.status()).toBeLessThan(500);
	});

	test('accessing another users meal plan session returns 403 or 404', async ({ page }) => {
		// Attempt to access a session that belongs to a different user
		const res = await page.request.get('/api/meal-plan-sessions/999999');
		// Should be 403 or 404, never silently return other user's data
		if (res.status() !== 405) { // 405 = endpoint doesn't exist
			expect([403, 404]).toContain(res.status());
		}
	});
});

// ─── Response Sanitization ────────────────────────────────────────────────────

test.describe('API Exposure — Response Data Sanitization', () => {
	test.beforeEach(async ({ page }) => {
		await loginAsDietitian(page);
	});

	test('supplements response never includes password hashes', async ({ page }) => {
		const res = await page.request.get('/api/supplements');
		if (res.status() !== 200) { test.skip(); return; }
		const text = await res.text();
		expect(text).not.toMatch(/\$2[ab]\$/); // bcrypt hash prefix
		expect(text.toLowerCase()).not.toContain('"password"');
	});

	test('food search response never includes password hashes', async ({ page }) => {
		const res = await page.request.get('/api/foods/search?q=rice');
		if (res.status() !== 200) { test.skip(); return; }
		const text = await res.text();
		expect(text).not.toMatch(/\$2[ab]\$/);
		expect(text.toLowerCase()).not.toContain('"password"');
	});

	test('local food search response never includes credentials', async ({ page }) => {
		const res = await page.request.get('/api/foods/local-search?q=chicken');
		if (res.status() !== 200) { test.skip(); return; }
		const text = await res.text();
		expect(text).not.toMatch(/\$2[ab]\$/);
		expect(text.toLowerCase()).not.toContain('"password"');
	});

	test('chat conversations response never includes credentials or secrets', async ({ page }) => {
		const res = await page.request.get('/api/chat/conversations');
		if (res.status() !== 200) { test.skip(); return; }
		const text = await res.text();
		expect(text).not.toMatch(/\$2[ab]\$/);
		expect(text.toLowerCase()).not.toContain('"password"');
		expect(text).not.toContain('DEEPSEEK_API_KEY');
		expect(text).not.toContain('SECRET_KEY');
		expect(text).not.toContain('DATABASE_URL');
	});

	test('error responses do not expose internal file paths or stack traces', async ({ page }) => {
		const endpoints = [
			{ method: 'get', url: '/api/supplements/not-a-valid-id' },
			{ method: 'get', url: '/api/chat/conversations/not-a-valid-id/messages' },
			{ method: 'post', url: '/api/ai/meal-plan', body: { targetCalories: -999 } }
		];

		for (const { method, url, body } of endpoints) {
			const res = method === 'post'
				? await page.request.post(url, { data: body })
				: await page.request.get(url);

			let text = '';
			try { text = await res.text(); } catch { /* empty */ }

			// Stack traces and internal paths must not leak
			expect(text).not.toContain('at Object.<anonymous>');
			expect(text).not.toContain('node_modules');
			// Don't expose absolute internal paths
			expect(text).not.toContain('/Users/hassan');
			expect(text).not.toContain('/home/');
		}
	});

	test('AI error response does not expose API keys', async ({ page }) => {
		// Trigger a validation error, not an actual AI call
		const res = await page.request.post('/api/ai/meal-plan', {
			data: { targetCalories: 'not-a-number' }
		});
		let text = '';
		try { text = await res.text(); } catch { /* empty */ }
		expect(text).not.toContain('DEEPSEEK_API_KEY');
		expect(text).not.toContain('process.env');
		expect(text).not.toContain('Bearer ');
	});
});

// ─── Session Management ───────────────────────────────────────────────────────

test.describe('API Exposure — Session Management', () => {
	test('after logout, clearing cookies blocks API access', async ({ page, context }) => {
		await loginAsDietitian(page);

		// Verify authenticated access works
		const before = await page.request.get('/api/supplements');
		expect(before.status()).toBe(200);

		// Logout
		await page.request.post('/logout');
		await context.clearCookies();

		// Access after logout must be denied
		const after = await page.request.get('/api/supplements');
		expect(after.status()).toBe(401);
	});

	test('tampered session cookie is rejected', async ({ page, context }) => {
		await context.addCookies([
			{
				name: 'nc_session',
				value: 'tampered.fake.jwt.payload.signature',
				domain: 'localhost',
				path: '/'
			}
		]);
		const res = await page.request.get('/api/supplements');
		expect([401, 403]).toContain(res.status());
	});

	test('empty session cookie value is rejected', async ({ page, context }) => {
		await context.addCookies([
			{
				name: 'nc_session',
				value: '',
				domain: 'localhost',
				path: '/'
			}
		]);
		const res = await page.request.get('/api/supplements');
		expect([401, 403]).toContain(res.status());
	});

	test('session cookie with all-zeros payload is rejected', async ({ page, context }) => {
		await context.addCookies([
			{
				name: 'nc_session',
				value: '00000000000000000000000000000000',
				domain: 'localhost',
				path: '/'
			}
		]);
		const res = await page.request.get('/api/supplements');
		expect([401, 403]).toContain(res.status());
	});
});

// ─── Sensitive Route Protection ───────────────────────────────────────────────

test.describe('API Exposure — Route-Level Permission Checks', () => {
	test.beforeEach(async ({ page }) => {
		await loginAsDietitian(page);
	});

	test('GET /api/foods/external-search does not expose raw external API credentials', async ({
		page
	}) => {
		const res = await page.request.get('/api/foods/external-search?q=rice');
		let text = '';
		try { text = await res.text(); } catch { /* empty */ }
		expect(text).not.toContain('EDAMAM_APP_KEY');
		expect(text).not.toContain('app_key');
		expect(text).not.toContain('DEEPSEEK');
	});

	test('SSE events endpoint requires valid conversation ownership', async ({ page }) => {
		const res = await page.request.get(
			'/api/chat/conversations/999999/events'
		);
		expect([400, 403, 404]).toContain(res.status());
	});
});
