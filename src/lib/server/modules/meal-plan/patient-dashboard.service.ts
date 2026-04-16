import { db } from '$lib/server/db';
import {
	users,
	mealPlans,
	mealPlanSessions,
	mealDays,
	meals,
	mealTracking,
	dailyLogs,
	recipes,
	supplements,
	foodItems
} from '$lib/server/db/schema';
import { and, desc, eq, inArray, isNotNull } from 'drizzle-orm';
import { effectivePlanDate, toLocalYmd, YMD_PATTERN } from '$lib/server/modules/meal-plan/plan-dates';
import type { AiMealData } from '$lib/meal-plan/types';
import { syncAiMealData } from '$lib/meal-plan/ai-meal-sync';

function addDays(dateStr: string, days: number) {
	const d = new Date(dateStr + 'T00:00:00');
	d.setDate(d.getDate() + days);
	return toLocalYmd(d);
}

function snapToSessionWindow(dateStr: string, sessionStart: string) {
	const base = new Date(sessionStart + 'T00:00:00');
	const d = new Date(dateStr + 'T00:00:00');
	const diffDays = Math.floor((d.getTime() - base.getTime()) / 86400000);
	if (diffDays < 0) return sessionStart;
	const periodOffset = Math.floor(diffDays / 7) * 7;
	return addDays(sessionStart, periodOffset);
}

function clampYmd(dateStr: string, minDate: string, maxDate: string) {
	if (dateStr < minDate) return minDate;
	if (dateStr > maxDate) return maxDate;
	return dateStr;
}

