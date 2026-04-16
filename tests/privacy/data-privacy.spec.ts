import { test, expect, type Page } from '@playwright/test';

const DIETITIAN_EMAIL = process.env.DIETITIAN_EMAIL ?? 'dev@example.com';
const DIETITIAN_PASS = process.env.DIETITIAN_PASSWORD ?? 'password';

async function loginAsDietitian(page: Page) {
	await page.goto('/login');
	await page.fill('#identifier', DIETITIAN_EMAIL);
	await page.fill('#password', DIETITIAN_PASS);
	await page.click('button[type="submit"]');
	await page.waitForURL(/\/dietitian/, { timeout: 10000 });
}

test.describe('Data Privacy — No PII Leakage', () => {
	test('login page does not expose user data in HTML source', async ({ page }) => {
		await page.goto('/login');
		const html = await page.content();
		// Should not contain sensitive patterns in page source
		expect(html).not.toContain('password');
		expect(html).not.toMatch(/\$2[aby]\$\d+\$/); // bcrypt hash
	});

	test('no sensitive data in localStorage after login', async ({ page }) => {
		await loginAsDietitian(page);
		const keys = await page.evaluate(() => Object.keys(localStorage));
		const sensitiveKeys = keys.filter((k) =>
			/token|password|secret|session|auth/i.test(k)
		);
		expect(sensitiveKeys).toHaveLength(0);
	});

	test('no sensitive data in sessionStorage', async ({ page }) => {
		await loginAsDietitian(page);
		const keys = await page.evaluate(() => Object.keys(sessionStorage));
		const sensitiveKeys = keys.filter((k) =>
			/password|secret|token|apikey/i.test(k)
		);
		expect(sensitiveKeys).toHaveLength(0);
	});

	test('page source does not contain database URLs', async ({ page }) => {
		await loginAsDietitian(page);
		await page.goto('/dietitian/meal-plan');
		const html = await page.content();
		expect(html).not.toMatch(/DATABASE_URL|postgres:\/\/|sqlite:\/\//i);
		expect(html).not.toMatch(/OPENAI_API_KEY|RESEND_API_KEY/i);
	});

	test('API error responses do not leak stack traces', async ({ request }) => {
		const res = await request.get('/api/nonexistent-endpoint');
		if (res.status() >= 400) {
			const body = await res.text();
			expect(body).not.toContain('node_modules');
			expect(body).not.toMatch(/at .+ \(.+:\d+:\d+\)/);
		}
	});
});
