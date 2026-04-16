import type { Macros, PlanTotals, MealTotals } from './types';
import { macroGrams } from './macro-utils';

export type ChartMacroKey = 'carbs' | 'protein' | 'fat';

export type ChartMetric = {
	target: number;
	consumed: number;
	/** Percent capped to 100 — drives bar fill width. */
	percent: number;
	/** Uncapped actual percent for display text (e.g. 125 when over target). */
	displayPercent: number;
	/** Amount over target (> 0 when exceeded, else 0). */
	overAmount: number;
	/** Percent over target (e.g. 25 when 125% consumed, else 0). */
	overPercent: number;
};

export type ChartContract = {
	periodLabel: string;
	calories: ChartMetric & { remaining: number };
	macros: Record<ChartMacroKey, ChartMetric & { unit: 'g' }>;
	mealDistribution: Array<{
		mealType: string;
		name: string;
		caloriesShare: number;
		percent: number;
	}>;
};

function safeRound(n: number) {
	return Number.isFinite(n) ? Math.round(n) : 0;
}

function safePercent(numerator: number, denominator: number) {
	if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return 0;
	return Math.max(0, Math.min(100, safeRound((numerator / denominator) * 100)));
}

function safeDisplayPercent(numerator: number, denominator: number) {
	if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return 0;
	return Math.max(0, safeRound((numerator / denominator) * 100));
}

function buildMetric(consumed: number, target: number): Omit<ChartMetric, never> {
	const pct = safePercent(consumed, target);
	const displayPct = safeDisplayPercent(consumed, target);
	const over = target > 0 && consumed > target ? safeRound(consumed - target) : 0;
	const overPct = target > 0 && consumed > target ? safeRound(((consumed - target) / target) * 100) : 0;
	return {
		target,
		consumed,
		percent: pct,
		displayPercent: displayPct,
		overAmount: over,
		overPercent: overPct
	};
}

export function buildChartContract(params: {
	planType: 'daily' | 'weekly';
	targetCalories: number;
	macros: Macros;
	totals: PlanTotals;
	mealTotals: MealTotals;
	mealLabelMap: Record<string, string>;
	mealTypes: string[];
}): ChartContract {
	const periodFactor = params.planType === 'weekly' ? 7 : 1;
	const targetBase = Math.max(0, safeRound(params.targetCalories));
	const target = targetBase * periodFactor;
	const consumed = Math.max(0, safeRound(params.totals.calories));
	const remaining = Math.max(0, target - consumed);

	const calMetric = buildMetric(consumed, target);

	const macroTargets = macroGrams(targetBase, params.macros);
	const macroTargetScaled = {
		carbs: macroTargets.carbG * periodFactor,
		protein: macroTargets.protG * periodFactor,
		fat: macroTargets.fatG * periodFactor
	};

	const macroContract: ChartContract['macros'] = {
		carbs: {
			...buildMetric(
				Math.max(0, safeRound(params.totals.carbs)),
				Math.max(0, safeRound(macroTargetScaled.carbs))
			),
			unit: 'g'
		},
		protein: {
			...buildMetric(
				Math.max(0, safeRound(params.totals.protein)),
				Math.max(0, safeRound(macroTargetScaled.protein))
			),
			unit: 'g'
		},
		fat: {
			...buildMetric(
				Math.max(0, safeRound(params.totals.fat)),
				Math.max(0, safeRound(macroTargetScaled.fat))
			),
			unit: 'g'
		}
	};

	const distribution = params.mealTypes
		.map((mealType) => {
			const mealCals = params.mealTotals[mealType]?.calories ?? 0;
			return {
				mealType,
				name: params.mealLabelMap[mealType] ?? mealType,
				caloriesShare: Math.max(0, safeRound(mealCals)),
				percent: safePercent(mealCals, params.totals.calories)
			};
		})
		.filter((m) => m.caloriesShare > 0);

	return {
		periodLabel: params.planType === 'weekly' ? 'الأسبوع المعروض' : 'اليوم المعروض',
		calories: {
			...calMetric,
			remaining
		},
		macros: macroContract,
		mealDistribution: distribution
	};
}
