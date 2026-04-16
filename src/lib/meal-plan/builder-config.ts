type MacroSplit = { c: number; p: number; f: number };

export type ResolvedBuilderConfig = {
	targetCalories: number;
	macros: MacroSplit;
	diags: string[];
	excluded: string[];
	excludedFoodItemIds: number[];
	selectedMeals: string[];
	tags: string[];
	dietTypes: string[];
	extraNote: string;
};

function toSafeDateYmd(value: unknown) {
	return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function sanitizeMacros(value: unknown): MacroSplit {
	const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
	return {
		c: Math.max(0, Math.min(100, Number(raw.c ?? 50) || 0)),
		p: Math.max(0, Math.min(100, Number(raw.p ?? 25) || 0)),
		f: Math.max(0, Math.min(100, Number(raw.f ?? 25) || 0))
	};
}

function sanitizeStringArray(value: unknown): string[] {
	return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function sanitizeNumberArray(value: unknown): number[] {
	return Array.isArray(value)
		? value
				.map((item) => Number(item))
				.filter((item) => Number.isFinite(item) && item > 0)
				.map((item) => Math.trunc(item))
		: [];
}

export function snapToSundayYmd(ymd: string) {
	const safe = toSafeDateYmd(ymd);
	const base = new Date((safe ?? new Date().toISOString().split('T')[0]) + 'T00:00:00');
	base.setDate(base.getDate() - base.getDay());
	const y = base.getFullYear();
	const m = String(base.getMonth() + 1).padStart(2, '0');
	const d = String(base.getDate()).padStart(2, '0');
	return `${y}-${m}-${d}`;
}

export function resolveBuilderConfigForDate(cfg: unknown, ymd: string): ResolvedBuilderConfig {
	const raw = cfg && typeof cfg === 'object' ? (cfg as Record<string, unknown>) : {};
	const fallback: ResolvedBuilderConfig = {
		targetCalories: Math.max(0, Number(raw.targetCalories ?? 0) || 0),
		macros: sanitizeMacros(raw.macros),
		diags: sanitizeStringArray(raw.diags),
		excluded: sanitizeStringArray(raw.excluded),
		excludedFoodItemIds: sanitizeNumberArray(raw.excludedFoodItemIds),
		selectedMeals: sanitizeStringArray(raw.selectedMeals),
		tags: sanitizeStringArray(raw.tags),
		dietTypes: sanitizeStringArray(raw.dietTypes),
		extraNote: typeof raw.extraNote === 'string' ? raw.extraNote : ''
	};

	const periodBuilder = raw.periodBuilder;
	if (!periodBuilder || typeof periodBuilder !== 'object') return fallback;

	const anchor = snapToSundayYmd(ymd);
	const periodSlice = (periodBuilder as Record<string, unknown>)[anchor];
	if (!periodSlice || typeof periodSlice !== 'object') return fallback;

	const scoped = periodSlice as Record<string, unknown>;
	return {
		targetCalories: Math.max(0, Number(scoped.targetCalories ?? fallback.targetCalories) || 0),
		macros: sanitizeMacros(scoped.macros ?? fallback.macros),
		diags: sanitizeStringArray(scoped.diags ?? fallback.diags),
		excluded: sanitizeStringArray(scoped.excluded ?? fallback.excluded),
		excludedFoodItemIds: sanitizeNumberArray(scoped.excludedFoodItemIds ?? fallback.excludedFoodItemIds),
		selectedMeals: sanitizeStringArray(scoped.selectedMeals ?? fallback.selectedMeals),
		tags: sanitizeStringArray(scoped.tags ?? fallback.tags),
		dietTypes: sanitizeStringArray(scoped.dietTypes ?? fallback.dietTypes),
		extraNote: typeof scoped.extraNote === 'string' ? scoped.extraNote : fallback.extraNote
	};
}