export function loadPatientDashboard(sessionId: number, session: { clientId: number }, targetDate?: string) {
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
		const realToday = toLocalYmd(new Date());
		return {
			patient,
			plan: null,
			todayMeals: [],
			todayLog: null,
			weekDates: [],
			builderConfig: null,
			recommendation: null,
			today: realToday,
			realToday,
			minNavDate: realToday,
			maxNavDate: realToday,
			canGoPrevWeek: false,
			canGoNextWeek: false
		};
	}

	const realToday = toLocalYmd(new Date());
	const siblingSessions = db
		.select({ startDate: mealPlanSessions.startDate, endDate: mealPlanSessions.endDate })
		.from(mealPlanSessions)
		.where(eq(mealPlanSessions.clientId, session.clientId))
		.all();
	const datedSiblingSessions = siblingSessions
		.filter((s) => YMD_PATTERN.test(s.startDate) && YMD_PATTERN.test(s.endDate))
		.sort((a, b) => a.startDate.localeCompare(b.startDate));
	const timelineAnchorBaseDate = datedSiblingSessions[0]?.startDate ?? realToday;
	const minNavDate = datedSiblingSessions[0]?.startDate ?? realToday;
	const maxNavDate = datedSiblingSessions.length
		? datedSiblingSessions.map((s) => s.endDate).sort().at(-1) ?? realToday
		: realToday;
	const requestedDate = targetDate && YMD_PATTERN.test(targetDate) ? targetDate : realToday;
	const today = clampYmd(requestedDate, minNavDate, maxNavDate);
	const currentWeekAnchor = snapToSessionWindow(today, timelineAnchorBaseDate);
	const minWeekAnchor = snapToSessionWindow(minNavDate, timelineAnchorBaseDate);
	const maxWeekAnchor = snapToSessionWindow(maxNavDate, timelineAnchorBaseDate);
	const canGoPrevWeek = currentWeekAnchor > minWeekAnchor;
	const canGoNextWeek = currentWeekAnchor < maxWeekAnchor;
	const sessionMeta = db
		.select({ startDate: mealPlanSessions.startDate })
		.from(mealPlanSessions)
		.where(eq(mealPlanSessions.id, sessionId))
		.get();
	const planAnchor =
		YMD_PATTERN.test(sessionMeta?.startDate ?? '') ? (sessionMeta!.startDate as string) : realToday;
	const allDays = db.select().from(mealDays).where(eq(mealDays.mealPlanId, plan.id)).all();
	const planTypeForDates = plan.planType as 'daily' | 'weekly';
	const todayDay =
		allDays.find((day) => day.date === today) ??
		allDays.find((day) => effectivePlanDate(day, planAnchor, planTypeForDates) === today);
	// Track dates that have any tracking data (for the week strip dots)
	const trackedDates = new Set(
		db.select({ date: mealTracking.date }).from(mealTracking)
			.where(eq(mealTracking.sessionId, sessionId)).all().map((r) => r.date)
	);

	let todayMeals: Array<{
		meal: typeof meals.$inferSelect;
		recipeName: string | null;
		recipeImageUrl: string | null;
		supplementName: string | null;
		foodName: string | null;
		foodImageUrl: string | null;
		aiMealName: string | null;
		aiIngredients: Array<{ name_ar?: string; name?: string; quantity: number; unit: string; calories: number; protein: number; carbs: number; fat: number }> | null;
		steps: string | null;
		calories: number;
		protein: number;
		carbs: number;
		fat: number;
		status: string | null;
		replacementNote: string | null;
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
		const trackingMap = new Map(trackingRows.map((row) => [row.mealId, row]));

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
			let foodImageUrl: string | null = null;
			let aiMealName: string | null = null;
			let aiIngredients: Array<{ name_ar?: string; name?: string; quantity: number; unit: string; calories: number; protein: number; carbs: number; fat: number }> | null = null;
			let steps: string | null = null;
			let calories = 0;
			let protein = 0;
			let carbs = 0;
			let fat = 0;

			if (meal.recipeId) {
				const recipe = recipesMap.get(meal.recipeId);
				if (recipe) {
					recipeName = recipe.nameAr ?? recipe.name;
					recipeImageUrl = recipe.imageUrl ?? null;
					steps = recipe.steps ?? null;
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
					foodImageUrl = food.imageUrl ?? null;
					calories = food.calories ?? 0;
					protein = food.protein ?? 0;
					carbs = food.carbs ?? 0;
					fat = food.fat ?? 0;
				}
			} else if (meal.aiMealJson) {
				try {
					const ai = syncAiMealData(JSON.parse(meal.aiMealJson) as AiMealData);
					aiMealName = ai.name ?? null;
					aiIngredients = Array.isArray(ai.ingredients) ? ai.ingredients : null;
					steps = ai.steps ?? null;
					calories = ai.total?.calories ?? 0;
					protein = ai.total?.protein ?? 0;
					carbs = ai.total?.carbs ?? 0;
					fat = ai.total?.fat ?? 0;
				} catch {
					// ignore malformed ai_meal_json
				}
			}

			const tracking = trackingMap.get(meal.id);
			return {
				meal,
				recipeName,
				recipeImageUrl,
				supplementName,
				foodName,
				foodImageUrl,
				aiMealName,
				aiIngredients,
				steps,
				calories,
				protein,
				carbs,
				fat,
				status: tracking?.status ?? null,
				replacementNote: tracking?.replacementNote ?? null
			};
		});
	}

	const todayLog =
		db
			.select()
			.from(dailyLogs)
			.where(and(eq(dailyLogs.sessionId, sessionId), eq(dailyLogs.date, today)))
			.get() ?? null;

	// Build the 7-day week containing `today` (Sun–Sat)
	const weekDates: string[] = [];
	const todayDate = new Date(today + 'T00:00:00');
	const dayOfWeek = todayDate.getDay();
	const sundayDate = new Date(todayDate);
	sundayDate.setDate(sundayDate.getDate() - dayOfWeek);
	for (let i = 0; i < 7; i++) {
		const date = new Date(sundayDate);
		date.setDate(date.getDate() + i);
		weekDates.push(toLocalYmd(date));
	}

	// Dates that have a planned meal day in this session (for strip availability)
	const plannedDates = new Set(allDays.map((d) => d.date).filter(Boolean) as string[]);

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
		realToday,
		minNavDate,
		maxNavDate,
		canGoPrevWeek,
		canGoNextWeek,
		trackedDates: [...trackedDates],
		plannedDates: [...plannedDates],
		builderConfig,
		recommendation: plan.recommendation
	};
}

