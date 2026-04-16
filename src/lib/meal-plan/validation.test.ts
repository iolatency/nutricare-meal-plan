import { describe, it, expect } from 'vitest';
import {
	getLimitsForTags,
	checkExclusions,
	checkRestrictions,
	validatePlan,
	type NutrientLimit,
	type ExclusionWarning,
	type RestrictionWarning
} from './validation';
import type { PlanGrid, Macros } from './types';

describe('getLimitsForTags', () => {
	it('returns empty array for unknown tags', () => {
		expect(getLimitsForTags(['unknown-tag'], [])).toEqual([]);
	});

	it('returns sodium limit for "منخفض الصوديوم"', () => {
		const limits = getLimitsForTags([], ['منخفض الصوديوم']);
		expect(limits).toHaveLength(1);
		expect(limits[0].nutrient).toBe('sodium');
		expect(limits[0].maxMg).toBe(1500);
	});

	it('returns potassium limit for "منخفض البوتاسيوم"', () => {
		const limits = getLimitsForTags([], ['منخفض البوتاسيوم']);
		expect(limits).toHaveLength(1);
		expect(limits[0].nutrient).toBe('potassium');
		expect(limits[0].maxMg).toBe(2000);
	});

	it('deduplicates nutrients from overlapping tags', () => {
		const limits = getLimitsForTags(['قليل الصوديوم'], ['منخفض الصوديوم']);
		expect(limits).toHaveLength(1);
	});

	it('returns multiple limits for multiple matching tags', () => {
		const limits = getLimitsForTags([], ['منخفض الصوديوم', 'منخفض البوتاسيوم']);
		expect(limits).toHaveLength(2);
		const nutrients = limits.map((l) => l.nutrient);
		expect(nutrients).toContain('sodium');
		expect(nutrients).toContain('potassium');
	});

	it('handles tags from both arrays', () => {
		const limits = getLimitsForTags(['غني بالألياف'], ['منخفض الفوسفور']);
		expect(limits).toHaveLength(2);
	});

	it('returns negative maxMg for minimum-threshold fiber tags', () => {
		const limits = getLimitsForTags(['غني بالألياف'], []);
		expect(limits).toHaveLength(1);
		expect(limits[0].maxMg).toBeLessThan(0);
	});

	it('returns empty for empty input arrays', () => {
		expect(getLimitsForTags([], [])).toEqual([]);
	});
});

describe('checkExclusions', () => {
	const makeGrid = (slots: Array<{ dateKey: string; mealType: string; recipeId: number }>): PlanGrid => {
		const grid: PlanGrid = {};
		for (const s of slots) {
			if (!grid[s.dateKey]) grid[s.dateKey] = {};
			grid[s.dateKey][s.mealType] = { recipeId: s.recipeId };
		}
		return grid;
	};

	it('returns empty when no excluded foods', () => {
		const grid = makeGrid([{ dateKey: '2024-01-01', mealType: 'breakfast', recipeId: 1 }]);
		const ingredientMap = new Map([[1, ['ملح', 'أرز']]]);
		expect(checkExclusions(grid, [], ingredientMap, new Map())).toEqual([]);
	});

	it('returns empty when no slots have recipeId', () => {
		const grid: PlanGrid = { '2024-01-01': { breakfast: {} } };
		expect(checkExclusions(grid, [1], new Map(), new Map([[1, 'طماطم']]))).toEqual([]);
	});

	it('detects excluded ingredient in a recipe', () => {
		const grid = makeGrid([{ dateKey: '2024-01-01', mealType: 'lunch', recipeId: 1 }]);
		const ingredientMap = new Map([[1, ['طماطم مهروسة', 'بصل']]]);
		const warnings = checkExclusions(grid, [1], ingredientMap, new Map([[1, 'طماطم']]));
		expect(warnings).toHaveLength(1);
		expect(warnings[0].matchedExclusions).toContain('طماطم');
		expect(warnings[0].dateKey).toBe('2024-01-01');
		expect(warnings[0].mealType).toBe('lunch');
	});

	it('deduplicates matched exclusions for a single recipe', () => {
		const grid = makeGrid([{ dateKey: '2024-01-01', mealType: 'lunch', recipeId: 1 }]);
		const ingredientMap = new Map([[1, ['بيض مسلوق', 'بيض مقلي']]]);
		const warnings = checkExclusions(grid, [5], ingredientMap, new Map([[5, 'بيض']]));
		expect(warnings).toHaveLength(1);
		expect(warnings[0].matchedExclusions).toHaveLength(1);
	});

	it('case-insensitive matching works for English ingredient names', () => {
		const grid = makeGrid([{ dateKey: '2024-01-01', mealType: 'breakfast', recipeId: 1 }]);
		const ingredientMap = new Map([[1, ['Eggs', 'Milk']]]);
		const warnings = checkExclusions(grid, [3], ingredientMap, new Map([[3, 'eggs']]));
		expect(warnings).toHaveLength(1);
	});

	it('returns warnings from multiple days and meals', () => {
		const grid = makeGrid([
			{ dateKey: '2024-01-01', mealType: 'breakfast', recipeId: 1 },
			{ dateKey: '2024-01-02', mealType: 'lunch', recipeId: 2 }
		]);
		const ingredientMap = new Map([
			[1, ['بيض']],
			[2, ['بيض مخفوق']]
		]);
		const warnings = checkExclusions(grid, [2], ingredientMap, new Map([[2, 'بيض']]));
		expect(warnings).toHaveLength(2);
	});

	it('skips recipes not found in ingredient map', () => {
		const grid = makeGrid([{ dateKey: '2024-01-01', mealType: 'breakfast', recipeId: 999 }]);
		const ingredientMap = new Map([[1, ['بيض']]]);
		expect(checkExclusions(grid, [1], ingredientMap, new Map([[1, 'بيض']]))).toEqual([]);
	});
});

