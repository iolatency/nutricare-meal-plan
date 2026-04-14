import { db } from '$lib/server/db';
import {
	users,
	mealPlans,
	mealDays,
	meals,
	mealTracking,
	dailyLogs,
	recipes,
	supplements,
	foodItems
} from '$lib/server/db/schema';
import { and, desc, eq, inArray } from 'drizzle-orm';

export function loadPatientDashboard(sessionId: number, session: { clientId: number }) {
	const patient = db
		.select({ id: users.id, name: users.name })
		.from(users)
		.where(eq(users.id, session.clientId))
		.get();
	if (!patient) return null;

	const plan = db
		.select()
		.from(mealPlans)
		.where(eq(mealPlans.sessionId, sessionId))
		.orderBy(desc(mealPlans.version))
		.limit(1)
		.get();

	if (!plan) {
		return {
			patient,
			plan: null,
			todayMeals: [],
			todayLog: null,
			weekDates: [],
			builderConfig: null,
			recommendation: null
		};
	}

	const today = new Date().toISOString().split('T')[0];
	const allDays = db.select().from(mealDays).where(eq(mealDays.mealPlanId, plan.id)).all();
	const todayDay = allDays.find((day) => day.date === today);

	let todayMeals: Array<{
		meal: typeof meals.$inferSelect;
		recipeName: string | null;
		recipeImageUrl: string | null;
		supplementName: string | null;
		foodName: string | null;
		calories: number;
		protein: number;
		carbs: number;
		fat: number;
		status: string | null;
	}> = [];

	if (todayDay) {
		const dayMeals = db
			.select()
			.from(meals)
			.where(eq(meals.mealDayId, todayDay.id))
			.orderBy(meals.sortOrder)
			.all();

		const trackingRows = db
			.select()
			.from(mealTracking)
			.where(and(eq(mealTracking.sessionId, sessionId), eq(mealTracking.date, today)))
			.all();
		const statusMap = new Map(trackingRows.map((row) => [row.mealId, row.status]));

		const recipeIds = dayMeals.filter((m) => m.recipeId).map((m) => m.recipeId!);
		const supplementIds = dayMeals.filter((m) => m.supplementId).map((m) => m.supplementId!);
		const foodIds = dayMeals.filter((m) => m.foodItemId).map((m) => m.foodItemId!);

		const recipesMap = recipeIds.length
			? new Map(
					db
						.select()
						.from(recipes)
						.where(inArray(recipes.id, recipeIds))
						.all()
						.map((recipe) => [recipe.id, recipe])
				)
			: new Map<number, typeof recipes.$inferSelect>();

		const supplementsMap = supplementIds.length
			? new Map(
					db
						.select()
						.from(supplements)
						.where(inArray(supplements.id, supplementIds))
						.all()
						.map((supplement) => [supplement.id, supplement])
				)
			: new Map<number, typeof supplements.$inferSelect>();

		const foodsMap = foodIds.length
			? new Map(
					db
						.select()
						.from(foodItems)
						.where(inArray(foodItems.id, foodIds))
						.all()
						.map((food) => [food.id, food])
				)
			: new Map<number, typeof foodItems.$inferSelect>();

		todayMeals = dayMeals.map((meal) => {
			let recipeName: string | null = null;
			let recipeImageUrl: string | null = null;
			let supplementName: string | null = null;
			let foodName: string | null = null;
			let calories = 0;
			let protein = 0;
			let carbs = 0;
			let fat = 0;

			if (meal.recipeId) {
				const recipe = recipesMap.get(meal.recipeId);
				if (recipe) {
					recipeName = recipe.nameAr ?? recipe.name;
					recipeImageUrl = recipe.imageUrl ?? null;
					try {
						const nutrients = JSON.parse(recipe.nutrients ?? '{}');
						calories = nutrients.calories ?? 0;
						protein = nutrients.protein ?? 0;
						carbs = nutrients.carbs ?? 0;
						fat = nutrients.fat ?? 0;
					} catch {
						// ignore malformed nutrients blob
					}
				}
			} else if (meal.supplementId) {
				const supplement = supplementsMap.get(meal.supplementId);
				if (supplement) {
					supplementName = supplement.name;
					calories = supplement.totalKcal ?? 0;
					protein = supplement.protein ?? 0;
					carbs = supplement.carbs ?? 0;
					fat = supplement.fat ?? 0;
				}
			} else if (meal.foodItemId) {
				const food = foodsMap.get(meal.foodItemId);
				if (food) {
					foodName = food.nameAr ?? food.name;
					calories = food.calories ?? 0;
					protein = food.protein ?? 0;
					carbs = food.carbs ?? 0;
					fat = food.fat ?? 0;
				}
			}

			return {
				meal,
				recipeName,
				recipeImageUrl,
				supplementName,
				foodName,
				calories,
				protein,
				carbs,
				fat,
				status: statusMap.get(meal.id) ?? null
			};
		});
	}

	const todayLog =
		db
			.select()
			.from(dailyLogs)
			.where(and(eq(dailyLogs.sessionId, sessionId), eq(dailyLogs.date, today)))
			.get() ?? null;

	const weekDates: string[] = [];
	const todayDate = new Date(today + 'T00:00:00');
	const dayOfWeek = todayDate.getDay();
	const sundayDate = new Date(todayDate);
	sundayDate.setDate(sundayDate.getDate() - dayOfWeek);
	for (let i = 0; i < 7; i++) {
		const date = new Date(sundayDate);
		date.setDate(date.getDate() + i);
		weekDates.push(date.toISOString().split('T')[0]);
	}

	let builderConfig = null;
	try {
		builderConfig = plan.builderConfig ? JSON.parse(plan.builderConfig) : null;
	} catch {
		builderConfig = null;
	}

	return {
		patient,
		plan,
		todayMeals,
		todayLog,
		weekDates,
		today,
		builderConfig,
		recommendation: plan.recommendation
	};
}

