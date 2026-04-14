import { describe, it, expect } from 'vitest';
import {
	getLimitsForTags,
	checkExclusions,
	checkRestrictions,
	validatePlan
} from './validation';
import type { Macros, PlanGrid } from './types';

// ─── getLimitsForTags ────────────────────────────────────────────────────────

describe('getLimitsForTags', () => {
	it('returns empty array when no tags match', () => {
		expect(getLimitsForTags([], [])).toEqual([]);
		expect(getLimitsForTags(['unknown tag'], [])).toEqual([]);
	});

	it('returns sodium limit for low-sodium tag', () => {
		const limits = getLimitsForTags(['منخفض الصوديوم'], []);
		expect(limits).toHaveLength(1);
		expect(limits[0]?.nutrient).toBe('sodium');
		expect(limits[0]?.maxMg).toBe(1500);
	});

	it('deduplicates the same nutrient from overlapping tags', () => {
		// Both 'منخفض الصوديوم' and 'قليل الصوديوم' target sodium
		const limits = getLimitsForTags(['منخفض الصوديوم', 'قليل الصوديوم'], []);
		const sodiumEntries = limits.filter((l) => l.nutrient === 'sodium');
		expect(sodiumEntries).toHaveLength(1);
	});

	it('combines tags and dietTypes', () => {
		const limits = getLimitsForTags(['منخفض الصوديوم'], ['منخفض البوتاسيوم']);
		const nutrients = limits.map((l) => l.nutrient);
		expect(nutrients).toContain('sodium');
		expect(nutrients).toContain('potassium');
	});

	it('uses a negative maxMg sentinel for minimum fiber', () => {
		const limits = getLimitsForTags(['غني بالألياف'], []);
		const fiberLimit = limits.find((l) => l.nutrient === 'fiber');
		expect(fiberLimit).toBeDefined();
		expect(fiberLimit!.maxMg).toBeLessThan(0);
	});
});

// ─── checkExclusions ────────────────────────────────────────────────────────

describe('checkExclusions', () => {
	it('returns empty array when no excluded foods specified', () => {
		const grid: PlanGrid = {
			'2025-01-01': { lunch: { recipeId: 1 } }
		};
		const recipeMap = new Map([[1, ['chicken', 'rice']]]);
		expect(checkExclusions(grid, [], recipeMap)).toEqual([]);
	});

	it('returns empty array when no plan slots have recipeId', () => {
		const grid: PlanGrid = {
			'2025-01-01': { lunch: { supplementId: 5 } }
		};
		const result = checkExclusions(grid, ['nuts'], new Map());
		expect(result).toEqual([]);
	});

	it('detects an excluded ingredient in a recipe', () => {
		const grid: PlanGrid = {
			'2025-01-01': { breakfast: { recipeId: 2 } }
		};
		const recipeMap = new Map([[2, ['oats', 'nuts', 'honey']]]);
		const warnings = checkExclusions(grid, ['مكسرات', 'nuts'], recipeMap);
		expect(warnings.length).toBeGreaterThan(0);
		expect(warnings[0]?.recipeId).toBe(2);
	});

	it('is case-insensitive in matching', () => {
		const grid: PlanGrid = {
			'2025-01-01': { dinner: { recipeId: 3 } }
		};
		const recipeMap = new Map([[3, ['Milk', 'flour']]]);
		const warnings = checkExclusions(grid, ['milk'], recipeMap);
		expect(warnings.length).toBeGreaterThan(0);
	});

	it('does not flag recipes without excluded ingredients', () => {
		const grid: PlanGrid = {
			'2025-01-01': { lunch: { recipeId: 4 } }
		};
		const recipeMap = new Map([[4, ['rice', 'chicken', 'vegetables']]]);
		const warnings = checkExclusions(grid, ['nuts', 'eggs'], recipeMap);
		expect(warnings).toEqual([]);
	});

	it('skips recipe IDs not in the lookup map', () => {
		const grid: PlanGrid = {
			'2025-01-01': { lunch: { recipeId: 999 } }
		};
		const warnings = checkExclusions(grid, ['nuts'], new Map());
		expect(warnings).toEqual([]);
	});

	it('includes dateKey and mealType in each warning', () => {
		const grid: PlanGrid = {
			'2025-02-15': { breakfast: { recipeId: 5 } }
		};
		const recipeMap = new Map([[5, ['eggs']]]);
		const warnings = checkExclusions(grid, ['eggs'], recipeMap);
		expect(warnings[0]?.dateKey).toBe('2025-02-15');
		expect(warnings[0]?.mealType).toBe('breakfast');
	});
});

