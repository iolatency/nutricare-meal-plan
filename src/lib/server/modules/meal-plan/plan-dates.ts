import { toLocalYmd as toLocalYmdImpl } from '$lib/date/local-ymd';

export const toLocalYmd = toLocalYmdImpl;

export const YMD_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Calendar date for a plan row: uses `meal_days.date` when set, otherwise
 * derives from session anchor + dayOfWeek/sortOrder (must match tracking aggregation).
 */
export function effectivePlanDate(
	day: { date: string | null; dayOfWeek: number | null; sortOrder: number },
	fallbackBaseDate: string,
	planType: 'daily' | 'weekly'
): string {
	if (day.date && YMD_PATTERN.test(day.date)) return day.date;

	const base = new Date(fallbackBaseDate + 'T00:00:00');
	const offset =
		planType === 'weekly' ? (day.dayOfWeek ?? day.sortOrder ?? 0) : (day.sortOrder ?? day.dayOfWeek ?? 0);
	base.setDate(base.getDate() + offset);
	return toLocalYmd(base);
}