export function setMealStatus(sessionId: number, mealId: number, status: 'eaten' | 'skipped' | 'not_eaten', date: string) {
	const existing = db
		.select()
		.from(mealTracking)
		.where(
			and(eq(mealTracking.sessionId, sessionId), eq(mealTracking.mealId, mealId), eq(mealTracking.date, date))
		)
		.get();

	if (existing) {
		db.update(mealTracking).set({ status }).where(eq(mealTracking.id, existing.id)).run();
		return;
	}

	db.insert(mealTracking).values({ sessionId, mealId, date, status }).run();
}

export function setDailyWater(sessionId: number, clientId: number, cups: number, date: string) {
	const existing = db
		.select()
		.from(dailyLogs)
		.where(and(eq(dailyLogs.sessionId, sessionId), eq(dailyLogs.date, date)))
		.get();

	if (existing) {
		db.update(dailyLogs).set({ waterCups: cups }).where(eq(dailyLogs.id, existing.id)).run();
		return;
	}

	db.insert(dailyLogs).values({ sessionId, clientId, date, waterCups: cups }).run();
}

export function completeDay(sessionId: number, clientId: number, date: string) {
	const trackingRows = db
		.select()
		.from(mealTracking)
		.where(and(eq(mealTracking.sessionId, sessionId), eq(mealTracking.date, date)))
		.all();

	const total = trackingRows.length;
	const eaten = trackingRows.filter((tracking) => tracking.status === 'eaten').length;
	const adherence = total > 0 ? Math.round((eaten / total) * 100) : 0;

	const existing = db
		.select()
		.from(dailyLogs)
		.where(and(eq(dailyLogs.sessionId, sessionId), eq(dailyLogs.date, date)))
		.get();

	if (existing) {
		db.update(dailyLogs)
			.set({ completed: true, adherenceScore: adherence })
			.where(eq(dailyLogs.id, existing.id))
			.run();
	} else {
		db.insert(dailyLogs)
			.values({ sessionId, clientId, date, completed: true, adherenceScore: adherence })
			.run();
	}

	return adherence;
}
