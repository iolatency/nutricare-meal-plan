import { db } from '$lib/server/db';
import {
	users,
	recipes,
	recipeCategories,
	supplements,
	foodItems,
	foodCategories,
	mealPlanSessions,
	mealPlans,
	mealDays,
	meals,
	patientDiagnoses,
	recipeIngredients
} from '$lib/server/db/schema';
import { eq, ne, desc, and, inArray } from 'drizzle-orm';
import { error, fail, type ActionFailure } from '@sveltejs/kit';
import { buildChartContract } from '$lib/meal-plan/chart-contract';

export async function loadMealPlanBuilderPage(params: {
	sessionId: number;
	dietitianId: number;
}) {
	const { sessionId, dietitianId } = params;

	const session = db
		.select()
		.from(mealPlanSessions)
		.where(and(eq(mealPlanSessions.id, sessionId), eq(mealPlanSessions.dietitianId, dietitianId)))
		.get();

	if (!session) error(404, 'الجلسة غير موجودة');

	const patient = db
		.select({ id: users.id, name: users.name, email: users.email, phone: users.phone })
		.from(users)
		.where(eq(users.id, session.clientId))
		.get();

	if (!patient) error(404, 'العميل غير موجود');

	const ymdPattern = /^\d{4}-\d{2}-\d{2}$/;
	const siblingSessions = db
		.select({ startDate: mealPlanSessions.startDate, endDate: mealPlanSessions.endDate })
		.from(mealPlanSessions)
		.where(and(eq(mealPlanSessions.clientId, session.clientId), eq(mealPlanSessions.dietitianId, dietitianId)))
		.all()
		.filter((s) => ymdPattern.test(s.startDate) && ymdPattern.test(s.endDate))
		.sort((a, b) => a.startDate.localeCompare(b.startDate));
	const timelineAnchorBaseDate = siblingSessions[0]?.startDate ?? session.startDate;
	const timelineMinDate = siblingSessions[0]?.startDate ?? session.startDate;
	const timelineMaxDate = siblingSessions.length
		? siblingSessions.map((s) => s.endDate).sort().at(-1) ?? session.endDate
		: session.endDate;

	const existingPlan = db
		.select()
		.from(mealPlans)
		.where(eq(mealPlans.sessionId, sessionId))
		.orderBy(desc(mealPlans.version))
		.limit(1)
		.get();

	let existingMealDays: Array<{
		day: typeof mealDays.$inferSelect;
		meals: Array<typeof meals.$inferSelect>;
	}> = [];

	if (existingPlan) {
		const days = db.select().from(mealDays).where(eq(mealDays.mealPlanId, existingPlan.id)).all();

		const dayIds = days.map((d) => d.id);
		const allMeals = dayIds.length
			? db.select().from(meals).where(inArray(meals.mealDayId, dayIds)).orderBy(meals.sortOrder).all()
			: [];

		const mealsByDay = new Map<number, typeof allMeals>();
		for (const meal of allMeals) {
			const arr = mealsByDay.get(meal.mealDayId) ?? [];
			arr.push(meal);
			mealsByDay.set(meal.mealDayId, arr);
		}

		existingMealDays = days.map((day) => ({
			day,
			meals: mealsByDay.get(day.id) ?? []
		}));
	}

	const myRecipes = db
		.select({ recipe: recipes, category: recipeCategories })
		.from(recipes)
		.leftJoin(recipeCategories, eq(recipes.categoryId, recipeCategories.id))
		.where(eq(recipes.ownerId, dietitianId))
		.orderBy(desc(recipes.createdAt))
		.all();

	const recipeIds = myRecipes.map((r) => r.recipe.id);
	const allIngredients = recipeIds.length
		? db
				.select({
					recipeId: recipeIngredients.recipeId,
					customText: recipeIngredients.customText,
					foodName: foodItems.name,
					foodNameAr: foodItems.nameAr,
					quantity: recipeIngredients.quantity,
					unit: recipeIngredients.unit,
					foodCalories: foodItems.calories,
					foodProtein: foodItems.protein,
					foodCarbs: foodItems.carbs,
					foodFat: foodItems.fat,
					foodPortionSize: foodItems.portionSize
				})
				.from(recipeIngredients)
				.leftJoin(foodItems, eq(recipeIngredients.foodItemId, foodItems.id))
				.where(inArray(recipeIngredients.recipeId, recipeIds))
				.all()
		: [];

	const ingredientsByRecipe = new Map<number, string[]>();
	const ingredientDetailsByRecipe = new Map<
		number,
		Array<{
			name: string;
			quantity: number;
			unit: string;
			calories?: number;
			protein?: number;
			carbs?: number;
			fat?: number;
		}>
	>();
	for (const ing of allIngredients) {
		const names = ingredientsByRecipe.get(ing.recipeId) ?? [];
		const details = ingredientDetailsByRecipe.get(ing.recipeId) ?? [];
		const name = ing.foodNameAr ?? ing.foodName ?? ing.customText ?? '';
		if (name) names.push(name);
		let calories: number | undefined;
		let protein: number | undefined;
		let carbs: number | undefined;
		let fat: number | undefined;
		if (ing.foodCalories != null && ing.foodPortionSize != null) {
			const portion = ing.foodPortionSize > 0 ? ing.foodPortionSize : 100;
			const factor = ing.quantity / portion;
			calories = Math.round((ing.foodCalories || 0) * factor);
			protein = Math.round((ing.foodProtein || 0) * factor * 10) / 10;
			carbs = Math.round((ing.foodCarbs || 0) * factor * 10) / 10;
			fat = Math.round((ing.foodFat || 0) * factor * 10) / 10;
		}
		details.push({
			name,
			quantity: ing.quantity,
			unit: ing.unit,
			...(calories !== undefined ? { calories, protein, carbs, fat } : {})
		});
		ingredientsByRecipe.set(ing.recipeId, names);
		ingredientDetailsByRecipe.set(ing.recipeId, details);
	}

	const recipesWithIngNames = myRecipes.map((r) => ({
		...r,
		recipe: {
			...r.recipe,
			ingredientNames: ingredientsByRecipe.get(r.recipe.id) ?? [],
			ingredientDetails: ingredientDetailsByRecipe.get(r.recipe.id) ?? []
		}
	}));

	const allSupplements = db.select().from(supplements).all();

	const allFoods = db.select().from(foodItems).orderBy(foodItems.nameAr).limit(500).all();
	const allFoodCategories = db.select().from(foodCategories).all();
	const diagnosesList = db
		.select()
		.from(patientDiagnoses)
		.where(eq(patientDiagnoses.clientId, session.clientId))
		.orderBy(desc(patientDiagnoses.id))
		.all();

	const parseBuilderConfig = () => {
		try {
			return existingPlan?.builderConfig ? JSON.parse(existingPlan.builderConfig) : {};
		} catch {
			return {};
		}
	};
	const cfg = parseBuilderConfig() as {
		planType?: 'daily' | 'weekly';
		targetCalories?: number;
		macros?: { c: number; p: number; f: number };
	};
	const cfgPlanType = cfg.planType === 'daily' || cfg.planType === 'weekly' ? cfg.planType : (existingPlan?.planType === 'daily' ? 'daily' : 'weekly');
	const cfgTargetCalories = Number.isFinite(cfg.targetCalories) ? Math.max(0, Math.round(cfg.targetCalories as number)) : 0;
	const cfgMacros = cfg.macros && typeof cfg.macros === 'object'
		? {
			c: Math.max(0, Math.min(100, Number((cfg.macros as any).c ?? 0) || 0)),
			p: Math.max(0, Math.min(100, Number((cfg.macros as any).p ?? 0) || 0)),
			f: Math.max(0, Math.min(100, Number((cfg.macros as any).f ?? 0) || 0))
		}
		: { c: 50, p: 25, f: 25 };

	const totals = { calories: 0, protein: 0, carbs: 0, fat: 0 };
	const mealTotals: Record<string, { calories: number; protein: number; carbs: number; fat: number }> = {};
	const ensureMealTotals = (mealType: string) => {
		if (!mealTotals[mealType]) mealTotals[mealType] = { calories: 0, protein: 0, carbs: 0, fat: 0 };
		return mealTotals[mealType];
	};
	const recipeById = new Map(recipesWithIngNames.map((r) => [r.recipe.id, r.recipe]));
	const supplementById = new Map(allSupplements.map((s) => [s.id, s]));
	const foodById = new Map(allFoods.map((f) => [f.id, f]));
	const toNum = (v: unknown) => {
		const n = Number(v);
		return Number.isFinite(n) ? Math.max(0, n) : 0;
	};
	for (const { meals: dayMeals } of existingMealDays) {
		for (const meal of dayMeals) {
			const mt = ensureMealTotals(meal.mealType);
			if (meal.recipeId) {
				const rec = recipeById.get(meal.recipeId);
				let n: unknown = null;
				if (rec?.nutrients) {
					try {
						n = JSON.parse(rec.nutrients);
					} catch {
						n = null;
					}
				}
				if (n && typeof n === 'object') {
					const calories = toNum((n as any).calories);
					const protein = toNum((n as any).protein);
					const carbs = toNum((n as any).carbs);
					const fat = toNum((n as any).fat);
					totals.calories += calories;
					totals.protein += protein;
					totals.carbs += carbs;
					totals.fat += fat;
					mt.calories += calories;
					mt.protein += protein;
					mt.carbs += carbs;
					mt.fat += fat;
				}
				continue;
			}
			if (meal.supplementId) {
				const supp = supplementById.get(meal.supplementId);
				if (supp) {
					const calories = toNum(supp.totalKcal);
					const protein = toNum(supp.protein);
					const carbs = toNum(supp.carbs);
					const fat = toNum(supp.fat);
					totals.calories += calories;
					totals.protein += protein;
					totals.carbs += carbs;
					totals.fat += fat;
					mt.calories += calories;
					mt.protein += protein;
					mt.carbs += carbs;
					mt.fat += fat;
				}
				continue;
			}
			if ((meal as any).foodItemId) {
				const food = foodById.get((meal as any).foodItemId);
				if (food) {
					const calories = toNum(food.calories);
					const protein = toNum(food.protein);
					const carbs = toNum(food.carbs);
					const fat = toNum(food.fat);
					totals.calories += calories;
					totals.protein += protein;
					totals.carbs += carbs;
					totals.fat += fat;
					mt.calories += calories;
					mt.protein += protein;
					mt.carbs += carbs;
					mt.fat += fat;
				}
			}
		}
	}

	const mealLabelMap: Record<string, string> = {
		breakfast: 'الإفطار',
		morning_snack: 'سناك صباحي',
		lunch: 'الغداء',
		afternoon_snack: 'سناك مسائي',
		dinner: 'العشاء',
		supplement: 'مكمل',
		other: 'أخرى'
	};
	const mealTypes = Array.from(new Set(existingMealDays.flatMap((d) => d.meals.map((m) => m.mealType))));
	const chartSnapshot = buildChartContract({
		planType: cfgPlanType,
		targetCalories: cfgTargetCalories,
		macros: cfgMacros,
		totals,
		mealTotals,
		mealLabelMap,
		mealTypes
	});

	return {
		session,
		patient,
		timelineAnchorBaseDate,
		timelineMinDate,
		timelineMaxDate,
		existingPlan: existingPlan ?? null,
		existingMealDays,
		recipes: recipesWithIngNames,
		supplements: allSupplements,
		foods: allFoods,
		foodCategories: allFoodCategories,
		patientDiagnoses: diagnosesList,
		chartSnapshot
	};
}

