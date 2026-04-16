import { describe, it, expect } from 'vitest';
import { syncAiMealIngredientMacrosToTotal, syncAiMealData } from './ai-meal-sync';
import { applyLocalMacroCorrection } from './ai-meal-macro-correction';

function sumIng(
	ings: { calories: number; protein: number; carbs: number; fat: number }[],
	key: 'calories' | 'protein' | 'carbs' | 'fat'
) {
	return ings.reduce((s, i) => s + (Number(i[key]) || 0), 0);
}

describe('syncAiMealIngredientMacrosToTotal', () => {
	it('scales rows so sums match canonical total', () => {
		const ingredients = [
			{ name_ar: 'أ', quantity: 100, unit: 'g', calories: 500, protein: 50, carbs: 40, fat: 10 },
			{ name_ar: 'ب', quantity: 50, unit: 'g', calories: 200, protein: 10, carbs: 80, fat: 5 }
		];
		const total = { calories: 800, protein: 40, carbs: 100, fat: 12 };
		const out = syncAiMealIngredientMacrosToTotal(ingredients, total);
		expect(Math.round(sumIng(out, 'calories'))).toBe(total.calories);
		expect(sumIng(out, 'protein')).toBeCloseTo(total.protein, 5);
		expect(sumIng(out, 'carbs')).toBeCloseTo(total.carbs, 5);
		expect(sumIng(out, 'fat')).toBeCloseTo(total.fat, 5);
	});

	it('puts macro on first row when all lines are zero for that dimension', () => {
		const ingredients = [
			{ name_ar: 'ملح', quantity: 5, unit: 'g', calories: 0, protein: 0, carbs: 0, fat: 0 },
			{ name_ar: 'ماء', quantity: 200, unit: 'ml', calories: 0, protein: 0, carbs: 0, fat: 0 }
		];
		const total = { calories: 100, protein: 20, carbs: 10, fat: 5 };
		const out = syncAiMealIngredientMacrosToTotal(ingredients, total);
		expect(out[0]!.protein).toBeCloseTo(20, 5);
		expect(out[1]!.protein).toBe(0);
		expect(sumIng(out, 'calories')).toBeCloseTo(100, 2);
	});

	it('syncAiMealData leaves meals without ingredients unchanged', () => {
		const ai = {
			name: 'x',
			ingredients: [],
			total: { calories: 100, protein: 10, carbs: 10, fat: 5 },
			steps: ''
		};
		expect(syncAiMealData(ai)).toEqual(ai);
	});
});

describe('applyLocalMacroCorrection + ingredient sync', () => {
	it('ingredient sums match each meal total after correction', () => {
		const day = {
			date: '2026-04-16',
			meals: [
				{
					mealType: 'lunch',
					name_ar: 'كبسة',
					ingredients: [
						{ name_ar: 'دجاج', quantity: 300, unit: 'g', calories: 495, protein: 93, carbs: 0, fat: 10.8 },
						{ name_ar: 'أرز', quantity: 200, unit: 'g', calories: 720, protein: 13.3, carbs: 160, fat: 1.3 }
					],
					total: { calories: 2000, protein: 100, carbs: 200, fat: 50 },
					steps: '1'
				},
				{
					mealType: 'dinner',
					name_ar: 'سلطة',
					ingredients: [{ name_ar: 'خس', quantity: 100, unit: 'g', calories: 20, protein: 2, carbs: 3, fat: 0.2 }],
					total: { calories: 400, protein: 30, carbs: 40, fat: 15 },
					steps: '2'
				}
			]
		};

		const { day: out } = applyLocalMacroCorrection(day, 1800, { c: 50, p: 25, f: 25 });

		for (const m of out.meals) {
			const ings = m.ingredients ?? [];
			if (!ings.length) continue;
			const t = m.total;
			expect(sumIng(ings, 'protein')).toBeCloseTo(t.protein, 4);
			expect(sumIng(ings, 'carbs')).toBeCloseTo(t.carbs, 4);
			expect(sumIng(ings, 'fat')).toBeCloseTo(t.fat, 4);
			expect(sumIng(ings, 'calories')).toBeCloseTo(t.calories, 2);
		}
	});
});
