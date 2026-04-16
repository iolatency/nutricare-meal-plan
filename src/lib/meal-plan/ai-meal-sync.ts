import type { AiMealData } from './types';

/** One ingredient row: macros are totals for quantity + unit (same as AI meal JSON). */
export type AiIngredientLine = AiMealData['ingredients'][number];

export type AiMealMacroTotal = AiMealData['total'];

function roundMacro1(n: number): number {
	return Math.round(Math.max(0, n) * 10) / 10;
}

function sumDim(ings: AiIngredientLine[], key: keyof AiMealMacroTotal): number {
	return ings.reduce((s, ing) => s + (Number(ing[key]) || 0), 0);
}

/**
 * Scales each ingredient's macros so their sums match `total` (protein/carbs/fat independently,
 * then calories). `total` is treated as canonical (e.g. after macro correction).
 */
export function syncAiMealIngredientMacrosToTotal(
	ingredients: AiIngredientLine[],
	total: AiMealMacroTotal
): AiIngredientLine[] {
	if (!ingredients.length) return ingredients;

	const T: AiMealMacroTotal = {
		calories: Math.max(0, Number(total.calories) || 0),
		protein: Math.max(0, Number(total.protein) || 0),
		carbs: Math.max(0, Number(total.carbs) || 0),
		fat: Math.max(0, Number(total.fat) || 0)
	};

	const base: AiIngredientLine[] = ingredients.map((ing) => ({
		name_ar: ing.name_ar,
		quantity: Number(ing.quantity) || 0,
		unit: ing.unit,
		calories: Math.max(0, Number(ing.calories) || 0),
		protein: Math.max(0, Number(ing.protein) || 0),
		carbs: Math.max(0, Number(ing.carbs) || 0),
		fat: Math.max(0, Number(ing.fat) || 0)
	}));

	const scaleOne = (key: keyof AiMealMacroTotal, target: number): number[] => {
		const sumOld = sumDim(base, key);
		if (target <= 0) return base.map(() => 0);
		if (sumOld <= 0) return base.map((_, i) => (i === 0 ? target : 0));
		return base.map((ing) => (Number(ing[key]) || 0) * (target / sumOld));
	};

	const pScaled = scaleOne('protein', T.protein);
	const cScaled = scaleOne('carbs', T.carbs);
	const fScaled = scaleOne('fat', T.fat);
	const kScaled = scaleOne('calories', T.calories);

	let out: AiIngredientLine[] = base.map((ing, i) => ({
		...ing,
		protein: pScaled[i] ?? 0,
		carbs: cScaled[i] ?? 0,
		fat: fScaled[i] ?? 0,
		calories: kScaled[i] ?? 0
	}));

	out = out.map((ing) => ({
		...ing,
		protein: roundMacro1(ing.protein),
		carbs: roundMacro1(ing.carbs),
		fat: roundMacro1(ing.fat),
		calories: Math.round(Math.max(0, ing.calories))
	}));

	const fixRemainder = (key: keyof AiMealMacroTotal) => {
		const target = T[key];
		const cur = sumDim(out, key);
		const delta = target - cur;
		if (Math.abs(delta) < 1e-6) return;
		const lastIdx = out.length - 1;
		const last = out[lastIdx]!;
		if (key === 'calories') {
			out[lastIdx] = { ...last, calories: Math.max(0, Math.round(last.calories + delta)) };
		} else {
			out[lastIdx] = { ...last, [key]: Math.max(0, roundMacro1(last[key] + delta)) };
		}
	};

	fixRemainder('protein');
	fixRemainder('carbs');
	fixRemainder('fat');
	fixRemainder('calories');

	return out;
}

/** Reconcile ingredient rows with stored `total` (for legacy or hand-edited JSON). */
export function syncAiMealData(ai: AiMealData): AiMealData {
	if (!ai.ingredients?.length || ai.total == null || typeof ai.total !== 'object') return ai;
	const tr = ai.total;
	const hasAnyMacro =
		(Number(tr.calories) || 0) > 0 ||
		(Number(tr.protein) || 0) > 0 ||
		(Number(tr.carbs) || 0) > 0 ||
		(Number(tr.fat) || 0) > 0;
	if (!hasAnyMacro) return ai;
	return {
		...ai,
		ingredients: syncAiMealIngredientMacrosToTotal(ai.ingredients, tr),
		total: { ...tr }
	};
}
