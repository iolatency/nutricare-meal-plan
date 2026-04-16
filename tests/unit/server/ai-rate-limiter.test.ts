/**
 * Unit tests — AI Rate Limiter
 *
 * Tests the sliding-window rate limiter logic for AI endpoints.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const requestLog = new Map<number, number[]>();
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 5;

function checkAiRateLimit(userId: number): { allowed: boolean; retryAfterMs?: number } {
	const now = Date.now();
	const timestamps = (requestLog.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);

	if (timestamps.length >= MAX_REQUESTS) {
		const oldest = timestamps[0];
		return { allowed: false, retryAfterMs: WINDOW_MS - (now - oldest) };
	}

	timestamps.push(now);
	requestLog.set(userId, timestamps);
	return { allowed: true };
}

describe('checkAiRateLimit', () => {
	beforeEach(() => {
		requestLog.clear();
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('allows first request', () => {
		const result = checkAiRateLimit(1);
		expect(result.allowed).toBe(true);
		expect(result.retryAfterMs).toBeUndefined();
	});

	it('allows up to MAX_REQUESTS in a window', () => {
		for (let i = 0; i < MAX_REQUESTS; i++) {
			expect(checkAiRateLimit(1).allowed).toBe(true);
		}
	});

	it('blocks request after MAX_REQUESTS in window', () => {
		for (let i = 0; i < MAX_REQUESTS; i++) {
			checkAiRateLimit(1);
		}
		const result = checkAiRateLimit(1);
		expect(result.allowed).toBe(false);
		expect(result.retryAfterMs).toBeDefined();
		expect(result.retryAfterMs!).toBeGreaterThan(0);
		expect(result.retryAfterMs!).toBeLessThanOrEqual(WINDOW_MS);
	});

	it('allows requests again after window expires', () => {
		for (let i = 0; i < MAX_REQUESTS; i++) {
			checkAiRateLimit(1);
		}
		expect(checkAiRateLimit(1).allowed).toBe(false);

		vi.advanceTimersByTime(WINDOW_MS + 1);
		expect(checkAiRateLimit(1).allowed).toBe(true);
	});

	it('isolates rate limits per user', () => {
		for (let i = 0; i < MAX_REQUESTS; i++) {
			checkAiRateLimit(1);
		}
		expect(checkAiRateLimit(1).allowed).toBe(false);
		expect(checkAiRateLimit(2).allowed).toBe(true);
	});

	it('retryAfterMs decreases over time', () => {
		for (let i = 0; i < MAX_REQUESTS; i++) {
			checkAiRateLimit(1);
		}
		const first = checkAiRateLimit(1);

		vi.advanceTimersByTime(10_000);
		const second = checkAiRateLimit(1);

		expect(second.retryAfterMs!).toBeLessThan(first.retryAfterMs!);
	});

	it('sliding window evicts old entries', () => {
		checkAiRateLimit(1);
		vi.advanceTimersByTime(WINDOW_MS - 1000);
		for (let i = 0; i < MAX_REQUESTS - 1; i++) {
			checkAiRateLimit(1);
		}
		// First entry is about to expire; one more should be blocked
		expect(checkAiRateLimit(1).allowed).toBe(false);
		// After the first entry expires, one slot frees up
		vi.advanceTimersByTime(1001);
		expect(checkAiRateLimit(1).allowed).toBe(true);
	});
});
