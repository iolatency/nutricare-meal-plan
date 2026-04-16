/**
 * Unit tests — Date utility functions
 *
 * Tests toLocalYmd, todayStr, and snapToSunday from the meal-plan state module.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

function toLocalYmd(d: Date): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${y}-${m}-${day}`;
}

function todayStr(): string {
	return toLocalYmd(new Date());
}

function snapToSunday(dateStr: string): string {
	const d = new Date(dateStr + 'T00:00:00');
	const day = d.getDay();
	d.setDate(d.getDate() - day);
	return toLocalYmd(d);
}

describe('toLocalYmd', () => {
	it('formats correctly for a regular date', () => {
		expect(toLocalYmd(new Date(2024, 5, 15))).toBe('2024-06-15');
	});

	it('zero-pads month and day', () => {
		expect(toLocalYmd(new Date(2024, 0, 5))).toBe('2024-01-05');
	});

	it('handles leap year Feb 29', () => {
		expect(toLocalYmd(new Date(2024, 1, 29))).toBe('2024-02-29');
	});
});

describe('todayStr', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it('returns today in YYYY-MM-DD format', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date(2024, 6, 4));
		expect(todayStr()).toBe('2024-07-04');
	});

	it('matches the regex pattern', () => {
		expect(todayStr()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});
});

describe('snapToSunday', () => {
	it('keeps Sunday as-is', () => {
		expect(snapToSunday('2024-01-07')).toBe('2024-01-07');
	});

	it('snaps Monday back to Sunday', () => {
		expect(snapToSunday('2024-01-08')).toBe('2024-01-07');
	});

	it('snaps Friday back to Sunday', () => {
		expect(snapToSunday('2024-01-12')).toBe('2024-01-07');
	});

	it('snaps Saturday back to Sunday', () => {
		expect(snapToSunday('2024-01-13')).toBe('2024-01-07');
	});

	it('crosses month boundary correctly', () => {
		// March 1, 2024 is Friday → previous Sunday is Feb 25
		expect(snapToSunday('2024-03-01')).toBe('2024-02-25');
	});

	it('crosses year boundary correctly', () => {
		// Jan 3, 2024 is Wednesday → previous Sunday is Dec 31, 2023
		expect(snapToSunday('2024-01-03')).toBe('2023-12-31');
	});
});