function getSessionForDietitian(sessionId: number, dietitianId: number) {
	return db
		.select()
		.from(mealPlanSessions)
		.where(and(eq(mealPlanSessions.id, sessionId), eq(mealPlanSessions.dietitianId, dietitianId)))
		.get();
}

export async function actionCreateDiagnosis(params: {
	sessionId: number;
	dietitianId: number;
	formData: FormData;
}): Promise<ActionFailure<{ error: string }> | { success: true; diagKey: string; name: string }> {
	const { sessionId, dietitianId, formData } = params;
	const session = getSessionForDietitian(sessionId, dietitianId);
	if (!session) return fail(404, { error: 'الجلسة غير موجودة' });

	const diagKey = formData.get('diagKey')?.toString().trim() ?? '';
	const name = formData.get('name')?.toString().trim() ?? '';
	const code = formData.get('code')?.toString().trim() ?? '';
	const severityRaw = formData.get('severity')?.toString().trim() ?? '';
	const diagnosedDateRaw = formData.get('diagnosedDate')?.toString().trim() ?? '';
	const statusRaw = formData.get('status')?.toString().trim() ?? '';
	const notes = formData.get('notes')?.toString().trim() ?? '';

	if (!diagKey || !name || !notes) {
		return fail(400, { error: 'يرجى إدخال اسم التشخيص والملاحظات' });
	}
	const severity = (['mild', 'moderate', 'severe'].includes(severityRaw) ? severityRaw : 'mild') as
		| 'mild'
		| 'moderate'
		| 'severe';
	const diagnosedDate =
		diagnosedDateRaw || new Date().toISOString().slice(0, 10);
	const status = (['active', 'resolved', 'managed'].includes(statusRaw) ? statusRaw : 'active') as
		| 'active'
		| 'resolved'
		| 'managed';

	db.insert(patientDiagnoses)
		.values({
			clientId: session.clientId,
			dietitianId,
			diagKey,
			name,
			code: code || null,
			severity: severity as 'mild' | 'moderate' | 'severe',
			diagnosedDate,
			status: status as 'active' | 'resolved' | 'managed',
			notes
		})
		.run();

	return { success: true, diagKey, name };
}

