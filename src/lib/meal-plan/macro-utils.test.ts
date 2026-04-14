import { describe, it, expect } from 'vitest';
import {
	adjustMacro,
	macroGrams,
	parseNutrients,
	computePlanTotals,
	estimateMicros
} from './macro-utils';
import type { Macros, PlanGrid } from './types';

// ─── adjustMacro ────────────────────────────────────────────────────────────

describe('adjustMacro', () => {
	const base: Macros = { c: 50, p: 30, f: 20 };

	it('keeps total at 100 when changing carbs', () => {
		const result = adjustMacro('c', 40, base);
		expect(result.c + result.p + result.f).toBe(100);
	});

	it('keeps total at 100 when changing protein', () => {
		const result = adjustMacro('p', 40, base);
		expect(result.c + result.p + result.f).toBe(100);
	});

	it('keeps total at 100 when changing fat', () => {
		const result = adjustMacro('f', 10, base);
		expect(result.c + result.p + result.f).toBe(100);
	});

	it('sets the changed macro to the exact new value', () => {
		expect(adjustMacro('c', 60, base).c).toBe(60);
		expect(adjustMacro('p', 20, base).p).toBe(20);
		expect(adjustMacro('f', 15, base).f).toBe(15);
	});

	it('never produces negative macro values', () => {
		const result = adjustMacro('c', 100, base);
		expect(result.p).toBeGreaterThanOrEqual(0);
		expect(result.f).toBeGreaterThanOrEqual(0);
	});

	it('handles equal base proportions correctly', () => {
		const equal: Macros = { c: 33, p: 33, f: 34 };
		const result = adjustMacro('c', 50, equal);
		expect(result.c + result.p + result.f).toBe(100);
	});

	it('handles zero-sum edge case without division by zero', () => {
		const edge: Macros = { c: 100, p: 0, f: 0 };
		const result = adjustMacro('p', 20, edge);
		expect(result.c + result.p + result.f).toBe(100);
	});
});

// ─── macroGrams ─────────────────────────────────────────────────────────────

describe('macroGrams', () => {
	it('returns zeros when calories is 0', () => {
		const result = macroGrams(0, { c: 50, p: 30, f: 20 });
		expect(result).toEqual({ carbG: 0, protG: 0, fatG: 0 });
	});

	it('correctly converts 2000 kcal with 50/30/20 split', () => {
		const result = macroGrams(2000, { c: 50, p: 30, f: 20 });
		// carbs: 2000 * 50% / 4 = 250g
		expect(result.carbG).toBe(250);
		// protein: 2000 * 30% / 4 = 150g
		expect(result.protG).toBe(150);
		// fat: 2000 * 20% / 9 ≈ 44g
		expect(result.fatG).toBe(44);
	});

	it('uses 4 kcal/g for carbs and protein, 9 kcal/g for fat', () => {
		const result = macroGrams(1800, { c: 40, p: 40, f: 20 });
		expect(result.carbG).toBe(Math.round((1800 * 40) / 100 / 4));
		expect(result.protG).toBe(Math.round((1800 * 40) / 100 / 4));
		expect(result.fatG).toBe(Math.round((1800 * 20) / 100 / 9));
	});

	it('rounds to nearest integer', () => {
		const result = macroGrams(1000, { c: 33, p: 33, f: 34 });
		expect(Number.isInteger(result.carbG)).toBe(true);
		expect(Number.isInteger(result.protG)).toBe(true);
		expect(Number.isInteger(result.fatG)).toBe(true);
	});
});

// ─── parseNutrients ─────────────────────────────────────────────────────────

describe('parseNutrients', () => {
	it('returns null for null input', () => {
		expect(parseNutrients(null)).toBeNull();
	});

	it('returns null for invalid JSON', () => {
		expect(parseNutrients('not json')).toBeNull();
	});

	it('parses valid JSON', () => {
		const json = JSON.stringify({ calories: 300, protein: 20, carbs: 40, fat: 10 });
		const result = parseNutrients(json);
		expect(result).not.toBeNull();
		expect(result?.calories).toBe(300);
		expect(result?.protein).toBe(20);
	});

	it('handles partial nutrient data', () => {
		const result = parseNutrients(JSON.stringify({ calories: 150 }));
		expect(result?.calories).toBe(150);
		expect(result?.protein).toBeUndefined();
	});
});

// ─── computePlanTotals ──────────────────────────────────────────────────────

