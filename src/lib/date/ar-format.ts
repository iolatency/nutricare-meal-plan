import { DAYS_W } from '$lib/meal-plan/constants';

function ymdToDate(ymd: string): Date {
	// Expect YYYY-MM-DD in local time context.
	return new Date(ymd + 'T00:00:00');
}

function arLocale(): string {
	// Prefer Arabic-Indic digits when supported.
	// (If the runtime ignores the unicode extension, it still stays Arabic language.)
	return 'ar-EG-u-nu-arab';
}

export function formatArFullDate(d: Date): string {
	return new Intl.DateTimeFormat(arLocale(), {
		weekday: 'long',
		year: 'numeric',
		month: 'long',
		day: 'numeric'
	}).format(d);
}

export function formatArWeekdayName(ymd: string): string {
	const d = ymdToDate(ymd);
	return DAYS_W[d.getDay()] ?? '';
}

export function formatArDayMonthYear(ymd: string): string {
	const d = ymdToDate(ymd);
	const monthYear = new Intl.DateTimeFormat(arLocale(), { month: 'long', year: 'numeric' }).format(d);
	return `${d.getDate()} ${monthYear}`;
}

export function formatArDayMonth(ymd: string): string {
	const d = ymdToDate(ymd);
	return new Intl.DateTimeFormat(arLocale(), { day: 'numeric', month: 'short' }).format(d);
}

export function formatArRange(fromYmd: string, toYmd: string): string {
	if (!fromYmd || !toYmd) return '';
	const from = ymdToDate(fromYmd);
	const to = ymdToDate(toYmd);
	if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime())) return '';
	const sameYear = from.getFullYear() === to.getFullYear();
	const sameMonth = sameYear && from.getMonth() === to.getMonth();

	const monthYearFmt = new Intl.DateTimeFormat(arLocale(), { month: 'long', year: 'numeric' });
	const monthFmt = new Intl.DateTimeFormat(arLocale(), { month: 'long' });

	const fromDay = from.getDate();
	const toDay = to.getDate();

	if (sameMonth) {
		// Example: 9–15 أبريل ٢٠٢٦
		return `${fromDay}–${toDay} ${monthYearFmt.format(from)}`;
	}

	if (sameYear) {
		// Example: 28 مارس — 3 أبريل ٢٠٢٦
		return `${fromDay} ${monthFmt.format(from)} — ${toDay} ${monthYearFmt.format(to)}`;
	}

	// Example: 28 ديسمبر ٢٠٢٥ — 3 يناير ٢٠٢٦
	return `${fromDay} ${monthYearFmt.format(from)} — ${toDay} ${monthYearFmt.format(to)}`;
}