export async function actionUpdateDiagnosis(params: {
	sessionId: number;
	dietitianId: number;
	formData: FormData;
}): Promise<ActionFailure<{ error: string }> | { success: true; diagKey: string; name: string }> {
	const { sessionId, dietitianId, formData } = params;
	const session = getSessionForDietitian(sessionId, dietitianId);
	if (!session) return fail(404, { error: 'الجلسة غير موجودة' });

	const diagKey = formData.get('diagKey')?.toString().trim() ?? '';
	const name = formData.get('name')?.toString().trim() ?? '';
	const code = formData.get('code')?.toString().trim() ?? '';
	const severityRaw = formData.get('severity')?.toString().trim() ?? '';
	const diagnosedDateRaw = formData.get('diagnosedDate')?.toString().trim() ?? '';
	const statusRaw = formData.get('status')?.toString().trim() ?? '';
	const notes = formData.get('notes')?.toString().trim() ?? '';

	if (!diagKey || !name || !notes) {
		return fail(400, { error: 'يرجى إدخال اسم التشخيص والملاحظات' });
	}
	const severity = (['mild', 'moderate', 'severe'].includes(severityRaw) ? severityRaw : 'mild') as
		| 'mild'
		| 'moderate'
		| 'severe';
	const diagnosedDate =
		diagnosedDateRaw || new Date().toISOString().slice(0, 10);
	const status = (['active', 'resolved', 'managed'].includes(statusRaw) ? statusRaw : 'active') as
		| 'active'
		| 'resolved'
		| 'managed';

	db.update(patientDiagnoses)
		.set({
			name,
			code: code || null,
			severity: severity as 'mild' | 'moderate' | 'severe',
			diagnosedDate,
			status: status as 'active' | 'resolved' | 'managed',
			notes
		})
		.where(
			and(
				eq(patientDiagnoses.diagKey, diagKey),
				eq(patientDiagnoses.clientId, session.clientId),
				eq(patientDiagnoses.dietitianId, dietitianId)
			)
		)
		.run();

	return { success: true, diagKey, name };
}