describe('computePlanTotals', () => {
	const emptyGrid: PlanGrid = {};

	it('returns all-zero totals for an empty plan', () => {
		const { totals } = computePlanTotals(emptyGrid, new Map(), new Map());
		expect(totals).toEqual({ calories: 0, protein: 0, carbs: 0, fat: 0 });
	});

	it('sums recipe nutrients across meals', () => {
		const grid: PlanGrid = {
			'2025-01-01': {
				breakfast: { recipeId: 1 },
				lunch: { recipeId: 2 }
			}
		};
		const recipeLookup = new Map([
			[1, { calories: 400, protein: 30, carbs: 50, fat: 10 }],
			[2, { calories: 600, protein: 40, carbs: 70, fat: 15 }]
		]);
		const { totals } = computePlanTotals(grid, recipeLookup, new Map());
		expect(totals.calories).toBe(1000);
		expect(totals.protein).toBe(70);
		expect(totals.carbs).toBe(120);
		expect(totals.fat).toBe(25);
	});

	it('sums supplement nutrients', () => {
		const grid: PlanGrid = {
			'2025-01-01': {
				supplement: { supplementId: 10 }
			}
		};
		const supplementLookup = new Map([[10, { totalKcal: 200, protein: 15, carbs: 25, fat: 5 }]]);
		const { totals } = computePlanTotals(grid, new Map(), supplementLookup);
		expect(totals.calories).toBe(200);
		expect(totals.protein).toBe(15);
	});

	it('sums food item nutrients when foodLookup provided', () => {
		const grid: PlanGrid = {
			'2025-01-01': {
				lunch: { foodItemId: 5 }
			}
		};
		const foodLookup = new Map([[5, { calories: 350, protein: 25, carbs: 45, fat: 8 }]]);
		const { totals } = computePlanTotals(grid, new Map(), new Map(), foodLookup);
		expect(totals.calories).toBe(350);
	});

	it('sums aiMeal totals', () => {
		const grid: PlanGrid = {
			'2025-01-01': {
				dinner: {
					aiMeal: {
						name: 'AI Meal',
						ingredients: [],
						steps: '',
						total: { calories: 500, protein: 35, carbs: 60, fat: 12 }
					}
				}
			}
		};
		const { totals } = computePlanTotals(grid, new Map(), new Map());
		expect(totals.calories).toBe(500);
		expect(totals.protein).toBe(35);
	});

	it('ignores missing recipe IDs not in lookup', () => {
		const grid: PlanGrid = {
			'2025-01-01': { breakfast: { recipeId: 999 } }
		};
		const { totals } = computePlanTotals(grid, new Map(), new Map());
		expect(totals.calories).toBe(0);
	});

	it('accumulates per-meal totals correctly', () => {
		const grid: PlanGrid = {
			'2025-01-01': {
				breakfast: { recipeId: 1 },
				lunch: { recipeId: 1 }
			}
		};
		const recipeLookup = new Map([[1, { calories: 300, protein: 20, carbs: 40, fat: 8 }]]);
		const { mealTotals } = computePlanTotals(grid, recipeLookup, new Map());
		expect(mealTotals['breakfast']?.calories).toBe(300);
		expect(mealTotals['lunch']?.calories).toBe(300);
	});
});

// ─── estimateMicros ─────────────────────────────────────────────────────────

describe('estimateMicros', () => {
	it('returns one entry per micro constant', () => {
		const result = estimateMicros(2000);
		expect(result.length).toBeGreaterThan(0);
	});

	it('returns zero values when calories is 0', () => {
		const result = estimateMicros(0);
		for (const micro of result) {
			expect(micro.val).toBe(0);
			expect(micro.pct).toBe(0);
		}
	});

	it('caps percentage at 100', () => {
		// Very high calories will push some micros above RDA
		const result = estimateMicros(100_000);
		for (const micro of result) {
			if (micro.rda) {
				expect(micro.pct).toBeLessThanOrEqual(100);
			}
		}
	});

	it('returns non-zero values for typical calorie intake', () => {
		const result = estimateMicros(2000);
		const nonZeroCount = result.filter((m) => m.val > 0).length;
		expect(nonZeroCount).toBeGreaterThan(0);
	});

	it('every entry has label, unit, val, pct fields', () => {
		const result = estimateMicros(1500);
		for (const micro of result) {
			expect(micro).toHaveProperty('label');
			expect(micro).toHaveProperty('unit');
			expect(micro).toHaveProperty('val');
			expect(micro).toHaveProperty('pct');
		}
	});
});
