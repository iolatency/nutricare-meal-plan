import { db } from '$lib/server/db';
import { users, mealPlanSessions, mealPlans, mealDays, meals, mealTracking } from '$lib/server/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { error } from '@sveltejs/kit';

function toLocalYmd(d: Date) {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${y}-${m}-${day}`;
}

function snapToSunday(dateStr: string) {
	const d = new Date(dateStr + 'T00:00:00');
	const dow = d.getDay();
	d.setDate(d.getDate() - dow);
	return toLocalYmd(d);
}

export async function loadMealPlanTrackingPage(params: {
	sessionId: number;
	dietitianId: number;
	planType: 'daily' | 'weekly';
	dateParam: string;
}) {
	const { sessionId, dietitianId, planType, dateParam } = params;

	let dateFrom: string;
	let dateTo: string;
	if (planType === 'daily') {
		dateFrom = dateParam;
		dateTo = dateParam;
	} else {
		dateFrom = snapToSunday(dateParam);
		const end = new Date(dateFrom + 'T00:00:00');
		end.setDate(end.getDate() + 6);
		dateTo = toLocalYmd(end);
	}

	const session = db
		.select()
		.from(mealPlanSessions)
		.where(and(eq(mealPlanSessions.id, sessionId), eq(mealPlanSessions.dietitianId, dietitianId)))
		.get();
	if (!session) error(404, 'الجلسة غير موجودة');

	const patient = db.select().from(users).where(eq(users.id, session.clientId)).get();
	if (!patient) error(404, 'العميل غير موجود');

	const plan = db.select().from(mealPlans).where(eq(mealPlans.sessionId, sessionId)).get();
	if (!plan) return { session, patient, planType, dateFrom, dateTo, trackingData: null };

	const allDays = db
		.select()
		.from(mealDays)
		.where(eq(mealDays.mealPlanId, plan.id))
		.orderBy(mealDays.sortOrder)
		.all();

	const ymdPattern = /^\d{4}-\d{2}-\d{2}$/;
	const resolveDayDate = (day: typeof mealDays.$inferSelect) => {
		if (day.date && ymdPattern.test(day.date)) return day.date;

		const base = new Date(dateFrom + 'T00:00:00');
		const offset =
			planType === 'weekly' ? (day.dayOfWeek ?? day.sortOrder ?? 0) : (day.sortOrder ?? day.dayOfWeek ?? 0);
		base.setDate(base.getDate() + offset);
		return toLocalYmd(base);
	};

	const daysInRange = allDays.filter((d) => {
		const effectiveDate = resolveDayDate(d);
		return effectiveDate >= dateFrom && effectiveDate <= dateTo;
	});

	const targetDays =
		daysInRange.length > 0 ? daysInRange : planType === 'daily' ? allDays.slice(0, 1) : allDays;

	const DAY_NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

	const MEAL_NAMES: Record<string, string> = {
		breakfast: 'الإفطار',
		morning_snack: 'وجبة خفيفة ص',
		lunch: 'الغداء',
		afternoon_snack: 'وجبة خفيفة م',
		dinner: 'العشاء',
		other: 'أخرى'
	};

	const targetDayIds = targetDays.map((d) => d.id);
	const allMeals = targetDayIds.length
		? db.select().from(meals).where(inArray(meals.mealDayId, targetDayIds)).all()
		: [];

	const allMealIds = allMeals.map((m) => m.id);
	const allTracking = allMealIds.length
		? db.select().from(mealTracking).where(inArray(mealTracking.mealId, allMealIds)).all()
		: [];

	const trackingByMeal = new Map<number, (typeof allTracking)[number]>();
	for (const entry of allTracking) {
		trackingByMeal.set(entry.mealId, entry);
	}

	const mealsByDay = new Map<number, typeof allMeals>();
	for (const meal of allMeals) {
		const arr = mealsByDay.get(meal.mealDayId) ?? [];
		arr.push(meal);
		mealsByDay.set(meal.mealDayId, arr);
	}

	let totalMealSlots = 0;
	let eaten = 0;
	let skipped = 0;
	let notEaten = 0;
	let withReplacement = 0;

	const mealTypeStats: Record<string, { total: number; eaten: number; skipped: number; notEaten: number }> = {};
	const dayStats: Array<{
		date: string | null;
		label: string;
		total: number;
		eaten: number;
		skipped: number;
		notEaten: number;
	}> = [];
	const replacementNotes: Array<{ date: string; mealType: string; note: string }> = [];

	for (const day of targetDays) {
		const dayMeals = mealsByDay.get(day.id) ?? [];

		let dayEaten = 0,
			daySkipped = 0,
			dayNotEaten = 0;

		for (const meal of dayMeals) {
			totalMealSlots++;
			if (!mealTypeStats[meal.mealType]) {
				mealTypeStats[meal.mealType] = { total: 0, eaten: 0, skipped: 0, notEaten: 0 };
			}
			mealTypeStats[meal.mealType].total++;

			const latest = trackingByMeal.get(meal.id);

			if (!latest) {
				dayNotEaten++;
				notEaten++;
				mealTypeStats[meal.mealType].notEaten++;
			} else if (latest.status === 'eaten') {
				eaten++;
				dayEaten++;
				mealTypeStats[meal.mealType].eaten++;
			} else if (latest.status === 'skipped') {
				skipped++;
				daySkipped++;
				mealTypeStats[meal.mealType].skipped++;
				if (latest.replacementNote) {
					withReplacement++;
					replacementNotes.push({ date: latest.date, mealType: meal.mealType, note: latest.replacementNote });
				}
			} else {
				notEaten++;
				dayNotEaten++;
				mealTypeStats[meal.mealType].notEaten++;
			}
		}

		if (dayMeals.length > 0) {
			const effectiveDate = resolveDayDate(day);
			const effectiveDay = new Date(effectiveDate + 'T00:00:00').getDay();
			const label = DAY_NAMES[effectiveDay] ?? effectiveDate;
			dayStats.push({
				date: effectiveDate,
				label,
				total: dayMeals.length,
				eaten: dayEaten,
				skipped: daySkipped,
				notEaten: dayNotEaten
			});
		}
	}

	const trackingData = {
		totalMealSlots,
		eaten,
		skipped,
		notEaten,
		withReplacement,
		adherenceRate: totalMealSlots > 0 ? Math.round((eaten / totalMealSlots) * 100) : 0,
		mealTypeStats,
		dayStats,
		replacementNotes,
		MEAL_NAMES
	};

	return { session, patient, planType, dateFrom, dateTo, trackingData };
}