describe('checkRestrictions', () => {
	it('returns empty when no limits defined', () => {
		expect(checkRestrictions([], { sodium: 5000 }, 2000)).toEqual([]);
	});

	it('warns when nutrient exceeds maximum', () => {
		const limits: NutrientLimit[] = [{ nutrient: 'sodium', label: 'صوديوم', maxMg: 1500, unit: 'mg' }];
		const warnings = checkRestrictions(limits, { sodium: 2000 }, 2000);
		expect(warnings).toHaveLength(1);
		expect(warnings[0].isMinimum).toBe(false);
		expect(warnings[0].actual).toBe(2000);
		expect(warnings[0].limit).toBe(1500);
	});

	it('no warning when nutrient is under maximum', () => {
		const limits: NutrientLimit[] = [{ nutrient: 'sodium', label: 'صوديوم', maxMg: 1500, unit: 'mg' }];
		expect(checkRestrictions(limits, { sodium: 1000 }, 2000)).toEqual([]);
	});

	it('warns when minimum fiber threshold is not met (negative maxMg)', () => {
		const limits: NutrientLimit[] = [{ nutrient: 'fiber', label: 'ألياف', maxMg: -25000, unit: 'mg' }];
		const warnings = checkRestrictions(limits, { fiber: 10 }, 2000);
		expect(warnings).toHaveLength(1);
		expect(warnings[0].isMinimum).toBe(true);
	});

	it('no warning when fiber exceeds minimum threshold', () => {
		const limits: NutrientLimit[] = [{ nutrient: 'fiber', label: 'ألياف', maxMg: -25000, unit: 'mg' }];
		expect(checkRestrictions(limits, { fiber: 30 }, 2000)).toEqual([]);
	});

	it('handles missing nutrient (defaults to 0)', () => {
		const limits: NutrientLimit[] = [{ nutrient: 'calcium', label: 'كالسيوم', maxMg: 600, unit: 'mg' }];
		const warnings = checkRestrictions(limits, {}, 2000);
		expect(warnings).toEqual([]);
	});

	it('checks multiple limits simultaneously', () => {
		const limits: NutrientLimit[] = [
			{ nutrient: 'sodium', label: 'صوديوم', maxMg: 1500, unit: 'mg' },
			{ nutrient: 'potassium', label: 'بوتاسيوم', maxMg: 2000, unit: 'mg' }
		];
		const warnings = checkRestrictions(limits, { sodium: 2000, potassium: 3000 }, 2000);
		expect(warnings).toHaveLength(2);
	});
});

describe('validatePlan', () => {
	const emptyGrid: PlanGrid = {};
	const validMacros: Macros = { c: 50, p: 30, f: 20 };
	const invalidMacros: Macros = { c: 50, p: 30, f: 30 };

	it('returns pass for valid plan with no warnings', () => {
		const result = validatePlan(emptyGrid, [], [], [], validMacros, new Map(), new Map(), {}, 2000);
		expect(result.status).toBe('pass');
		expect(result.exclusionWarnings).toHaveLength(0);
		expect(result.restrictionWarnings).toHaveLength(0);
		expect(result.macroValid).toBe(true);
	});

	it('returns warn when macros do not sum to 100', () => {
		const result = validatePlan(emptyGrid, [], [], [], invalidMacros, new Map(), new Map(), {}, 2000);
		expect(result.status).toBe('warn');
		expect(result.macroValid).toBe(false);
	});

	it('returns fail when exclusion warnings exist', () => {
		const grid: PlanGrid = { '2024-01-01': { breakfast: { recipeId: 1 } } };
		const ingredientMap = new Map([[1, ['بيض']]]);
		const result = validatePlan(grid, [1], [], [], validMacros, ingredientMap, new Map([[1, 'بيض']]), {}, 2000);
		expect(result.status).toBe('fail');
		expect(result.exclusionWarnings.length).toBeGreaterThan(0);
	});

	it('returns warn for restriction warnings without exclusion issues', () => {
		const result = validatePlan(
			emptyGrid, [], [], ['منخفض الصوديوم'], validMacros, new Map(), new Map(), { sodium: 5000 }, 2000
		);
		expect(result.status).toBe('warn');
		expect(result.restrictionWarnings.length).toBeGreaterThan(0);
	});

	it('exclusion warnings take priority over restriction warnings (fail > warn)', () => {
		const grid: PlanGrid = { '2024-01-01': { breakfast: { recipeId: 1 } } };
		const ingredientMap = new Map([[1, ['بيض']]]);
		const result = validatePlan(
			grid, [1], [], ['منخفض الصوديوم'], validMacros, ingredientMap, new Map([[1, 'بيض']]), { sodium: 5000 }, 2000
		);
		expect(result.status).toBe('fail');
	});
});