export async function actionPublishPlan(params: {
	sessionId: number;
	dietitianId: number;
}): Promise<ActionFailure<{ error: string }> | { success: true }> {
	const { sessionId, dietitianId } = params;
	const session = getSessionForDietitian(sessionId, dietitianId);
	if (!session) return fail(404, { error: 'الجلسة غير موجودة' });

	// Verify there is at least one meal day before allowing publish
	const plan = db
		.select({ id: mealPlans.id })
		.from(mealPlans)
		.where(eq(mealPlans.sessionId, sessionId))
		.orderBy(desc(mealPlans.version))
		.limit(1)
		.get();

	if (!plan) return fail(400, { error: 'لا توجد خطة للنشر. أضف وجبات أولاً.' });

	const hasDays = db
		.select({ id: mealDays.id })
		.from(mealDays)
		.where(eq(mealDays.mealPlanId, plan.id))
		.limit(1)
		.get();

	if (!hasDays) return fail(400, { error: 'لا توجد وجبات في الخطة. أضف وجبات أولاً ثم انشر.' });

	db.transaction((tx) => {
		// Mark any other active session for this client-dietitian pair as completed
		tx.update(mealPlanSessions)
			.set({ status: 'completed' })
			.where(
				and(
					eq(mealPlanSessions.clientId, session.clientId),
					eq(mealPlanSessions.dietitianId, dietitianId),
					ne(mealPlanSessions.id, sessionId),
					eq(mealPlanSessions.status, 'active')
				)
			)
			.run();

		tx.update(mealPlanSessions)
			.set({ status: 'active' })
			.where(eq(mealPlanSessions.id, sessionId))
			.run();
	});

	return { success: true };
}

