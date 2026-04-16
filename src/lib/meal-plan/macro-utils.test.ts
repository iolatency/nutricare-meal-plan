import { describe, it, expect } from 'vitest';
import { adjustMacro, macroGrams, parseNutrients, computePlanTotals, estimateMicros } from './macro-utils';
import type { PlanGrid, RecipeNutrients } from './types';

describe('adjustMacro', () => {
	it('adjusts carbs and redistributes protein/fat proportionally', () => {
		const result = adjustMacro('c', 60, { c: 50, p: 30, f: 20 });
		expect(result.c).toBe(60);
		expect(result.c + result.p + result.f).toBe(100);
	});

	it('adjusts protein and redistributes carbs/fat proportionally', () => {
		const result = adjustMacro('p', 40, { c: 50, p: 30, f: 20 });
		expect(result.p).toBe(40);
		expect(result.c + result.p + result.f).toBe(100);
	});

	it('adjusts fat and redistributes carbs/protein proportionally', () => {
		const result = adjustMacro('f', 30, { c: 50, p: 30, f: 20 });
		expect(result.f).toBe(30);
		expect(result.c + result.p + result.f).toBe(100);
	});

	it('handles setting one macro to 100 (others become 0)', () => {
		const result = adjustMacro('c', 100, { c: 50, p: 30, f: 20 });
		expect(result).toEqual({ c: 100, p: 0, f: 0 });
	});

	it('handles setting one macro to 0', () => {
		const result = adjustMacro('c', 0, { c: 50, p: 30, f: 20 });
		expect(result.c).toBe(0);
		expect(result.p + result.f).toBe(100);
	});

	it('never returns negative values', () => {
		const result = adjustMacro('c', 99, { c: 1, p: 0, f: 0 });
		expect(result.c).toBeGreaterThanOrEqual(0);
		expect(result.p).toBeGreaterThanOrEqual(0);
		expect(result.f).toBeGreaterThanOrEqual(0);
	});

	it('handles all-zero remaining gracefully (division by zero guard)', () => {
		const result = adjustMacro('c', 50, { c: 100, p: 0, f: 0 });
		expect(result.c).toBe(50);
		expect(result.c + result.p + result.f).toBe(100);
	});

	it('preserves sum of 100 across many adjustments', () => {
		let macros = { c: 33, p: 33, f: 34 };
		macros = adjustMacro('c', 50, macros);
		macros = adjustMacro('p', 25, macros);
		macros = adjustMacro('f', 25, macros);
		expect(macros.c + macros.p + macros.f).toBe(100);
	});
});

describe('macroGrams', () => {
	it('calculates gram values from calories and macro percentages', () => {
		const result = macroGrams(2000, { c: 50, p: 30, f: 20 });
		expect(result.carbG).toBe(250); // 2000 * 0.5 / 4
		expect(result.protG).toBe(150); // 2000 * 0.3 / 4
		expect(result.fatG).toBe(44);   // 2000 * 0.2 / 9
	});

	it('returns all zeros when calories is 0', () => {
		const result = macroGrams(0, { c: 50, p: 30, f: 20 });
		expect(result).toEqual({ carbG: 0, protG: 0, fatG: 0 });
	});

	it('rounds to nearest integer', () => {
		const result = macroGrams(1000, { c: 33, p: 33, f: 34 });
		expect(Number.isInteger(result.carbG)).toBe(true);
		expect(Number.isInteger(result.protG)).toBe(true);
		expect(Number.isInteger(result.fatG)).toBe(true);
	});

	it('handles 100% of a single macro', () => {
		const result = macroGrams(2000, { c: 100, p: 0, f: 0 });
		expect(result.carbG).toBe(500);
		expect(result.protG).toBe(0);
		expect(result.fatG).toBe(0);
	});
});

describe('parseNutrients', () => {
	it('returns null for null input', () => {
		expect(parseNutrients(null)).toBeNull();
	});

	it('returns parsed object for valid JSON', () => {
		const json = JSON.stringify({ calories: 200, protein: 10, carbs: 30, fat: 5 });
		const result = parseNutrients(json);
		expect(result).toEqual({ calories: 200, protein: 10, carbs: 30, fat: 5 });
	});

	it('returns null for invalid JSON', () => {
		expect(parseNutrients('not-json')).toBeNull();
	});

	it('returns null for empty string', () => {
		expect(parseNutrients('')).toBeNull();
	});
});

