import type { Macros, PlanGrid, PlanSlot, RecipeNutrients } from './types';

/* ─── Diet-tag → nutrient threshold rules ─── */

export interface NutrientLimit {
	nutrient: string;
	label: string;
	maxMg: number;
	unit: string;
}

const TAG_LIMITS: Record<string, NutrientLimit[]> = {
	'منخفض الصوديوم': [{ nutrient: 'sodium', label: 'صوديوم', maxMg: 1500, unit: 'mg' }],
	'متوسط الصوديوم': [{ nutrient: 'sodium', label: 'صوديوم', maxMg: 2300, unit: 'mg' }],
	'قليل الصوديوم': [{ nutrient: 'sodium', label: 'صوديوم', maxMg: 1500, unit: 'mg' }],
	'منخفض البوتاسيوم': [{ nutrient: 'potassium', label: 'بوتاسيوم', maxMg: 2000, unit: 'mg' }],
	'متوسط البوتاسيوم': [{ nutrient: 'potassium', label: 'بوتاسيوم', maxMg: 3000, unit: 'mg' }],
	'منخفض الفوسفور': [{ nutrient: 'phosphorus', label: 'فوسفور', maxMg: 800, unit: 'mg' }],
	'غني بالألياف': [{ nutrient: 'fiber', label: 'ألياف (حد أدنى)', maxMg: -25000, unit: 'mg' }],
	'عالي بالألياف': [{ nutrient: 'fiber', label: 'ألياف (حد أدنى)', maxMg: -25000, unit: 'mg' }],
	'قليل الألياف': [{ nutrient: 'fiber', label: 'ألياف', maxMg: 10000, unit: 'mg' }],
	'منخفض بالألياف': [{ nutrient: 'fiber', label: 'ألياف', maxMg: 10000, unit: 'mg' }],
	'منخفض الكالسيوم': [{ nutrient: 'calcium', label: 'كالسيوم', maxMg: 600, unit: 'mg' }],
};

export function getLimitsForTags(tags: string[], dietTypes: string[]): NutrientLimit[] {
	const all = [...tags, ...dietTypes];
	const limits: NutrientLimit[] = [];
	const seen = new Set<string>();
	for (const tag of all) {
		const rules = TAG_LIMITS[tag];
		if (!rules) continue;
		for (const r of rules) {
			if (!seen.has(r.nutrient)) {
				seen.add(r.nutrient);
				limits.push(r);
			}
		}
	}
	return limits;
}

/* ─── Exclusion checks ─── */

export interface ExclusionWarning {
	recipeId: number;
	recipeName: string;
	matchedExclusions: string[];
	dateKey: string;
	mealType: string;
}

export function checkExclusions(
	plan: PlanGrid,
	excludedFoods: string[],
	recipeIngredientNames: Map<number, string[]>
): ExclusionWarning[] {
	if (!excludedFoods.length) return [];

	const warnings: ExclusionWarning[] = [];
	const lowerExclusions = excludedFoods.map((e) => e.toLowerCase());

	for (const [dateKey, daySlots] of Object.entries(plan)) {
		for (const [mealType, slot] of Object.entries(daySlots)) {
			if (!slot.recipeId) continue;
			const ingredients = recipeIngredientNames.get(slot.recipeId);
			if (!ingredients) continue;

			const matched: string[] = [];
			for (const ingName of ingredients) {
				const lower = ingName.toLowerCase();
				for (let i = 0; i < lowerExclusions.length; i++) {
					if (lower.includes(lowerExclusions[i]) || lowerExclusions[i].includes(lower)) {
						matched.push(excludedFoods[i]);
					}
				}
			}

			if (matched.length) {
				warnings.push({
					recipeId: slot.recipeId,
					recipeName: '',
					matchedExclusions: [...new Set(matched)],
					dateKey,
					mealType
				});
			}
		}
	}
	return warnings;
}

/* ─── Restriction limit checks ─── */

export interface RestrictionWarning {
	nutrient: string;
	label: string;
	actual: number;
	limit: number;
	unit: string;
	isMinimum: boolean;
}

export function checkRestrictions(
	limits: NutrientLimit[],
	supplementTotals: { sodium?: number; potassium?: number; phosphorus?: number; calcium?: number; fiber?: number },
	planCalories: number
): RestrictionWarning[] {
	const warnings: RestrictionWarning[] = [];

	for (const lim of limits) {
		const actual = (supplementTotals as Record<string, number | undefined>)[lim.nutrient] ?? 0;

		if (lim.maxMg < 0) {
			const minVal = Math.abs(lim.maxMg) / 1000;
			const actualG = actual;
			if (actualG < minVal) {
				warnings.push({
					nutrient: lim.nutrient,
					label: lim.label,
					actual: actualG,
					limit: minVal,
					unit: 'g',
					isMinimum: true
				});
			}
		} else {
			if (actual > lim.maxMg) {
				warnings.push({
					nutrient: lim.nutrient,
					label: lim.label,
					actual,
					limit: lim.maxMg,
					unit: lim.unit,
					isMinimum: false
				});
			}
		}
	}
	return warnings;
}

/* ─── Plan validation summary ─── */

export type ValidationStatus = 'pass' | 'warn' | 'fail';

export interface ValidationResult {
	status: ValidationStatus;
	exclusionWarnings: ExclusionWarning[];
	restrictionWarnings: RestrictionWarning[];
	macroValid: boolean;
}

export function validatePlan(
	plan: PlanGrid,
	excludedFoods: string[],
	tags: string[],
	dietTypes: string[],
	macros: Macros,
	recipeIngredientNames: Map<number, string[]>,
	supplementTotals: Record<string, number>,
	planCalories: number
): ValidationResult {
	const exclusionWarnings = checkExclusions(plan, excludedFoods, recipeIngredientNames);
	const limits = getLimitsForTags(tags, dietTypes);
	const restrictionWarnings = checkRestrictions(limits, supplementTotals, planCalories);
	const macroValid = macros.c + macros.p + macros.f === 100;

	let status: ValidationStatus = 'pass';
	if (exclusionWarnings.length > 0) status = 'fail';
	else if (restrictionWarnings.length > 0 || !macroValid) status = 'warn';

	return { status, exclusionWarnings, restrictionWarnings, macroValid };
}
