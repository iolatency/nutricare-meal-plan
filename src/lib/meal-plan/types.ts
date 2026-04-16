import type { DiagId, MealTypeId } from './constants';

export interface Macros {
	c: number;
	p: number;
	f: number;
}

export interface BuilderConfig {
	planType: 'daily' | 'weekly';
	diags: DiagId[];
	excluded: string[];
	excludedFoodItemIds?: number[];
	macros: Macros;
	targetCalories: number;
	selectedMeals: MealTypeId[];
	tags: string[];
	dietTypes: string[];
	extraNote: string;
}

export interface AiMealData {
	name: string;
	/** Optional hero image (e.g. from AI or future enrichment). */
	imageUrl?: string | null;
	/** Each row: macros are totals for `quantity` + `unit` (not per-100g unless quantity is 100 g). */
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
}

export interface PlanSlot {
	recipeId?: number;
	supplementId?: number;
	supplementVolumeMl?: number;
	supplementOverrides?: {
		calories?: number;
		protein?: number;
		carbs?: number;
		fat?: number;
	};
	foodItemId?: number;
	aiMeal?: AiMealData;
}

/** dateString (YYYY-MM-DD) -> mealType -> slot */
export type PlanGrid = Record<string, Record<string, PlanSlot>>;

export interface RecipeNutrients {
	calories?: number;
	protein?: number;
	carbs?: number;
	fat?: number;
	fiber?: number;
}

export interface PlanTotals {
	calories: number;
	protein: number;
	carbs: number;
	fat: number;
}

export interface MealTotals {
	[mealType: string]: PlanTotals;
}
