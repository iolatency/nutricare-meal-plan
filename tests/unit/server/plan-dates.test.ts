import { describe, it, expect } from 'vitest';
import { effectivePlanDate, toLocalYmd, YMD_PATTERN } from '$lib/server/modules/meal-plan/plan-dates';

describe('YMD_PATTERN', () => {
	it('accepts valid dates', () => {
		expect(YMD_PATTERN.test('2026-04-15')).toBe(true);
	});
	it('rejects invalid', () => {
		expect(YMD_PATTERN.test('15-04-2026')).toBe(false);
	});
});

describe('effectivePlanDate', () => {
	it('uses meal_days.date when valid', () => {
		const day = { date: '2026-04-10', dayOfWeek: 0, sortOrder: 0 };
		expect(effectivePlanDate(day, '2026-04-12', 'weekly')).toBe('2026-04-10');
	});

	it('derives weekly offset from anchor when date missing', () => {
		const day = { date: null, dayOfWeek: 3, sortOrder: 0 };
		// Sunday 2026-04-12 + 3 = Wednesday 2026-04-15
		expect(effectivePlanDate(day, '2026-04-12', 'weekly')).toBe('2026-04-15');
	});

	it('uses sortOrder for daily plan when date missing', () => {
		const day = { date: null, dayOfWeek: null, sortOrder: 2 };
		expect(effectivePlanDate(day, '2026-01-01', 'daily')).toBe('2026-01-03');
	});
});

describe('toLocalYmd re-export', () => {
	it('matches local calendar', () => {
		expect(toLocalYmd(new Date(2026, 3, 15))).toBe('2026-04-15');
	});
});
