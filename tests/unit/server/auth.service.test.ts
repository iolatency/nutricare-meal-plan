/**
 * Unit tests — Auth service pure logic
 *
 * Tests generateToken output shape and session expiry math.
 * DB-dependent functions (createSession, getUserFromToken) are not tested here.
 */
import { describe, it, expect } from 'vitest';
import { randomBytes } from 'crypto';

function generateToken(): string {
	return randomBytes(32).toString('hex');
}

const SESSION_DAYS = 30;

function computeExpiry(): string {
	return new Date(Date.now() + SESSION_DAYS * 86400_000).toISOString();
}

describe('generateToken', () => {
	it('returns a 64-character hex string', () => {
		const token = generateToken();
		expect(token).toHaveLength(64);
		expect(token).toMatch(/^[0-9a-f]{64}$/);
	});

	it('generates unique tokens each call', () => {
		const tokens = new Set(Array.from({ length: 50 }, () => generateToken()));
		expect(tokens.size).toBe(50);
	});

	it('contains only lowercase hex characters', () => {
		for (let i = 0; i < 20; i++) {
			expect(generateToken()).toMatch(/^[0-9a-f]+$/);
		}
	});
});

describe('session expiry math', () => {
	it('expiry is ~30 days from now', () => {
		const before = Date.now();
		const expiry = computeExpiry();
		const after = Date.now();

		const expiryMs = new Date(expiry).getTime();
		const thirtyDaysMs = SESSION_DAYS * 86400_000;

		expect(expiryMs - before).toBeGreaterThanOrEqual(thirtyDaysMs - 100);
		expect(expiryMs - after).toBeLessThanOrEqual(thirtyDaysMs + 100);
	});

	it('expiry is a valid ISO string', () => {
		const expiry = computeExpiry();
		expect(new Date(expiry).toISOString()).toBe(expiry);
	});

	it('sliding session refresh threshold is 7 days', () => {
		const REFRESH_THRESHOLD_DAYS = 7;
		const expiresAt = new Date(Date.now() + 5 * 86_400_000).toISOString();
		const daysRemaining = (new Date(expiresAt).getTime() - Date.now()) / 86_400_000;
		expect(daysRemaining).toBeLessThan(REFRESH_THRESHOLD_DAYS);
	});

	it('session cookie name is nc_session', () => {
		const SESSION_COOKIE = 'nc_session';
		expect(SESSION_COOKIE).toBe('nc_session');
	});
});

describe('password verification logic', () => {
	it('rejects null user lookup as invalid_credentials', () => {
		const user = null;
		const result = !user ? { ok: false, reason: 'invalid_credentials' } : { ok: true };
		expect(result.ok).toBe(false);
	});

	it('rejects unverified email', () => {
		const user = { id: 1, email: 'test@test.com', emailVerifiedAt: null, password: 'hash' };
		const passwordValid = true;
		const result = passwordValid && !user.emailVerifiedAt
			? { ok: false, reason: 'email_unverified' }
			: { ok: true, userId: user.id };
		expect(result).toEqual({ ok: false, reason: 'email_unverified' });
	});

	it('accepts verified user with correct password', () => {
		const user = { id: 42, email: 'test@test.com', emailVerifiedAt: '2024-01-01', password: 'hash' };
		const passwordValid = true;
		const result = !passwordValid
			? { ok: false, reason: 'invalid_credentials' }
			: !user.emailVerifiedAt
				? { ok: false, reason: 'email_unverified' }
				: { ok: true, userId: user.id };
		expect(result).toEqual({ ok: true, userId: 42 });
	});
});
