/**
 * Security — SQL Injection Tests
 *
 * Verifies that all API endpoints safely handle SQL injection payloads.
 * The app uses Drizzle ORM with parameterized queries so raw injection
 * should never succeed — but these tests confirm no 5xx crashes, no auth
 * bypass, and no data leakage occur regardless of input.
 *
 * Run against the dev server: npm run dev
 */
import { test, expect, type Page } from '@playwright/test';

const SQL_PAYLOADS = [
	"' OR '1'='1",
	"' OR 1=1--",
	"'; DROP TABLE users;--",
	"' UNION SELECT id, email, password FROM users--",
	'1; SELECT * FROM auth_sessions;--',
	"' OR 'x'='x",
	"admin'--",
	"' OR 1=1 LIMIT 1--",
	"') OR ('1'='1",
	'1 AND 1=2 UNION SELECT password, email, name FROM users--',
	"'; INSERT INTO users (email,name) VALUES ('pwned@evil.com','hacker');--",
	"' AND SLEEP(5)--"
];

async function loginAsDietitian(page: Page) {
	await page.goto('/login');
	await page.fill('#identifier', 'dev@example.com');
	await page.fill('#password', 'password');
	await page.click('button[type="submit"]');
	await expect(page).not.toHaveURL(/\/login/, { timeout: 8000 });
}

// ─── Login endpoint ───────────────────────────────────────────────────────────

test.describe('SQL Injection — Login endpoint', () => {
	for (const payload of SQL_PAYLOADS.slice(0, 6)) {
		test(`identifier "${payload.slice(0, 45)}" must not bypass auth`, async ({ page }) => {
			await page.goto('/login');
			await page.fill('#identifier', payload);
			await page.fill('#password', 'password');
			await page.click('button[type="submit"]');
			// Must stay on login — no auth bypass
			await expect(page).toHaveURL(/\/login/);
		});

		test(`password "${payload.slice(0, 45)}" must not bypass auth`, async ({ page }) => {
			await page.goto('/login');
			await page.fill('#identifier', 'dev@example.com');
			await page.fill('#password', payload);
			await page.click('button[type="submit"]');
			await expect(page).toHaveURL(/\/login/);
		});
	}

	test('injection in identifier returns non-500 status', async ({ page }) => {
		const res = await page.request.post('/login', {
			form: {
				identifier: "' OR '1'='1'--",
				password: "' OR '1'='1'--"
			}
		});
		expect(res.status()).not.toBe(500);
		expect(res.status()).not.toBe(503);
	});

	test('injection in identifier does not return raw DB error in body', async ({ page }) => {
		const res = await page.request.post('/login', {
			form: {
				identifier: "' OR 1=1--",
				password: 'anything'
			}
		});
		let text = '';
		try {
			text = await res.text();
		} catch {
			/* empty */
		}
		// Must not expose raw SQL error messages
		expect(text.toLowerCase()).not.toContain('sqlite_error');
		expect(text.toLowerCase()).not.toContain('syntax error');
		expect(text.toLowerCase()).not.toContain('drizzle');
	});
});

// ─── Food search endpoints ────────────────────────────────────────────────────

test.describe('SQL Injection — Food search endpoints', () => {
	test.beforeEach(async ({ page }) => {
		await loginAsDietitian(page);
	});

	for (const payload of SQL_PAYLOADS) {
		test(`/api/foods/search with "${payload.slice(0, 40)}" does not 5xx`, async ({ page }) => {
			const res = await page.request.get(`/api/foods/search?q=${encodeURIComponent(payload)}`);
			expect(res.status()).toBeLessThan(500);
		});
	}

	for (const payload of SQL_PAYLOADS.slice(0, 5)) {
		test(`/api/foods/local-search with "${payload.slice(0, 40)}" does not 5xx`, async ({
			page
		}) => {
			const res = await page.request.get(
				`/api/foods/local-search?q=${encodeURIComponent(payload)}`
			);
			expect(res.status()).toBeLessThan(500);
		});
	}

	test('UNION injection in food search does not return password hashes', async ({ page }) => {
		const payload = "' UNION SELECT id, password, email, name FROM users--";
		const res = await page.request.get(`/api/foods/search?q=${encodeURIComponent(payload)}`);
		expect(res.status()).toBeLessThan(500);
		if (res.status() === 200) {
			const text = (await res.text()).toLowerCase();
			// bcrypt hash prefix must not appear in food search results
			expect(text).not.toMatch(/\$2[ab]\$/);
			expect(text).not.toContain('password');
		}
	});

	test('local food search does not expose raw DB errors', async ({ page }) => {
		const res = await page.request.get(
			`/api/foods/local-search?q=${encodeURIComponent("'; SELECT * FROM auth_sessions;--")}`
		);
		let text = '';
		try {
			text = await res.text();
		} catch {
			/* empty */
		}
		expect(text.toLowerCase()).not.toContain('sqlite_error');
		expect(text.toLowerCase()).not.toContain('syntax error');
	});
});

