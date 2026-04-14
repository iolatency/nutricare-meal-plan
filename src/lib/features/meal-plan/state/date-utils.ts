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
