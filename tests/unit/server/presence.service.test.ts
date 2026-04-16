/**
 * Unit tests — User presence logic
 *
 * Tests the online/offline threshold calculation used by
 * /api/users/[userId]/presence.
 */
import { describe, it, expect } from 'vitest';

const ONLINE_THRESHOLD_MS = 3 * 60 * 1000; // 3 minutes

function isOnline(lastSeenAt: string | null): boolean {
	if (!lastSeenAt) return false;
	return Date.now() - new Date(lastSeenAt).getTime() < ONLINE_THRESHOLD_MS;
}

describe('isOnline()', () => {
	it('returns false when lastSeenAt is null', () => {
		expect(isOnline(null)).toBe(false);
	});

	it('returns true when lastSeenAt is under 3 minutes ago', () => {
		const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
		expect(isOnline(twoMinutesAgo)).toBe(true);
	});

	it('returns true when lastSeenAt is just now', () => {
		const now = new Date().toISOString();
		expect(isOnline(now)).toBe(true);
	});

	it('returns false when lastSeenAt is exactly 3 minutes ago', () => {
		const threeMinutesAgo = new Date(Date.now() - ONLINE_THRESHOLD_MS).toISOString();
		expect(isOnline(threeMinutesAgo)).toBe(false);
	});

	it('returns false when lastSeenAt is 5 minutes ago', () => {
		const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
		expect(isOnline(fiveMinutesAgo)).toBe(false);
	});

	it('returns false for very old timestamps', () => {
		expect(isOnline('2020-01-01T00:00:00.000Z')).toBe(false);
	});

	it('returns false for invalid date strings', () => {
		expect(isOnline('not-a-date')).toBe(false);
	});
});