export async function actionSavePlan(params: {
	sessionId: number;
	dietitianId: number;
	formData: FormData;
}): Promise<ActionFailure<{ error: string }> | { success: true }> {
	const { sessionId, dietitianId, formData } = params;
	const session = getSessionForDietitian(sessionId, dietitianId);
	if (!session) return fail(404, { error: 'الجلسة غير موجودة' });

	const builderConfig = formData.get('builderConfig')?.toString() ?? '{}';
	const planGridRaw = formData.get('planGrid')?.toString() ?? '{}';
	const planType = (formData.get('planType')?.toString() ?? 'weekly') as 'daily' | 'weekly';
	const recommendation = formData.get('recommendation')?.toString() ?? '';
	const startDateInput = formData.get('startDate')?.toString() ?? '';

	let planGrid: Record<
		string,
		Record<
			string,
			{
				recipeId?: number;
				supplementId?: number;
				supplementVolumeMl?: number;
				supplementOverrides?: { calories?: number; protein?: number; carbs?: number; fat?: number };
				foodItemId?: number;
				aiMeal?: unknown;
			}
		>
	>;
	try {
		planGrid = JSON.parse(planGridRaw);
	} catch {
		return fail(400, { error: 'Invalid plan grid JSON' });
	}

	const today = new Date().toISOString().split('T')[0];

	const toLocalYmd = (d: Date) => {
		const y = d.getFullYear();
		const m = String(d.getMonth() + 1).padStart(2, '0');
		const day = String(d.getDate()).padStart(2, '0');
		return `${y}-${m}-${day}`;
	};

	const addDaysYmd = (ymd: string, n: number) => {
		const d = new Date(ymd + 'T00:00:00');
		d.setDate(d.getDate() + n);
		return toLocalYmd(d);
	};

	const slotHasContent = (s: {
		recipeId?: number;
		supplementId?: number;
		supplementVolumeMl?: number;
		supplementOverrides?: { calories?: number; protein?: number; carbs?: number; fat?: number };
		foodItemId?: number;
		aiMeal?: unknown;
	}) => !!(s.recipeId || s.supplementId || s.foodItemId || s.aiMeal);

	const ymdPattern = /^\d{4}-\d{2}-\d{2}$/;
	const fallbackAnchor = ymdPattern.test(startDateInput) ? startDateInput : today;

	const dayEntries = Object.entries(planGrid)
		.map(([rawKey, slots]) => {
			if (!slots) return null;
			const validSlots = Object.fromEntries(Object.entries(slots).filter(([, s]) => slotHasContent(s)));
			if (Object.keys(validSlots).length === 0) return null;

			if (ymdPattern.test(rawKey)) {
				const date = rawKey;
				const dayDate = new Date(date + 'T00:00:00');
				return { rawKey, slots: validSlots, date, dayOfWeek: dayDate.getDay() };
			}

			const idx = Number(rawKey);
			if (Number.isNaN(idx)) return null;

			const anchor = new Date(fallbackAnchor + 'T00:00:00');
			anchor.setDate(anchor.getDate() + idx);
			return { rawKey, slots: validSlots, date: toLocalYmd(anchor), dayOfWeek: anchor.getDay() };
		})
		.filter(
			(
				entry
			): entry is {
				rawKey: string;
				slots: Record<
					string,
					{
						recipeId?: number;
						supplementId?: number;
						supplementVolumeMl?: number;
						supplementOverrides?: { calories?: number; protein?: number; carbs?: number; fat?: number };
						foodItemId?: number;
						aiMeal?: unknown;
					}
				>;
				date: string;
				dayOfWeek: number;
			} => entry !== null
		)
		.sort((a, b) => a.date.localeCompare(b.date));

	const hasMeals = dayEntries.length > 0;

	let sessionStart: string;
	if (ymdPattern.test(startDateInput)) {
		sessionStart = startDateInput;
	} else if (dayEntries.length > 0) {
		sessionStart = dayEntries[0].date;
	} else {
		sessionStart = today;
	}

	const sessionEnd = planType === 'weekly' ? addDaysYmd(sessionStart, 6) : sessionStart;

	let persistedBuilderConfig = builderConfig;
	try {
		const parsed = JSON.parse(builderConfig);
		const base = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
		persistedBuilderConfig = JSON.stringify({
			...base,
			lastEditedAt: new Date().toISOString()
		});
	} catch {
		persistedBuilderConfig = JSON.stringify({ lastEditedAt: new Date().toISOString() });
	}

	try {
		db.transaction((tx) => {
			// When the grid is empty this is a config-only save (e.g. dietitian changed a
			// setting before meals were added or while the UI was still initialising).
			// Only update the metadata columns; never delete existing meal data.
			if (!hasMeals) {
				const existingPlan = tx
					.select({ id: mealPlans.id })
					.from(mealPlans)
					.where(eq(mealPlans.sessionId, sessionId))
					.orderBy(desc(mealPlans.version))
					.limit(1)
					.get();

				if (existingPlan) {
					// Patch config + recommendation on the existing plan row only
					tx.update(mealPlans)
						.set({ builderConfig: persistedBuilderConfig, recommendation, planType })
						.where(eq(mealPlans.id, existingPlan.id))
						.run();
				} else {
					// No plan exists yet – safe to insert an empty shell so config is persisted
					tx.insert(mealPlans)
						.values({ sessionId, planType, builderConfig: persistedBuilderConfig, recommendation })
						.run();
				}
				// Never mutate session status or dates on a config-only save
				return;
			}

			// Full save: persist draft edits for the dietitian only.
			// Publishing is a separate explicit action (publishPlan) that switches status to "active".
			tx.update(mealPlanSessions)
				.set({ startDate: sessionStart, endDate: sessionEnd, status: 'draft' })
				.where(eq(mealPlanSessions.id, sessionId))
				.run();

			const oldPlans = tx.select({ id: mealPlans.id }).from(mealPlans).where(eq(mealPlans.sessionId, sessionId)).all();

			for (const old of oldPlans) {
				tx.delete(mealPlans).where(eq(mealPlans.id, old.id)).run();
			}

			const newPlan = tx.insert(mealPlans)
				.values({ sessionId, planType, builderConfig: persistedBuilderConfig, recommendation })
				.run();

			const planId = Number(newPlan.lastInsertRowid);

			for (let sortOrder = 0; sortOrder < dayEntries.length; sortOrder++) {
				const { slots: daySlots, date, dayOfWeek } = dayEntries[sortOrder];

				const newDay = tx
					.insert(mealDays)
					.values({ mealPlanId: planId, dayOfWeek, date, sortOrder })
					.run();

				const dayId = Number(newDay.lastInsertRowid);
				let mealOrder = 0;

				for (const [mealType, slot] of Object.entries(daySlots)) {
					let aiJson: string | null = null;
					if (slot.aiMeal) {
						try {
							aiJson = JSON.stringify(slot.aiMeal);
						} catch {
							/* skip malformed */
						}
					}

					tx.insert(meals)
						.values({
							mealDayId: dayId,
							mealType: mealType as never,
							recipeId: slot.recipeId ?? null,
							supplementId: slot.supplementId ?? null,
							foodItemId: slot.foodItemId ?? null,
							aiMealJson: aiJson,
							sortOrder: mealOrder++
						} as typeof meals.$inferInsert)
						.run();
				}
			}
		});
	} catch (e) {
		console.error('[savePlan] transaction failed:', e);
		return fail(500, { error: 'Save failed' });
	}

	return { success: true };
}

