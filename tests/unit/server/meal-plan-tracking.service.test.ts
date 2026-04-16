/**
 * Unit tests — Meal plan tracking helper functions
 *
 * Tests the date helper functions used by the tracking service:
 * toLocalYmd, snapToSunday, adherence calculation, and status counting.
 */
import { describe, it, expect } from 'vitest';

function toLocalYmd(d: Date): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${y}-${m}-${day}`;
}

function snapToSunday(dateStr: string): string {
	const d = new Date(dateStr + 'T00:00:00');
	const dow = d.getDay();
	d.setDate(d.getDate() - dow);
	return toLocalYmd(d);
}

function computeAdherence(eaten: number, totalSlots: number): number {
	return totalSlots > 0 ? Math.round((eaten / totalSlots) * 100) : 0;
}

describe('toLocalYmd', () => {
	it('formats date as YYYY-MM-DD', () => {
		expect(toLocalYmd(new Date(2024, 0, 15))).toBe('2024-01-15');
	});

	it('pads single-digit month', () => {
		expect(toLocalYmd(new Date(2024, 2, 5))).toBe('2024-03-05');
	});

	it('pads single-digit day', () => {
		expect(toLocalYmd(new Date(2024, 11, 1))).toBe('2024-12-01');
	});

	it('handles December 31', () => {
		expect(toLocalYmd(new Date(2024, 11, 31))).toBe('2024-12-31');
	});

	it('handles January 1', () => {
		expect(toLocalYmd(new Date(2025, 0, 1))).toBe('2025-01-01');
	});
});

describe('snapToSunday', () => {
	it('returns same date if already Sunday', () => {
		// 2024-01-07 is a Sunday
		expect(snapToSunday('2024-01-07')).toBe('2024-01-07');
	});

	it('snaps Monday to previous Sunday', () => {
		// 2024-01-08 is Monday
		expect(snapToSunday('2024-01-08')).toBe('2024-01-07');
	});

	it('snaps Saturday to previous Sunday', () => {
		// 2024-01-13 is Saturday
		expect(snapToSunday('2024-01-13')).toBe('2024-01-07');
	});

	it('snaps Wednesday to previous Sunday', () => {
		// 2024-01-10 is Wednesday
		expect(snapToSunday('2024-01-10')).toBe('2024-01-07');
	});

	it('handles month boundaries', () => {
		// 2024-02-01 is Thursday → Sunday is 2024-01-28
		expect(snapToSunday('2024-02-01')).toBe('2024-01-28');
	});

	it('handles year boundaries', () => {
		// 2024-01-01 is Monday → Sunday is 2023-12-31
		expect(snapToSunday('2024-01-01')).toBe('2023-12-31');
	});
});

describe('computeAdherence', () => {
	it('returns 0 when no meal slots', () => {
		expect(computeAdherence(0, 0)).toBe(0);
	});

	it('returns 100 when all eaten', () => {
		expect(computeAdherence(5, 5)).toBe(100);
	});

	it('returns 50 for half eaten', () => {
		expect(computeAdherence(5, 10)).toBe(50);
	});

	it('rounds to nearest integer', () => {
		expect(computeAdherence(1, 3)).toBe(33);
	});

	it('returns 0 when none eaten', () => {
		expect(computeAdherence(0, 10)).toBe(0);
	});
});

describe('tracking status counting logic', () => {
	type TrackingEntry = { status: 'eaten' | 'skipped' | 'not_eaten'; replacementNote?: string | null };

	function countStatuses(entries: TrackingEntry[]) {
		let eaten = 0, skipped = 0, notEaten = 0, withReplacement = 0;
		for (const e of entries) {
			if (e.status === 'eaten') eaten++;
			else if (e.status === 'skipped') {
				skipped++;
				if (e.replacementNote) withReplacement++;
			} else notEaten++;
		}
		return { eaten, skipped, notEaten, withReplacement };
	}

	it('counts eaten/skipped/not_eaten correctly', () => {
		const entries: TrackingEntry[] = [
			{ status: 'eaten' },
			{ status: 'skipped', replacementNote: null },
			{ status: 'not_eaten' },
			{ status: 'eaten' }
		];
		expect(countStatuses(entries)).toEqual({ eaten: 2, skipped: 1, notEaten: 1, withReplacement: 0 });
	});

	it('counts replacementNote on skipped entries', () => {
		const entries: TrackingEntry[] = [
			{ status: 'skipped', replacementNote: 'استبدال بوجبة أخرى' },
			{ status: 'skipped', replacementNote: null }
		];
		expect(countStatuses(entries).withReplacement).toBe(1);
	});

	it('returns all zeros for empty array', () => {
		expect(countStatuses([])).toEqual({ eaten: 0, skipped: 0, notEaten: 0, withReplacement: 0 });
	});
});
