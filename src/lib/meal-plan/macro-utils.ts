import type { Macros, PlanGrid, PlanTotals, MealTotals, RecipeNutrients } from './types';
import { MICROS } from './constants';

export function adjustMacro(changed: 'c' | 'p' | 'f', newValue: number, current: Macros): Macros {
	let c = current.c;
	let p = current.p;
	let f = current.f;

	const remaining = 100 - newValue;

	if (changed === 'c') {
		c = newValue;
		const sum = p + f || 1;
		p = Math.round((remaining * p) / sum);
		f = 100 - c - p;
	} else if (changed === 'p') {
		p = newValue;
		const sum = c + f || 1;
		c = Math.round((remaining * c) / sum);
		f = 100 - p - c;
	} else {
		f = newValue;
		const sum = c + p || 1;
		c = Math.round((remaining * c) / sum);
		p = 100 - f - c;
	}

	return { c: Math.max(0, c), p: Math.max(0, p), f: Math.max(0, f) };
}

export function macroGrams(
	calories: number,
	macros: Macros
): { carbG: number; protG: number; fatG: number } {
	return {
		carbG: calories ? Math.round((calories * macros.c) / 100 / 4) : 0,
		protG: calories ? Math.round((calories * macros.p) / 100 / 4) : 0,
		fatG: calories ? Math.round((calories * macros.f) / 100 / 9) : 0
	};
}

export function parseNutrients(json: string | null): RecipeNutrients | null {
	if (!json) return null;
	try {
		return JSON.parse(json);
	} catch {
		return null;
	}
}

export function computePlanTotals(
	plan: PlanGrid,
	recipeLookup: Map<number, RecipeNutrients>,
	supplementLookup: Map<number, { totalKcal: number; protein: number; carbs: number; fat: number }>,
	foodLookup?: Map<number, { calories: number; protein: number; carbs: number; fat: number }>
): { totals: PlanTotals; mealTotals: MealTotals } {
	const totals: PlanTotals = { calories: 0, protein: 0, carbs: 0, fat: 0 };
	const mealTotals: MealTotals = {};

	for (const daySlots of Object.values(plan)) {
		for (const [mealType, slot] of Object.entries(daySlots)) {
			if (!mealTotals[mealType]) {
				mealTotals[mealType] = { calories: 0, protein: 0, carbs: 0, fat: 0 };
			}

			if (slot.recipeId) {
				const n = recipeLookup.get(slot.recipeId);
				if (n) {
					const cals = n.calories ?? 0;
					const prot = n.protein ?? 0;
					const carb = n.carbs ?? 0;
					const fat = n.fat ?? 0;
					totals.calories += cals;
					totals.protein += prot;
					totals.carbs += carb;
					totals.fat += fat;
					mealTotals[mealType].calories += cals;
					mealTotals[mealType].protein += prot;
					mealTotals[mealType].carbs += carb;
					mealTotals[mealType].fat += fat;
				}
			} else if (slot.supplementId) {
				const s = supplementLookup.get(slot.supplementId);
				if (s) {
					totals.calories += s.totalKcal;
					totals.protein += s.protein;
					totals.carbs += s.carbs;
					totals.fat += s.fat;
					mealTotals[mealType].calories += s.totalKcal;
					mealTotals[mealType].protein += s.protein;
					mealTotals[mealType].carbs += s.carbs;
					mealTotals[mealType].fat += s.fat;
				}
			} else if (slot.foodItemId && foodLookup) {
				const f = foodLookup.get(slot.foodItemId);
				if (f) {
					totals.calories += f.calories;
					totals.protein += f.protein;
					totals.carbs += f.carbs;
					totals.fat += f.fat;
					mealTotals[mealType].calories += f.calories;
					mealTotals[mealType].protein += f.protein;
					mealTotals[mealType].carbs += f.carbs;
					mealTotals[mealType].fat += f.fat;
				}
			} else if (slot.aiMeal?.total) {
				const t = slot.aiMeal.total;
				totals.calories += t.calories ?? 0;
				totals.protein += t.protein ?? 0;
				totals.carbs += t.carbs ?? 0;
				totals.fat += t.fat ?? 0;
				mealTotals[mealType].calories += t.calories ?? 0;
				mealTotals[mealType].protein += t.protein ?? 0;
				mealTotals[mealType].carbs += t.carbs ?? 0;
				mealTotals[mealType].fat += t.fat ?? 0;
			}
		}
	}

	return { totals, mealTotals };
}

export function estimateMicros(totalCalories: number) {
	return MICROS.map((micro) => {
		const val = totalCalories ? Math.round(((totalCalories / 1000) * micro.per1000 * 10) / 10) : 0;
		const pct = micro.rda ? Math.min(100, Math.round((val / micro.rda) * 100)) : 0;
		return { ...micro, val, pct };
	});
}
