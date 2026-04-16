import { db } from '$lib/server/db';
import { users, mealPlanSessions, mealPlans, mealDays, meals, mealTracking, dailyLogs } from '$lib/server/db/schema';
import { eq, and, inArray, gte, lte, desc, isNotNull, asc } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { effectivePlanDate, toLocalYmd, YMD_PATTERN } from '$lib/server/modules/meal-plan/plan-dates';

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

export async function loadMealPlanTrackingPage(params: {
	sessionId: number;
	dietitianId: number;
	planType: 'daily' | 'weekly';
	dateParam: string;
}) {
	const { sessionId, dietitianId, planType, dateParam } = params;
	const ymdPattern = YMD_PATTERN;
	let dateFrom = dateParam;
	let dateTo = dateFrom;

	const session = db
		.select()
		.from(mealPlanSessions)
		.where(and(eq(mealPlanSessions.id, sessionId), eq(mealPlanSessions.dietitianId, dietitianId)))
		.get();
	if (!session) error(404, 'الجلسة غير موجودة');

	const patient = db.select().from(users).where(eq(users.id, session.clientId)).get();
	if (!patient) error(404, 'العميل غير موجود');

	const today = toLocalYmd(new Date());
	const siblingSessions = db
		.select()
		.from(mealPlanSessions)
		.where(and(eq(mealPlanSessions.clientId, session.clientId), eq(mealPlanSessions.dietitianId, dietitianId)))
		.all();
	const datedSiblingSessions = siblingSessions
		.filter((s) => ymdPattern.test(s.startDate) && ymdPattern.test(s.endDate))
		.sort((a, b) => a.startDate.localeCompare(b.startDate));
	const timelineAnchorBaseDate = datedSiblingSessions[0]?.startDate ?? (ymdPattern.test(session.startDate) ? session.startDate : today);
	const timelineMinDate = datedSiblingSessions[0]?.startDate ?? timelineAnchorBaseDate;
	const timelineMaxDate = datedSiblingSessions.length
		? datedSiblingSessions.map((s) => s.endDate).sort().at(-1) ?? timelineAnchorBaseDate
		: (ymdPattern.test(session.endDate) ? session.endDate : timelineAnchorBaseDate);

	const minNavDate = timelineMinDate;
	const maxNavDate = timelineMaxDate;

	if (planType === 'daily') {
		dateFrom = clampYmd(dateParam, minNavDate, maxNavDate);
		dateTo = dateFrom;
	} else {
		const minAnchor = snapToSessionWindow(minNavDate, timelineAnchorBaseDate);
		const maxAnchor = snapToSessionWindow(maxNavDate, timelineAnchorBaseDate);
		const selectedAnchor = clampYmd(snapToSessionWindow(dateParam, timelineAnchorBaseDate), minAnchor, maxAnchor);
		dateFrom = selectedAnchor;
		dateTo = addDays(selectedAnchor, 6);
	}

	const overlappingSessions = datedSiblingSessions.filter((s) => s.startDate <= dateTo && s.endDate >= dateFrom);
	const overlappingSessionIds = overlappingSessions.map((s) => s.id);
	const sessionBaseById = new Map(
		overlappingSessions.map((s) => [s.id, ymdPattern.test(s.startDate) ? s.startDate : timelineAnchorBaseDate] as const)
	);

	const plansForRange = overlappingSessionIds.length
		? db
				.select({
					id: mealPlans.id,
					sessionId: mealPlans.sessionId,
					planType: mealPlans.planType,
					version: mealPlans.version
				})
				.from(mealPlans)
				.where(inArray(mealPlans.sessionId, overlappingSessionIds))
				.orderBy(desc(mealPlans.version))
				.all()
		: [];
	const latestPlanBySession = new Map<number, { id: number; sessionId: number; planType: 'daily' | 'weekly'; version: number }>();
	for (const planRow of plansForRange) {
		if (latestPlanBySession.has(planRow.sessionId)) continue;
		latestPlanBySession.set(planRow.sessionId, {
			id: planRow.id,
			sessionId: planRow.sessionId,
			planType: (planRow.planType === 'daily' ? 'daily' : 'weekly') as 'daily' | 'weekly',
			version: planRow.version
		});
	}
	const latestPlanRows = Array.from(latestPlanBySession.values());
	const latestPlanIds = latestPlanRows.map((p) => p.id);
	const planById = new Map(latestPlanRows.map((p) => [p.id, p] as const));

	if (latestPlanIds.length === 0) {
		return {
			session,
			patient,
			planType,
			dateFrom,
			dateTo,
			minNavDate,
			maxNavDate,
			navAnchorBaseDate: timelineAnchorBaseDate,
			trackingData: null
		};
	}

	const allDays = db
		.select()
		.from(mealDays)
		.where(inArray(mealDays.mealPlanId, latestPlanIds))
		.orderBy(mealDays.sortOrder)
		.all();
	const resolveDayDate = (day: typeof mealDays.$inferSelect) => {
		const planMeta = planById.get(day.mealPlanId);
		if (!planMeta) return timelineAnchorBaseDate;
		const baseDate = sessionBaseById.get(planMeta.sessionId) ?? timelineAnchorBaseDate;
		return effectivePlanDate(day, baseDate, planMeta.planType);
	};
	const daysInRange = allDays.filter((d) => {
		const effectiveDate = resolveDayDate(d);
		return effectiveDate >= dateFrom && effectiveDate <= dateTo;
	});
	const targetDays = daysInRange;

	const DAY_NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

	const MEAL_NAMES: Record<string, string> = {
		breakfast: 'الإفطار',
		morning_snack: 'وجبة خفيفة ص',
		lunch: 'الغداء',
		afternoon_snack: 'وجبة خفيفة م',
		dinner: 'العشاء',
		supplement: 'مكمل غذائي',
		other: 'أخرى'
	};

	const targetDayIds = targetDays.map((d) => d.id);
	const allMeals = targetDayIds.length
		? db.select().from(meals).where(inArray(meals.mealDayId, targetDayIds)).all()
		: [];

	const allMealIds = allMeals.map((m) => m.id);
	const allTracking = allMealIds.length
		? db
				.select()
				.from(mealTracking)
				.where(
					and(inArray(mealTracking.mealId, allMealIds), gte(mealTracking.date, dateFrom), lte(mealTracking.date, dateTo))
				)
				.all()
		: [];

	// Key by "mealId:date" so each (meal, day) combination resolves to exactly one row
	const trackingByMealDate = new Map<string, (typeof allTracking)[number]>();
	for (const entry of allTracking) {
		trackingByMealDate.set(`${entry.mealId}:${entry.date}`, entry);
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
	const mealSlots: Array<{
		date: string;
		mealId: number;
		mealType: string;
		mealLabel: string;
		status: 'eaten' | 'skipped' | 'not_eaten' | null;
		replacementNote: string | null;
		sortOrder: number;
	}> = [];
	let skippedWithoutReplacement = 0;
	const rangeDates =
		planType === 'weekly'
			? Array.from({ length: 7 }, (_, idx) => addDays(dateFrom, idx))
			: [dateFrom];
	const dayAggregate = new Map<string, { total: number; eaten: number; skipped: number; notEaten: number }>();
	for (const dateKey of rangeDates) {
		dayAggregate.set(dateKey, { total: 0, eaten: 0, skipped: 0, notEaten: 0 });
	}

	for (const day of targetDays) {
		const dayMeals = (mealsByDay.get(day.id) ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder);
		const effectiveDayDate = resolveDayDate(day);
		const aggregate = dayAggregate.get(effectiveDayDate);

		for (const meal of dayMeals) {
			totalMealSlots++;
			if (!mealTypeStats[meal.mealType]) {
				mealTypeStats[meal.mealType] = { total: 0, eaten: 0, skipped: 0, notEaten: 0 };
			}
			mealTypeStats[meal.mealType].total++;

			const latest = trackingByMealDate.get(`${meal.id}:${effectiveDayDate}`);
			if (aggregate) aggregate.total++;

			if (!latest) {
				notEaten++;
				mealTypeStats[meal.mealType].notEaten++;
				if (aggregate) aggregate.notEaten++;
			} else if (latest.status === 'eaten') {
				eaten++;
				mealTypeStats[meal.mealType].eaten++;
				if (aggregate) aggregate.eaten++;
			} else if (latest.status === 'skipped') {
				skipped++;
				mealTypeStats[meal.mealType].skipped++;
				if (aggregate) aggregate.skipped++;
				if (latest.replacementNote) {
					withReplacement++;
					replacementNotes.push({ date: latest.date, mealType: meal.mealType, note: latest.replacementNote });
				} else {
					skippedWithoutReplacement++;
				}
			} else {
				notEaten++;
				mealTypeStats[meal.mealType].notEaten++;
				if (aggregate) aggregate.notEaten++;
			}

			const st = latest?.status ?? null;
			const normalizedStatus =
				st === 'eaten' || st === 'skipped' || st === 'not_eaten' ? st : null;
			mealSlots.push({
				date: effectiveDayDate,
				mealId: meal.id,
				mealType: meal.mealType,
				mealLabel: MEAL_NAMES[meal.mealType] ?? meal.mealType,
				status: normalizedStatus,
				replacementNote: latest?.replacementNote ?? null,
				sortOrder: meal.sortOrder
			});
		}
	}

	for (const dateKey of rangeDates) {
		const effectiveDay = new Date(dateKey + 'T00:00:00').getDay();
		const label = DAY_NAMES[effectiveDay] ?? dateKey;
		const aggregate = dayAggregate.get(dateKey) ?? { total: 0, eaten: 0, skipped: 0, notEaten: 0 };
		dayStats.push({
			date: dateKey,
			label,
			total: aggregate.total,
			eaten: aggregate.eaten,
			skipped: aggregate.skipped,
			notEaten: aggregate.notEaten
		});
	}

	// Water tracking — aggregate daily_logs for the date range
	const waterRows = db
		.select({ date: dailyLogs.date, waterCups: dailyLogs.waterCups })
		.from(dailyLogs)
		.where(
			and(
				inArray(dailyLogs.sessionId, overlappingSessionIds),
				gte(dailyLogs.date, dateFrom),
				lte(dailyLogs.date, dateTo)
			)
		)
		.all();

	const totalWaterCups = waterRows.reduce((sum, r) => sum + (r.waterCups ?? 0), 0);
	const avgWaterCups =
		waterRows.length > 0 ? Math.round((totalWaterCups / waterRows.length) * 10) / 10 : 0;
	const waterByDay: Record<string, number> = {};
	for (const row of waterRows) {
		waterByDay[row.date] = row.waterCups ?? 0;
	}

	// Weight history — only entries inside the currently selected period
	// so daily/weekly mode reflects the active range.
	const weightHistory: Array<{ date: string; weight: number }> = db
		.select({ date: dailyLogs.date, weight: dailyLogs.weight })
		.from(dailyLogs)
		.where(
			and(
				inArray(dailyLogs.sessionId, overlappingSessionIds),
				isNotNull(dailyLogs.weight),
				gte(dailyLogs.date, dateFrom),
				lte(dailyLogs.date, dateTo)
			)
		)
		.orderBy(dailyLogs.date)
		.all() as Array<{ date: string; weight: number }>;

	// Full weight history — all records across all patient sessions from the very first,
	// independent of the current week navigation.
	const allSiblingIds = siblingSessions.map((s) => s.id);
	const allWeightHistory: Array<{ date: string; weight: number }> = allSiblingIds.length
		? (db
				.select({ date: dailyLogs.date, weight: dailyLogs.weight })
				.from(dailyLogs)
				.where(
					and(
						inArray(dailyLogs.sessionId, allSiblingIds),
						isNotNull(dailyLogs.weight)
					)
				)
				.orderBy(dailyLogs.date)
				.all() as Array<{ date: string; weight: number }>)
		: [];

	const trackingData = {
		totalMealSlots,
		eaten,
		skipped,
		notEaten,
		withReplacement,
		skippedWithoutReplacement,
		adherenceRate: totalMealSlots > 0 ? Math.round((eaten / totalMealSlots) * 100) : 0,
		mealTypeStats,
		dayStats,
		replacementNotes,
		mealSlots,
		MEAL_NAMES,
		totalWaterCups,
		avgWaterCups,
		waterByDay,
		weightHistory,
		allWeightHistory
	};

	return {
		session,
		patient,
		planType,
		dateFrom,
		dateTo,
		minNavDate,
		maxNavDate,
		navAnchorBaseDate: timelineAnchorBaseDate,
		trackingData
	};
}
