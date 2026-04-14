import { db } from '$lib/server/db';
import { mealPlanSessions, patientDiagnoses } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { callDeepSeek, parseDeepSeekJson } from '$lib/server/ai/deepseek';

const SYSTEM_PROMPT =
	'You are a professional clinical dietitian AI. Output a single JSON object only (the word json is required here). No markdown, no code fences, no text outside the JSON. All meal names, ingredient names, and preparation steps must be in Arabic. Escape quotes and line breaks inside JSON strings properly.';

const DAY_CUISINE_HINTS = [
	'traditional Saudi / Gulf cuisine',
	'Mediterranean / Levantine cuisine',
	'Egyptian / North African cuisine',
	'international healthy cuisine',
	'light salads, soups, and wraps',
	'hearty high-protein meals',
	'mixed variety — any cuisine not used earlier in the week'
];

type MealDay = {
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

const MEAL_LABELS: Record<string, string> = {
	breakfast: 'الإفطار',
	brunch: 'البرانش',
	morning_snack: 'سناك الصباح',
	lunch: 'الغداء',
	afternoon_snack: 'السناك',
	dinner: 'العشاء',
	post_workout: 'ما بعد التمرين'
};

function buildDayPrompt(
	date: string,
	dayIndex: number,
	totalDays: number,
	mealTypeIds: string[],
	constraints: string[]
): string {
	const cuisineHint = DAY_CUISINE_HINTS[dayIndex % DAY_CUISINE_HINTS.length];

	const slotTable = mealTypeIds
		.map((id) => `  - ${MEAL_LABELS[id] ?? id} → mealType: "${id}"`)
		.join('\n');

	const varietyNote =
		totalDays > 1
			? `Day ${dayIndex + 1} of ${totalDays}. Style: ${cuisineHint}. Use different proteins/grains/veg than other days; keep wording compact.`
			: '';

	return `Generate one day for date ${date}.
${varietyNote}

CONSTRAINTS:
${constraints.join('\n')}

MEALS (exact order, exact mealType keys):
${slotTable}

Return compact JSON only:
{
  "days": [
    {
      "date": "${date}",
      "meals": [
        {
          "mealType": "${mealTypeIds[0] ?? 'breakfast'}",
          "name_ar": "اسم الوجبة",
          "ingredients": [
            { "name_ar": "المكون", "quantity": 100, "unit": "g", "calories": 50, "protein": 3, "carbs": 8, "fat": 1 }
          ],
          "total": { "calories": 400, "protein": 20, "carbs": 50, "fat": 10 },
          "steps": "1. ... 2. ... (Arabic, max 5 very short steps per meal)"
        }
      ]
    }
  ]
}

Rules:
- Exactly ${mealTypeIds.length} meal object(s), same order as slots.
- Each meal: 3–5 ingredients only; realistic grams/ml and macros for those quantities.
- steps: Arabic, numbered, max 5 short lines per meal (no long paragraphs).
- Daily calories from meals should approximate: ${constraints[0]}
- All visible user text in Arabic; valid JSON (no trailing commas).`;
}

function tokenBudgetForDay(mealSlotCount: number): { first: number; retry: number } {
	const base = 3200 + mealSlotCount * 720;
	const first = Math.min(8192, Math.max(4096, base));
	const retry = Math.min(8192, first + 2048);
	return { first, retry };
}

export type AiMealPlanRequestBody = {
	sessionId: number;
	scope: 'day' | 'week';
	targetCalories: number;
	macros: { c: number; p: number; f: number };
	excludedFoods: string[];
	diagnoses: string[];
	tags: string[];
	dietTypes: string[];
	selectedMeals: string[];
	extraNote: string;
	dates: string[];
};

export type AiMealPlanResult =
	| { ok: true; status: 200; body: { success: true; plan: { days: MealDay[] }; partial: boolean; failedDates?: string[] } }
	| { ok: false; status: number; body: { success: false; error: string } };

export async function generateAiMealPlan(body: AiMealPlanRequestBody): Promise<AiMealPlanResult> {
	const {
		sessionId,
		scope,
		targetCalories,
		macros,
		excludedFoods,
		diagnoses,
		tags,
		dietTypes,
		selectedMeals,
		extraNote,
		dates
	} = body;

	const session = db.select().from(mealPlanSessions).where(eq(mealPlanSessions.id, sessionId)).get();
	if (!session) {
		return { ok: false, status: 404, body: { success: false, error: 'Session not found' } };
	}

	const patientDiags = db
		.select()
		.from(patientDiagnoses)
		.where(eq(patientDiagnoses.clientId, session.clientId))
		.all();

	const diagText = [...diagnoses, ...patientDiags.map((d) => `${d.name} (${d.severity})`)].join(', ');

	const constraints: string[] = [];
	constraints.push(`Target calories: ${targetCalories} kcal/day.`);
	constraints.push(`Macro ratio: Carbs ${macros.c}%, Protein ${macros.p}%, Fat ${macros.f}%.`);
	if (excludedFoods.length) constraints.push(`STRICTLY EXCLUDE these foods: ${excludedFoods.join(', ')}.`);
	if (diagText) constraints.push(`Patient diagnoses: ${diagText}.`);
	if (tags.length) constraints.push(`Dietary tags: ${tags.join(', ')}.`);
	if (dietTypes.length) constraints.push(`Diet types: ${dietTypes.join(', ')}.`);
	if (extraNote) constraints.push(`Additional instructions: ${extraNote}`);

	const mealTypeIds = selectedMeals.filter((m) => m !== 'supplement');

	if (mealTypeIds.length === 0) {
		return { ok: false, status: 400, body: { success: false, error: 'لم يتم تحديد أي وجبات.' } };
	}

	const targetDates = scope === 'week' ? dates.slice(0, 7) : dates.slice(0, 1);
	const totalDays = targetDates.length;
	const { first: maxTokensFirst, retry: maxTokensRetry } = tokenBudgetForDay(mealTypeIds.length);

	const results = await Promise.allSettled(
		targetDates.map(async (date, dayIndex) => {
			const prompt = buildDayPrompt(date, dayIndex, totalDays, mealTypeIds, constraints);
			const optsFirst = {
				jsonObject: true as const,
				maxTokens: maxTokensFirst,
				temperature: 0.45
			};
			const optsRetry = {
				jsonObject: true as const,
				maxTokens: maxTokensRetry,
				temperature: 0.45
			};
			let { content, finishReason } = await callDeepSeek(prompt, SYSTEM_PROMPT, optsFirst);
			if (finishReason === 'length') {
				({ content, finishReason } = await callDeepSeek(prompt, SYSTEM_PROMPT, optsRetry));
			}
			if (finishReason === 'length') {
				throw new Error('Meal plan day response was truncated');
			}
			let parsed: { days: MealDay[] };
			try {
				parsed = parseDeepSeekJson(content) as { days: MealDay[] };
			} catch (e) {
				const msg = e instanceof Error ? e.message : String(e);
				throw new Error(`Invalid JSON from model: ${msg}`);
			}
			if (!parsed?.days?.[0]) throw new Error('Empty or malformed response');
			parsed.days[0].date = date;
			return parsed.days[0];
		})
	);

	const allDays: MealDay[] = [];
	const failedDates: string[] = [];
	for (let i = 0; i < results.length; i++) {
		const r = results[i];
		if (r.status === 'fulfilled') {
			allDays.push(r.value);
		} else {
			failedDates.push(targetDates[i]);
			console.error(`[ai/meal-plan] Day ${targetDates[i]} (index ${i}) failed:`, r.reason);
		}
	}

	if (allDays.length === 0) {
		return {
			ok: false,
			status: 500,
			body: { success: false, error: 'فشل في إنشاء الخطة. حاول مرة أخرى.' }
		};
	}

	const partial = failedDates.length > 0;
	return {
		ok: true,
		status: 200,
		body: {
			success: true,
			plan: { days: allDays },
			partial,
			failedDates: partial ? failedDates : undefined
		}
	};
}
