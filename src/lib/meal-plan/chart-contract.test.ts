import { describe, it, expect } from 'vitest';
import { buildChartContract } from './chart-contract';

describe('buildChartContract', () => {
	it('builds safe percentage values and remaining calories (under target)', () => {
		const result = buildChartContract({
			planType: 'weekly',
			targetCalories: 2000,
			macros: { c: 50, p: 30, f: 20 },
			totals: { calories: 7000, protein: 350, carbs: 900, fat: 210 },
			mealTotals: {
				breakfast: { calories: 2800, protein: 120, carbs: 360, fat: 90 },
				lunch: { calories: 4200, protein: 230, carbs: 540, fat: 120 }
			},
			mealLabelMap: { breakfast: 'الإفطار', lunch: 'الغداء' },
			mealTypes: ['breakfast', 'lunch']
		});

		expect(result.calories.target).toBe(14000);
		expect(result.calories.consumed).toBe(7000);
		expect(result.calories.remaining).toBe(7000);
		expect(result.calories.percent).toBe(50);
		expect(result.calories.displayPercent).toBe(50);
		expect(result.calories.overAmount).toBe(0);
		expect(result.calories.overPercent).toBe(0);
		expect(result.mealDistribution[0].name).toBe('الإفطار');
		expect(result.mealDistribution[1].name).toBe('الغداء');
	});

	it('reports overage fields when consumed exceeds target', () => {
		const result = buildChartContract({
			planType: 'daily',
			targetCalories: 1500,
			macros: { c: 50, p: 25, f: 25 },
			totals: { calories: 1875, protein: 0, carbs: 0, fat: 0 },
			mealTotals: {},
			mealLabelMap: {},
			mealTypes: []
		});

		// 1875 / 1500 = 125%
		expect(result.calories.percent).toBe(100);           // capped for bar
		expect(result.calories.displayPercent).toBe(125);    // uncapped for text
		expect(result.calories.overAmount).toBe(375);         // 1875 - 1500
		expect(result.calories.overPercent).toBe(25);         // 25% over
		expect(result.calories.remaining).toBe(0);            // clamped to 0
	});

	it('reports overage fields for macros when consumed exceeds target', () => {
		const result = buildChartContract({
			planType: 'daily',
			targetCalories: 2000,
			macros: { c: 50, p: 25, f: 25 },
			totals: { calories: 2000, protein: 70, carbs: 300, fat: 60 },
			mealTotals: {},
			mealLabelMap: {},
			mealTypes: []
		});

		// carbs target: 2000*0.5/4 = 250g, consumed 300g → 20% over
		expect(result.macros.carbs.percent).toBe(100);
		expect(result.macros.carbs.displayPercent).toBe(120);
		expect(result.macros.carbs.overAmount).toBe(50);
		expect(result.macros.carbs.overPercent).toBe(20);

		// protein target: 2000*0.25/4 = 125g, consumed 70g → under
		expect(result.macros.protein.overAmount).toBe(0);
		expect(result.macros.protein.overPercent).toBe(0);
	});

	it('handles zero and invalid denominator safely', () => {
		const result = buildChartContract({
			planType: 'daily',
			targetCalories: 0,
			macros: { c: 50, p: 25, f: 25 },
			totals: { calories: 0, protein: 0, carbs: 0, fat: 0 },
			mealTotals: {
				breakfast: { calories: 0, protein: 0, carbs: 0, fat: 0 }
			},
			mealLabelMap: { breakfast: 'الإفطار' },
			mealTypes: ['breakfast']
		});

		expect(result.calories.percent).toBe(0);
		expect(result.calories.displayPercent).toBe(0);
		expect(result.calories.overAmount).toBe(0);
		expect(result.calories.overPercent).toBe(0);
		expect(result.macros.carbs.percent).toBe(0);
		expect(result.macros.protein.percent).toBe(0);
		expect(result.macros.fat.percent).toBe(0);
		expect(result.mealDistribution).toHaveLength(0);
	});
});