export async function actionClearMeals(params: {
	sessionId: number;
	dietitianId: number;
	formData: FormData;
}): Promise<ActionFailure<{ error: string }> | { success: true }> {
	const { sessionId, dietitianId, formData } = params;
	const session = getSessionForDietitian(sessionId, dietitianId);
	if (!session) return fail(404, { error: 'الجلسة غير موجودة' });

	try {
		const dateRaw = formData.get('date')?.toString().trim() ?? '';
		const ymdPattern = /^\d{4}-\d{2}-\d{2}$/;
		const dateYmd = ymdPattern.test(dateRaw) ? dateRaw : null;

		db.transaction((tx) => {
			if (dateYmd) {
				const plans = tx
					.select({ id: mealPlans.id })
					.from(mealPlans)
					.where(eq(mealPlans.sessionId, sessionId))
					.all();
				for (const p of plans) {
					// Cascades delete meals for that day only.
					tx.delete(mealDays)
						.where(and(eq(mealDays.mealPlanId, p.id), eq(mealDays.date, dateYmd)))
						.run();
				}
				return;
			}

			// Delete the session's saved plan(s) only; cascades remove mealDays/meals/tracking.
			tx.delete(mealPlans).where(eq(mealPlans.sessionId, sessionId)).run();
			// If it was active, returning to draft avoids an "active session with empty plan".
			tx.update(mealPlanSessions).set({ status: 'draft' }).where(eq(mealPlanSessions.id, sessionId)).run();
		});
	} catch (e) {
		console.error('[clearMeals] transaction failed:', e);
		return fail(500, { error: 'Clear failed' });
	}

	return { success: true };
}
