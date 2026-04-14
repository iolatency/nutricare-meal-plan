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

export async function loadMealPlanBuilderPage(params: { sessionId: number; dietitianId: number }) {
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
			? db
					.select()
					.from(meals)
					.where(inArray(meals.mealDayId, dayIds))
					.orderBy(meals.sortOrder)
					.all()
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
					unit: recipeIngredients.unit
				})
				.from(recipeIngredients)
				.leftJoin(foodItems, eq(recipeIngredients.foodItemId, foodItems.id))
				.where(inArray(recipeIngredients.recipeId, recipeIds))
				.all()
		: [];

	const ingredientsByRecipe = new Map<number, string[]>();
	const ingredientDetailsByRecipe = new Map<
		number,
		Array<{ name: string; quantity: number; unit: string }>
	>();
	for (const ing of allIngredients) {
		const names = ingredientsByRecipe.get(ing.recipeId) ?? [];
		const details = ingredientDetailsByRecipe.get(ing.recipeId) ?? [];
		const name = ing.foodNameAr ?? ing.foodName ?? ing.customText ?? '';
		if (name) names.push(name);
		details.push({ name, quantity: ing.quantity, unit: ing.unit });
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

	return {
		session,
		patient,
		existingPlan: existingPlan ?? null,
		existingMealDays,
		recipes: recipesWithIngNames,
		supplements: allSupplements,
		foods: allFoods,
		foodCategories: allFoodCategories,
		patientDiagnoses: diagnosesList
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
	const severity = formData.get('severity')?.toString().trim() ?? '';
	const diagnosedDate = formData.get('diagnosedDate')?.toString().trim() ?? '';
	const status = formData.get('status')?.toString().trim() ?? '';
	const notes = formData.get('notes')?.toString().trim() ?? '';

	if (!diagKey || !name || !severity || !diagnosedDate || !status || !notes) {
		return fail(400, { error: 'يرجى تعبئة جميع الحقول المطلوبة' });
	}
	if (!['mild', 'moderate', 'severe'].includes(severity)) {
		return fail(400, { error: 'قيمة الشدة غير صالحة' });
	}
	if (!['active', 'resolved', 'managed'].includes(status)) {
		return fail(400, { error: 'قيمة الحالة غير صالحة' });
	}

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
	const severity = formData.get('severity')?.toString().trim() ?? '';
	const diagnosedDate = formData.get('diagnosedDate')?.toString().trim() ?? '';
	const status = formData.get('status')?.toString().trim() ?? '';
	const notes = formData.get('notes')?.toString().trim() ?? '';

	if (!diagKey || !name || !severity || !diagnosedDate || !status || !notes) {
		return fail(400, { error: 'يرجى تعبئة جميع الحقول المطلوبة' });
	}
	if (!['mild', 'moderate', 'severe'].includes(severity)) {
		return fail(400, { error: 'قيمة الشدة غير صالحة' });
	}
	if (!['active', 'resolved', 'managed'].includes(status)) {
		return fail(400, { error: 'قيمة الحالة غير صالحة' });
	}

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
			{ recipeId?: number; supplementId?: number; foodItemId?: number; aiMeal?: unknown }
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

	const snapToSundayYmd = (ymd: string) => {
		const d = new Date(ymd + 'T00:00:00');
		const day = d.getDay();
		d.setDate(d.getDate() - day);
		return toLocalYmd(d);
	};

	const slotHasContent = (s: {
		recipeId?: number;
		supplementId?: number;
		foodItemId?: number;
		aiMeal?: unknown;
	}) => !!(s.recipeId || s.supplementId || s.foodItemId || s.aiMeal);

	const ymdPattern = /^\d{4}-\d{2}-\d{2}$/;
	const fallbackAnchor = ymdPattern.test(startDateInput) ? startDateInput : today;

	const dayEntries = Object.entries(planGrid)
		.map(([rawKey, slots]) => {
			if (!slots) return null;
			const validSlots = Object.fromEntries(
				Object.entries(slots).filter(([, s]) => slotHasContent(s))
			);
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
					{ recipeId?: number; supplementId?: number; foodItemId?: number; aiMeal?: unknown }
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

	if (planType === 'weekly') {
		sessionStart = snapToSundayYmd(sessionStart);
	}

	const sessionEnd = planType === 'weekly' ? addDaysYmd(sessionStart, 6) : sessionStart;

	try {
		db.transaction((tx) => {
			if (hasMeals) {
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
			}

			tx.update(mealPlanSessions)
				.set({
					startDate: sessionStart,
					endDate: sessionEnd,
					...(hasMeals ? { status: 'active' } : {})
				})
				.where(eq(mealPlanSessions.id, sessionId))
				.run();

			const oldPlans = tx
				.select({ id: mealPlans.id })
				.from(mealPlans)
				.where(eq(mealPlans.sessionId, sessionId))
				.all();

			for (const old of oldPlans) {
				tx.delete(mealPlans).where(eq(mealPlans.id, old.id)).run();
			}

			const newPlan = tx
				.insert(mealPlans)
				.values({ sessionId, planType, builderConfig, recommendation })
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
