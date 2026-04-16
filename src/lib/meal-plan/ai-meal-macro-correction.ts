import { syncAiMealIngredientMacrosToTotal } from './ai-meal-sync';

/** One day of AI-generated meals (OpenAI JSON shape). */
export type MealDay = {
	date: string;
	meals: Array<{
		mealType: string;
		name_ar: string;
		ingredients: Array<{
			name_ar: string;
			quantity: number;
			unit: string;
			calories: number;
			protein: number;
			carbs: number;
			fat: number;
		}>;
		total: { calories: number; protein: number; carbs: number; fat: number };
		steps: string;
	}>;
};

/**
 * Adjusts each meal's `total` toward target macro split and day calories, then scales
 * ingredient rows so their sums match each meal's final `total`.
 */
export function applyLocalMacroCorrection(
	day: MealDay,
	targetCalories: number,
	macros: { c: number; p: number; f: number }
): { day: MealDay; applied: boolean; beforeCalories: number; afterCalories: number } {
	const meals = day.meals ?? [];
	if (!meals.length || targetCalories <= 0) {
		return { day, applied: false, beforeCalories: 0, afterCalories: 0 };
	}

	const beforeCalories = meals.reduce((sum, m) => sum + (Number(m.total?.calories) || 0), 0);
	const beforeProtein = meals.reduce((sum, m) => sum + (Number(m.total?.protein) || 0), 0);
	const beforeCarbs = meals.reduce((sum, m) => sum + (Number(m.total?.carbs) || 0), 0);
	const beforeFat = meals.reduce((sum, m) => sum + (Number(m.total?.fat) || 0), 0);
	if (beforeCalories <= 0) {
		return { day, applied: false, beforeCalories, afterCalories: beforeCalories };
	}

	const targetProtein = (targetCalories * (macros.p / 100)) / 4;
	const targetCarbs = (targetCalories * (macros.c / 100)) / 4;
	const targetFat = (targetCalories * (macros.f / 100)) / 9;

	const rp = targetProtein > 0 && beforeProtein > 0 ? targetProtein / beforeProtein : 1;
	const rc = targetCarbs > 0 && beforeCarbs > 0 ? targetCarbs / beforeCarbs : 1;
	const rf = targetFat > 0 && beforeFat > 0 ? targetFat / beforeFat : 1;

	const correctedMeals = meals.map((meal) => {
		const p = (Number(meal.total?.protein) || 0) * rp;
		const c = (Number(meal.total?.carbs) || 0) * rc;
		const f = (Number(meal.total?.fat) || 0) * rf;
		const kcal = p * 4 + c * 4 + f * 9;
		return {
			...meal,
			total: {
				calories: Math.round(kcal),
				protein: Math.round(p * 10) / 10,
				carbs: Math.round(c * 10) / 10,
				fat: Math.round(f * 10) / 10
			}
		};
	});

	const correctedCalories = correctedMeals.reduce((sum, m) => sum + (Number(m.total?.calories) || 0), 0);
	const energyScale = correctedCalories > 0 ? targetCalories / correctedCalories : 1;
	const finalMeals = correctedMeals.map((meal) => {
		const p = (Number(meal.total?.protein) || 0) * energyScale;
		const c = (Number(meal.total?.carbs) || 0) * energyScale;
		const f = (Number(meal.total?.fat) || 0) * energyScale;
		const kcal = p * 4 + c * 4 + f * 9;
		return {
			...meal,
			total: {
				calories: Math.round(kcal),
				protein: Math.round(p * 10) / 10,
				carbs: Math.round(c * 10) / 10,
				fat: Math.round(f * 10) / 10
			}
		};
	});

	const syncedMeals = finalMeals.map((meal) => {
		const ings = meal.ingredients;
		if (!ings?.length) return meal;
		return {
			...meal,
			ingredients: syncAiMealIngredientMacrosToTotal(ings, meal.total)
		};
	});

	const afterCalories = syncedMeals.reduce((sum, m) => sum + (Number(m.total?.calories) || 0), 0);
	return {
		day: { ...day, meals: syncedMeals },
		applied: true,
		beforeCalories,
		afterCalories
	};
}