describe('computePlanTotals', () => {
	it('returns zeros for empty plan', () => {
		const { totals, mealTotals } = computePlanTotals({}, new Map(), new Map());
		expect(totals).toEqual({ calories: 0, protein: 0, carbs: 0, fat: 0 });
		expect(Object.keys(mealTotals)).toHaveLength(0);
	});

	it('accumulates recipe nutrients correctly', () => {
		const plan: PlanGrid = {
			'2024-01-01': {
				breakfast: { recipeId: 1 },
				lunch: { recipeId: 2 }
			}
		};
		const recipeLookup = new Map<number, RecipeNutrients>([
			[1, { calories: 300, protein: 20, carbs: 40, fat: 10 }],
			[2, { calories: 500, protein: 30, carbs: 60, fat: 15 }]
		]);
		const { totals, mealTotals } = computePlanTotals(plan, recipeLookup, new Map());
		expect(totals.calories).toBe(800);
		expect(totals.protein).toBe(50);
		expect(totals.carbs).toBe(100);
		expect(totals.fat).toBe(25);
		expect(mealTotals['breakfast'].calories).toBe(300);
		expect(mealTotals['lunch'].calories).toBe(500);
	});

	it('accumulates supplement nutrients correctly', () => {
		const plan: PlanGrid = {
			'2024-01-01': { supplement: { supplementId: 1 } }
		};
		const supplementLookup = new Map([
			[1, { totalKcal: 150, protein: 25, carbs: 5, fat: 3 }]
		]);
		const { totals } = computePlanTotals(plan, new Map(), supplementLookup);
		expect(totals.calories).toBe(150);
		expect(totals.protein).toBe(25);
	});

	it('accumulates food item nutrients when foodLookup is provided', () => {
		const plan: PlanGrid = {
			'2024-01-01': { breakfast: { foodItemId: 10 } }
		};
		const foodLookup = new Map([
			[10, { calories: 200, protein: 8, carbs: 30, fat: 7 }]
		]);
		const { totals } = computePlanTotals(plan, new Map(), new Map(), foodLookup);
		expect(totals.calories).toBe(200);
	});

	it('accumulates AI meal totals', () => {
		const plan: PlanGrid = {
			'2024-01-01': {
				breakfast: {
					aiMeal: {
						name: 'test',
						ingredients: [],
						total: { calories: 400, protein: 20, carbs: 50, fat: 12 },
						steps: ''
					}
				}
			}
		};
		const { totals } = computePlanTotals(plan, new Map(), new Map());
		expect(totals.calories).toBe(400);
		expect(totals.protein).toBe(20);
	});

	it('skips recipes not in the lookup', () => {
		const plan: PlanGrid = {
			'2024-01-01': { breakfast: { recipeId: 999 } }
		};
		const { totals } = computePlanTotals(plan, new Map(), new Map());
		expect(totals.calories).toBe(0);
	});

	it('aggregates across multiple days', () => {
		const plan: PlanGrid = {
			'2024-01-01': { breakfast: { recipeId: 1 } },
			'2024-01-02': { breakfast: { recipeId: 1 } }
		};
		const recipeLookup = new Map<number, RecipeNutrients>([
			[1, { calories: 300, protein: 20, carbs: 40, fat: 10 }]
		]);
		const { totals } = computePlanTotals(plan, recipeLookup, new Map());
		expect(totals.calories).toBe(600);
	});
});

describe('estimateMicros', () => {
	it('returns array of micro estimates', () => {
		const result = estimateMicros(2000);
		expect(result.length).toBeGreaterThan(0);
		expect(result[0]).toHaveProperty('label');
		expect(result[0]).toHaveProperty('val');
		expect(result[0]).toHaveProperty('pct');
	});

	it('returns all zeros for 0 calories', () => {
		const result = estimateMicros(0);
		for (const micro of result) {
			expect(micro.val).toBe(0);
			expect(micro.pct).toBe(0);
		}
	});

	it('caps pct at 100', () => {
		const result = estimateMicros(100_000);
		for (const micro of result) {
			expect(micro.pct).toBeLessThanOrEqual(100);
		}
	});

	it('scales linearly with calories', () => {
		const at1000 = estimateMicros(1000);
		const at2000 = estimateMicros(2000);
		expect(at2000[0].val).toBeGreaterThan(at1000[0].val);
	});
});
