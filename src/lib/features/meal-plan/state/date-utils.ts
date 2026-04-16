/** Local YYYY-MM-DD (avoid UTC day shifts). */
export function toLocalYmd(d: Date): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${y}-${m}-${day}`;
}

export function todayStr(): string {
	return toLocalYmd(new Date());
}

/** Snap any date string to the previous (or same) Sunday */
export function snapToSunday(dateStr: string): string {
	const d = new Date(dateStr + 'T00:00:00');
	const day = d.getDay();
	d.setDate(d.getDate() - day);
	return toLocalYmd(d);
}

/**
 * Snaps a date to the start of the subscription period it falls into.
 * Periods are 7-day windows aligned to `periodStart`.
 * Dates before `periodStart` return `periodStart`.
 */
export function snapToSubscriptionPeriod(dateStr: string, periodStart: string): string {
	const date = new Date(dateStr + 'T00:00:00');
	const start = new Date(periodStart + 'T00:00:00');
	const diffMs = date.getTime() - start.getTime();
	if (diffMs < 0) return periodStart;
	const daysDiff = Math.floor(diffMs / 86400000);
	const periodOffset = Math.floor(daysDiff / 7) * 7;
	const anchor = new Date(start.getTime() + periodOffset * 86400000);
	return toLocalYmd(anchor);
}