// ─── Supplements endpoint ─────────────────────────────────────────────────────

test.describe('SQL Injection — Supplements endpoint', () => {
	test.beforeEach(async ({ page }) => {
		await loginAsDietitian(page);
	});

	for (const payload of SQL_PAYLOADS.slice(0, 6)) {
		test(`POST supplement name "${payload.slice(0, 40)}" does not 5xx`, async ({ page }) => {
			const res = await page.request.post('/api/supplements', {
				data: { name: payload }
			});
			expect(res.status()).toBeLessThan(500);
		});
	}

	test('injection in supplement name is stored as literal string, not interpreted', async ({
		page
	}) => {
		const injectionName = "'; DROP TABLE supplements;--";
		const res = await page.request.post('/api/supplements', {
			data: { name: injectionName }
		});
		expect(res.status()).toBeLessThan(500);

		if (res.status() === 200 || res.status() === 201) {
			const body = await res.json();
			const stored = body?.name ?? body?.supplement?.name;
			// Stored value must be the raw string, not interpreted SQL
			if (stored !== undefined) {
				expect(typeof stored).toBe('string');
				expect(stored).toBe(injectionName);
			}
		}
	});

	test('DELETE supplement with injection in path does not 5xx', async ({ page }) => {
		const res = await page.request.delete(`/api/supplements/${encodeURIComponent('1 OR 1=1')}`);
		// Should be 400 or 404 — not 500
		expect(res.status()).toBeLessThan(500);
	});
});

// ─── Chat endpoints ───────────────────────────────────────────────────────────

test.describe('SQL Injection — Chat endpoints', () => {
	test.beforeEach(async ({ page }) => {
		await loginAsDietitian(page);
	});

	test('conversations list with injection in query param does not 5xx', async ({ page }) => {
		for (const payload of SQL_PAYLOADS.slice(0, 4)) {
			const res = await page.request.get(
				`/api/chat/conversations?filter=${encodeURIComponent(payload)}`
			);
			expect(res.status()).toBeLessThan(500);
		}
	});

	test('chat message body with SQL injection payload does not 5xx', async ({ page }) => {
		const convsRes = await page.request.get('/api/chat/conversations');
		if (convsRes.status() !== 200) {
			test.skip();
			return;
		}
		const convs = await convsRes.json();
		if (!Array.isArray(convs) || convs.length === 0) {
			test.skip();
			return;
		}

		for (const payload of SQL_PAYLOADS.slice(0, 4)) {
			const res = await page.request.post(`/api/chat/conversations/${convs[0].id}/messages`, {
				data: { content: payload }
			});
			expect(res.status()).toBeLessThan(500);
		}
	});

	test('conversation ID path traversal does not 5xx', async ({ page }) => {
		const maliciousIds = ['1 OR 1=1', '1;SELECT 1', "' OR '1'='1"];
		for (const id of maliciousIds) {
			const res = await page.request.get(
				`/api/chat/conversations/${encodeURIComponent(id)}/messages`
			);
			// Must be 400 or 404, never 500
			expect(res.status()).toBeLessThan(500);
		}
	});
});

// ─── AI endpoints ─────────────────────────────────────────────────────────────

test.describe('SQL Injection — AI endpoints (stored input)', () => {
	test.beforeEach(async ({ page }) => {
		await loginAsDietitian(page);
	});

	test('AI meal plan with SQL injection in extraNote does not 5xx', async ({ page }) => {
		for (const payload of SQL_PAYLOADS.slice(0, 4)) {
			const res = await page.request.post('/api/ai/meal-plan', {
				data: {
					targetCalories: 2000,
					extraNote: payload,
					diags: [],
					excluded: [],
					macros: { c: 50, p: 30, f: 20 },
					planType: 'daily',
					selectedMeals: ['breakfast', 'lunch'],
					tags: [],
					dietTypes: []
				}
			});
			// 200, 400, 429 are acceptable; 500 is not
			expect(res.status()).toBeLessThan(500);
		}
	});
});