// ─── checkRestrictions ──────────────────────────────────────────────────────

describe('checkRestrictions', () => {
	it('returns empty array when no limits provided', () => {
		expect(checkRestrictions([], {}, 2000)).toEqual([]);
	});

	it('flags sodium over the limit', () => {
		const limits = getLimitsForTags(['منخفض الصوديوم'], []);
		const warnings = checkRestrictions(limits, { sodium: 2000 }, 2000);
		expect(warnings.length).toBeGreaterThan(0);
		expect(warnings[0]?.nutrient).toBe('sodium');
		expect(warnings[0]?.isMinimum).toBe(false);
	});

	it('does not flag sodium within the limit', () => {
		const limits = getLimitsForTags(['منخفض الصوديوم'], []);
		const warnings = checkRestrictions(limits, { sodium: 1000 }, 2000);
		expect(warnings).toEqual([]);
	});

	it('flags fiber below minimum for high-fiber tag', () => {
		const limits = getLimitsForTags(['غني بالألياف'], []);
		// fiber minimum is 25g; actual fiber is 10g
		const warnings = checkRestrictions(limits, { fiber: 10 }, 2000);
		expect(warnings.length).toBeGreaterThan(0);
		expect(warnings[0]?.isMinimum).toBe(true);
	});

	it('does not flag fiber when above minimum', () => {
		const limits = getLimitsForTags(['غني بالألياف'], []);
		const warnings = checkRestrictions(limits, { fiber: 30 }, 2000);
		expect(warnings).toEqual([]);
	});

	it('treats missing nutrient value as 0', () => {
		const limits = getLimitsForTags(['منخفض الصوديوم'], []);
		// No sodium key in supplementTotals → treated as 0, should not flag
		const warnings = checkRestrictions(limits, {}, 2000);
		expect(warnings).toEqual([]);
	});
});

// ─── validatePlan ────────────────────────────────────────────────────────────

describe('validatePlan', () => {
	const emptyGrid: PlanGrid = {};
	const validMacros: Macros = { c: 50, p: 30, f: 20 };
	const invalidMacros: Macros = { c: 50, p: 30, f: 25 }; // sums to 105

	it('returns pass status for empty plan with valid macros', () => {
		const result = validatePlan(
			emptyGrid, [], [], [], validMacros, new Map(), {}, 0
		);
		expect(result.status).toBe('pass');
		expect(result.macroValid).toBe(true);
		expect(result.exclusionWarnings).toHaveLength(0);
		expect(result.restrictionWarnings).toHaveLength(0);
	});

	it('returns warn status when macros do not sum to 100', () => {
		const result = validatePlan(
			emptyGrid, [], [], [], invalidMacros, new Map(), {}, 0
		);
		expect(result.status).toBe('warn');
		expect(result.macroValid).toBe(false);
	});

	it('returns fail status when exclusion violations exist', () => {
		const grid: PlanGrid = {
			'2025-01-01': { lunch: { recipeId: 1 } }
		};
		const recipeMap = new Map([[1, ['eggs']]]);
		const result = validatePlan(
			grid, ['eggs'], [], [], validMacros, recipeMap, {}, 1500
		);
		expect(result.status).toBe('fail');
		expect(result.exclusionWarnings.length).toBeGreaterThan(0);
	});

	it('returns warn status when restriction violated but no exclusions', () => {
		const result = validatePlan(
			emptyGrid,
			[],
			['منخفض الصوديوم'],
			[],
			validMacros,
			new Map(),
			{ sodium: 3000 },
			2000
		);
		expect(result.status).toBe('warn');
		expect(result.restrictionWarnings.length).toBeGreaterThan(0);
	});

	it('fail takes precedence over warn', () => {
		const grid: PlanGrid = {
			'2025-01-01': { lunch: { recipeId: 1 } }
		};
		const recipeMap = new Map([[1, ['eggs']]]);
		// Both an exclusion violation AND sodium over limit
		const result = validatePlan(
			grid,
			['eggs'],
			['منخفض الصوديوم'],
			[],
			validMacros,
			recipeMap,
			{ sodium: 3000 },
			2000
		);
		expect(result.status).toBe('fail');
	});
});