export function setMealStatus(
	sessionId: number,
	mealId: number,
	status: 'eaten' | 'skipped' | 'not_eaten',
	date: string,
	replacementNote?: string
) {
	const existing = db
		.select()
		.from(mealTracking)
		.where(
			and(eq(mealTracking.sessionId, sessionId), eq(mealTracking.mealId, mealId), eq(mealTracking.date, date))
		)
		.get();

	// Only persist a replacement note when the meal is skipped
	const noteToSave = status === 'skipped' && replacementNote ? replacementNote : null;

	if (existing) {
		db.update(mealTracking)
			.set({ status, replacementNote: noteToSave })
			.where(eq(mealTracking.id, existing.id))
			.run();
		return;
	}

	db.insert(mealTracking)
		.values({ sessionId, mealId, date, status, ...(noteToSave ? { replacementNote: noteToSave } : {}) })
		.run();
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

export function logWeight(sessionId: number, clientId: number, weight: number, date: string) {
	const existing = db
		.select()
		.from(dailyLogs)
		.where(and(eq(dailyLogs.sessionId, sessionId), eq(dailyLogs.date, date)))
		.get();

	if (existing) {
		db.update(dailyLogs).set({ weight }).where(eq(dailyLogs.id, existing.id)).run();
		return;
	}

	db.insert(dailyLogs).values({ sessionId, clientId, date, waterCups: 0, weight }).run();
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

export function loadHomePage(clientId: number) {
	const patient = db
		.select({ id: users.id, name: users.name, email: users.email })
		.from(users)
		.where(eq(users.id, clientId))
		.get();
	if (!patient) return null;

	const session = db
		.select()
		.from(mealPlanSessions)
		.where(eq(mealPlanSessions.clientId, clientId))
		.orderBy(desc(mealPlanSessions.id))
		.limit(1)
		.get() ?? null;

	let builderConfig: Record<string, unknown> | null = null;
	if (session) {
		const plan = db
			.select({ builderConfig: mealPlans.builderConfig })
			.from(mealPlans)
			.where(eq(mealPlans.sessionId, session.id))
			.orderBy(desc(mealPlans.version))
			.limit(1)
			.get();

		if (plan?.builderConfig) {
			try {
				builderConfig = JSON.parse(plan.builderConfig);
			} catch {
				// ignore
			}
		}
	}

	// Per-day planned nutrition from meals
	const dailyNutrition: Array<{ date: string; calories: number; protein: number; carbs: number; fat: number }> = [];
	if (session) {
		const plan = db
			.select({ id: mealPlans.id })
			.from(mealPlans)
			.where(eq(mealPlans.sessionId, session.id))
			.orderBy(desc(mealPlans.version))
			.limit(1)
			.get();

		if (plan) {
			const allDays = db.select().from(mealDays).where(eq(mealDays.mealPlanId, plan.id)).all();
			const dayIds = allDays.map((d) => d.id);

			if (dayIds.length > 0) {
				const allMeals = db.select().from(meals).where(inArray(meals.mealDayId, dayIds)).all();

				const recipeIds = [...new Set(allMeals.filter((m) => m.recipeId).map((m) => m.recipeId!))];
				const supplementIds = [...new Set(allMeals.filter((m) => m.supplementId).map((m) => m.supplementId!))];
				const foodIds = [...new Set(allMeals.filter((m) => m.foodItemId).map((m) => m.foodItemId!))];

				const recipesMap = recipeIds.length
					? new Map(db.select().from(recipes).where(inArray(recipes.id, recipeIds)).all().map((r) => [r.id, r]))
					: new Map<number, typeof recipes.$inferSelect>();
				const supplementsMap = supplementIds.length
					? new Map(db.select().from(supplements).where(inArray(supplements.id, supplementIds)).all().map((s) => [s.id, s]))
					: new Map<number, typeof supplements.$inferSelect>();
				const foodsMap = foodIds.length
					? new Map(db.select().from(foodItems).where(inArray(foodItems.id, foodIds)).all().map((f) => [f.id, f]))
					: new Map<number, typeof foodItems.$inferSelect>();

				const mealsByDay = new Map<number, typeof allMeals>();
				for (const m of allMeals) {
					const arr = mealsByDay.get(m.mealDayId) ?? [];
					arr.push(m);
					mealsByDay.set(m.mealDayId, arr);
				}

				for (const day of allDays) {
					if (!day.date) continue;
					const dayMeals = mealsByDay.get(day.id) ?? [];
					let cal = 0, prot = 0, carb = 0, ft = 0;

					for (const meal of dayMeals) {
						if (meal.recipeId) {
							const r = recipesMap.get(meal.recipeId);
							if (r) {
								try {
									const n = JSON.parse(r.nutrients ?? '{}');
									cal += n.calories ?? 0; prot += n.protein ?? 0; carb += n.carbs ?? 0; ft += n.fat ?? 0;
								} catch { /* skip */ }
							}
						} else if (meal.supplementId) {
							const s = supplementsMap.get(meal.supplementId);
							if (s) { cal += s.totalKcal ?? 0; prot += s.protein ?? 0; carb += s.carbs ?? 0; ft += s.fat ?? 0; }
						} else if (meal.foodItemId) {
							const f = foodsMap.get(meal.foodItemId);
							if (f) { cal += f.calories ?? 0; prot += f.protein ?? 0; carb += f.carbs ?? 0; ft += f.fat ?? 0; }
						} else if (meal.aiMealJson) {
							try {
								const ai = syncAiMealData(JSON.parse(meal.aiMealJson) as AiMealData);
								cal += ai.total?.calories ?? 0; prot += ai.total?.protein ?? 0; carb += ai.total?.carbs ?? 0; ft += ai.total?.fat ?? 0;
							} catch { /* skip */ }
						}
					}

					dailyNutrition.push({ date: day.date, calories: Math.round(cal), protein: Math.round(prot), carbs: Math.round(carb), fat: Math.round(ft) });
				}
			}
		}
	}

	const weightLogs: Array<{ date: string; weight: number }> = session
		? (db
				.select({ date: dailyLogs.date, weight: dailyLogs.weight })
				.from(dailyLogs)
				.where(and(eq(dailyLogs.sessionId, session.id), isNotNull(dailyLogs.weight)))
				.orderBy(dailyLogs.date)
				.all() as Array<{ date: string; weight: number }>)
		: [];

	const today = toLocalYmd(new Date());
	const todayLog = session
		? (db
				.select()
				.from(dailyLogs)
				.where(and(eq(dailyLogs.sessionId, session.id), eq(dailyLogs.date, today)))
				.get() ?? null)
		: null;

	// --- Analytics data ---
	const allLogs = session
		? db
				.select({
					date: dailyLogs.date,
					waterCups: dailyLogs.waterCups,
					adherenceScore: dailyLogs.adherenceScore,
					completed: dailyLogs.completed
				})
				.from(dailyLogs)
				.where(eq(dailyLogs.sessionId, session.id))
				.orderBy(dailyLogs.date)
				.all()
		: [];

	// Last 7 days of adherence scores
	const last7Dates: string[] = [];
	for (let i = 6; i >= 0; i--) {
		const d = new Date(today + 'T00:00:00');
		d.setDate(d.getDate() - i);
		last7Dates.push(toLocalYmd(d));
	}
	const logsByDate = new Map(allLogs.map((l) => [l.date, l]));

	const AR_DAY_SHORT = ['أحد', 'اثن', 'ثلا', 'أرب', 'خمي', 'جمع', 'سبت'];
	const weeklyAdherence: Array<{ date: string; label: string; score: number | null }> = last7Dates.map((d) => {
		const log = logsByDate.get(d);
		const dayOfWeek = new Date(d + 'T00:00:00').getDay();
		return { date: d, label: AR_DAY_SHORT[dayOfWeek], score: log?.adherenceScore ?? null };
	});

	const waterHistory: Array<{ date: string; label: string; cups: number }> = last7Dates.map((d) => {
		const log = logsByDate.get(d);
		const dayOfWeek = new Date(d + 'T00:00:00').getDay();
		return { date: d, label: AR_DAY_SHORT[dayOfWeek], cups: log?.waterCups ?? 0 };
	});

	let streakDays = 0;
	const sortedDates = allLogs
		.filter((l) => l.completed)
		.map((l) => l.date)
		.sort()
		.reverse();
	if (sortedDates.length > 0) {
		// Start from today; if today isn't completed, try yesterday
		let checkDate = today;
		if (sortedDates[0] !== today) {
			const yesterday = new Date(today + 'T00:00:00');
			yesterday.setDate(yesterday.getDate() - 1);
			checkDate = toLocalYmd(yesterday);
		}
		for (const d of sortedDates) {
			if (d === checkDate) {
				streakDays++;
				const prev = new Date(checkDate + 'T00:00:00');
				prev.setDate(prev.getDate() - 1);
				checkDate = toLocalYmd(prev);
			} else if (d < checkDate) {
				break;
			}
		}
	}

	const totalCompletedDays = allLogs.filter((l) => l.completed).length;
	const scoredLogs = allLogs.filter((l) => l.adherenceScore != null);
	const avgAdherence = scoredLogs.length > 0
		? Math.round(scoredLogs.reduce((sum, l) => sum + (l.adherenceScore ?? 0), 0) / scoredLogs.length)
		: null;

	const logDates = [...new Set(allLogs.map((l) => l.date))].sort();

	return {
		patient, session, builderConfig, weightLogs, todayLog, today,
		weeklyAdherence, waterHistory, streakDays, totalCompletedDays, avgAdherence,
		logDates,
		allLogs,
		dailyNutrition
	};
}
