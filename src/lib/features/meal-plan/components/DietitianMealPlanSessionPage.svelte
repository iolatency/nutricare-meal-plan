<script lang="ts">
	import type { PageData, ActionData } from '../../../../routes/dietitian/meal-plan/[sessionId]/$types';
	import {
		DIAGS,
		MEAL_TYPES,
		TAGS,
		DIET_TYPES,
		MICROS,
		DAYS_W
	} from '$lib/meal-plan/constants';
	import type { MealTypeId } from '$lib/meal-plan/constants';
	import type { Macros, PlanGrid, PlanSlot, RecipeNutrients, AiMealData } from '$lib/meal-plan/types';
	import { adjustMacro, macroGrams, parseNutrients, computePlanTotals, estimateMicros } from '$lib/meal-plan/macro-utils';
	import { validatePlan, getLimitsForTags, type ValidationResult, type ValidationStatus } from '$lib/meal-plan/validation';
import {
	generateMealPlanWithAi,
	saveMealPlan,
	upsertDiagnosis
} from '$lib/features/meal-plan/services/meal-plan-api';
	import { untrack } from 'svelte';
	import { snapToSunday, todayStr, toLocalYmd } from '$lib/features/meal-plan/state/date-utils';
	import { ALLERGEN_OPTS } from '$lib/features/meal-plan/state/ui-constants';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	/* ─── BUILDER STATE ─── */
	let planType = $state<'daily' | 'weekly'>('daily');
	let selectedDiags = $state<string[]>([]);
	let targetCalories = $state(0);
	let excludedFoods = $state<string[]>([]);
	let macros = $state<Macros>({ c: 50, p: 25, f: 25 });
	let selectedMeals = $state<MealTypeId[]>([]);
	let selectedTags = $state<string[]>([]);
	let selectedDietTypes = $state<string[]>([]);
	let extraNote = $state('');
	let diagNotes = $state('');
	let plan = $state<PlanGrid>({});
	let planStartDate = $state<string>(untrack(() => snapToSunday(data.session.startDate || todayStr())));
	let viewWeekStart = $state<string>(untrack(() => snapToSunday(data.session.startDate || todayStr())));

	/* ─── DROPDOWN STATE ─── */
	let showDiagDrop = $state(false);
	let showExcDrop = $state(false);

	/* ─── MODAL STATE ─── */
	let showRecipePicker = $state(false);
	let pickerContext = $state<{ mealType: string; dateKey: string } | null>(null);
	let pickerSearch = $state('');
	let pickerTab = $state<'recipe' | 'supplement'>('recipe');
	let pickerSupplCategory = $state<string>('all');
	let showMealDetail = $state(false);
	let detailRecipeId = $state<number | null>(null);
	// AI meal edit state
	let showAiMealEdit = $state(false);
	let aiMealEditCtx = $state<{ dateKey: string; mealType: string } | null>(null);
	let aiMealEditName = $state('');
	let aiMealEditIngredients = $state<AiMealData['ingredients']>([]);
	let aiMealEditSteps = $state('');
	let showSwapModal = $state(false);
	let swapContext = $state<{ mealType: string; dateKey: string } | null>(null);
	let showCreateDiagModal = $state(false);
	let createDiagError = $state('');
	let isCreatingDiag = $state(false);
	let expandedDiagIds = $state<string[]>([]);
	let editingDiagKey = $state<string | null>(null);
	let createDiagBasicOpen = $state(true);
	let createDiagClinicalOpen = $state(true);
	let createDiagNotesOpen = $state(false);
	let clientNotes = $state('');
	let microExpanded = $state(false);
	let customDiags = $state(
		untrack(() => (data.patientDiagnoses ?? []).map((d) => ({
			id: d.diagKey,
			label: d.name,
			code: d.code ?? '',
			severity: d.severity,
			diagnosedDate: d.diagnosedDate,
			status: d.status,
			notes: d.notes
		})))
	);
	let newDiagName = $state('');
	let newDiagCode = $state('');
	let newDiagSeverity = $state<'mild' | 'moderate' | 'severe' | ''>('');
	let newDiagDate = $state(todayStr());
	let newDiagStatus = $state<'active' | 'resolved' | 'managed'>('active');
	let newDiagNotes = $state('');

	/* ─── AI GENERATE STATE ─── */
	let showAiModal = $state(false);
	let aiExtraNote = $state('');
	let aiGenerating = $state(false);
	let aiProgressTotal = $state(1);
	let aiError = $state('');
	let aiGeneratedPlan = $state<any>(null);
	let showAiConfirm = $state(false);
	/** Set when some days failed but others succeeded (week generation). */
	let aiPlanPartial = $state(false);
	let aiPlanFailedDates = $state<string[]>([]);

	async function startAiGenerate() {
		aiGenerating = true;
		aiError = '';
		aiPlanPartial = false;
		aiPlanFailedDates = [];

		const dates = dayDates();
		aiProgressTotal = planType === 'weekly' ? Math.min(dates.length, 7) : 1;

		try {
			const res = await generateMealPlanWithAi({
				sessionId: data.session.id,
				scope: planType === 'weekly' ? 'week' : 'day',
				targetCalories: targetCalories > 0 ? targetCalories : effectiveTargetCalories,
				macros,
				excludedFoods,
				diagnoses: selectedDiags,
				tags: selectedTags,
				dietTypes: selectedDietTypes,
				selectedMeals,
				extraNote: aiExtraNote,
				dates
			});
			const result = await res.json();
			if (!res.ok) {
				aiError = result.error || 'فشل في إنشاء الخطة';
				return;
			}
			if (result.success && result.plan) {
				aiGeneratedPlan = result.plan;
				aiPlanPartial = Boolean(result.partial);
				aiPlanFailedDates = Array.isArray(result.failedDates) ? result.failedDates : [];
				showAiModal = false;
				showAiConfirm = true;
			} else {
				aiError = result.error || 'فشل في إنشاء الخطة';
			}
		} catch {
			aiError = 'تعذر الاتصال بالخادم';
		} finally {
			aiGenerating = false;
		}
	}

	function applyAiPlan() {
		if (!aiGeneratedPlan?.days) return;
		for (const day of aiGeneratedPlan.days) {
			const dateKey = day.date;
			if (!plan[dateKey]) plan[dateKey] = {};
			for (const meal of day.meals) {
				plan[dateKey][meal.mealType] = {
					aiMeal: {
						name: meal.name_ar,
						ingredients: meal.ingredients,
						total: meal.total,
						steps: meal.steps
					}
				};
			}
		}
		plan = { ...plan };
		showAiConfirm = false;
		aiGeneratedPlan = null;
		aiPlanPartial = false;
		aiPlanFailedDates = [];
	}

	/* ─── AUTO-SAVE ─── */
	let saveStatus = $state<'idle' | 'saving' | 'saved'>('idle');
	let saveTimer: ReturnType<typeof setTimeout> | undefined;
	let initialRestoreDone = $state(false);
	let saveInFlight = false;
	let pendingSave = false;

	/* ─── RESTORE STATE FROM EXISTING PLAN ─── */
	$effect(() => {
		if (initialRestoreDone) return;

		let restoredPlanType: 'daily' | 'weekly' = planType;
		if (data.existingPlan?.builderConfig) {
			try {
				const cfg = JSON.parse(data.existingPlan.builderConfig);
				if (cfg.planType) {
					planType = cfg.planType;
					restoredPlanType = cfg.planType;
				}
				if (cfg.diags) selectedDiags = cfg.diags;
				if (cfg.targetCalories) targetCalories = cfg.targetCalories;
				if (cfg.excluded) excludedFoods = cfg.excluded;
				if (cfg.macros) macros = cfg.macros;
				if (cfg.selectedMeals && Array.isArray(cfg.selectedMeals)) {
					const allowed = new Set(MEAL_TYPES.map((m) => m.id));
					selectedMeals = cfg.selectedMeals.filter((id: string): id is MealTypeId =>
						allowed.has(id as MealTypeId)
					);
				}
				if (cfg.tags) selectedTags = cfg.tags;
				if (cfg.dietTypes) selectedDietTypes = cfg.dietTypes;
				if (cfg.extraNote) extraNote = cfg.extraNote;
				if (cfg.diagNotes) diagNotes = cfg.diagNotes;
			} catch { /* ignore parse errors */ }
		}

		const ymdRe = /^\d{4}-\d{2}-\d{2}$/;
		if (data.existingMealDays.length) {
			const restored: PlanGrid = {};
			const baseDate = data.session.startDate || todayStr();
			for (const { day, meals: dayMeals } of data.existingMealDays) {
				const dateKey = day.date || toLocalYmd(new Date(
					new Date(baseDate + 'T00:00:00').getTime() + (day.dayOfWeek ?? day.sortOrder) * 86400000
				));
				restored[dateKey] = {};
				for (const meal of dayMeals) {
					if (meal.mealType === 'brunch') continue;
					const slot: PlanSlot = {};
					if (meal.recipeId) slot.recipeId = meal.recipeId;
					if (meal.supplementId) slot.supplementId = meal.supplementId;
					if ((meal as any).foodItemId) slot.foodItemId = (meal as any).foodItemId;
					if ((meal as any).aiMealJson) {
						try { slot.aiMeal = JSON.parse((meal as any).aiMealJson); } catch {}
					}
					if (slot.recipeId || slot.supplementId || slot.foodItemId || slot.aiMeal) {
						restored[dateKey][meal.mealType] = slot;
					}
				}
				if (Object.keys(restored[dateKey]).length === 0) delete restored[dateKey];
			}
			plan = restored;
		}

		if (data.existingPlan?.recommendation) {
			clientNotes = data.existingPlan.recommendation;
		}

		/* Anchor navigation + save metadata to persisted meal dates / session */
		let anchorYmd = ymdRe.test(data.session.startDate) ? data.session.startDate : todayStr();
		let minFromRows: string | null = null;
		for (const { day } of data.existingMealDays) {
			if (day.date && ymdRe.test(day.date)) {
				if (!minFromRows || day.date.localeCompare(minFromRows) < 0) minFromRows = day.date;
			}
		}
		if (minFromRows) anchorYmd = minFromRows;
		else {
			const planKeys = Object.keys(plan).filter((k) => ymdRe.test(k)).sort();
			if (planKeys.length) anchorYmd = planKeys[0];
		}

		if (restoredPlanType === 'daily') {
			viewWeekStart = anchorYmd;
			planStartDate = anchorYmd;
		} else {
			viewWeekStart = snapToSunday(anchorYmd);
			planStartDate = snapToSunday(anchorYmd);
		}

		/* Infer meal chips from saved slots when builderConfig omitted selectedMeals */
		if (selectedMeals.length === 0) {
			const typesInPlan = new Set<string>();
			for (const daySlots of Object.values(plan)) {
				for (const mt of Object.keys(daySlots)) typesInPlan.add(mt);
			}
			if (typesInPlan.size > 0) {
				selectedMeals = MEAL_TYPES.map((m) => m.id).filter((id) => typesInPlan.has(id));
			}
		}

		initialRestoreDone = true;
	});

	/* ─── DEBOUNCED AUTO-SAVE EFFECT ─── */
	$effect(() => {
		const _cfg = builderConfigJson;
		const _grid = planGridJson;

		if (!initialRestoreDone) return;

		clearTimeout(saveTimer);
		saveTimer = setTimeout(() => { doSave(); }, 800);
		return () => { clearTimeout(saveTimer); };
	});

	async function doSave() {
		// Cancel any pending debounced auto-save so this call is the sole in-flight one
		clearTimeout(saveTimer);
		saveTimer = undefined;
		if (saveInFlight) { pendingSave = true; return; }
		saveInFlight = true;
		saveStatus = 'saving';
		try {
			await savePlan();
			saveStatus = 'saved';
			setTimeout(() => { if (saveStatus === 'saved') saveStatus = 'idle'; }, 2000);
		} catch {
			saveStatus = 'idle';
		} finally {
			saveInFlight = false;
			if (pendingSave) {
				pendingSave = false;
				doSave();
			}
		}
	}

	/* ─── DERIVED ─── */
	const days = $derived(planType === 'weekly' ? [0, 1, 2, 3, 4, 5, 6] : [0]);
	const weeklyAnchorStart = $derived(() =>
		planType === 'weekly' ? snapToSunday(viewWeekStart) : viewWeekStart
	);

	const dayDates = $derived(() => {
		const start = new Date(weeklyAnchorStart() + 'T00:00:00');
		return days.map((i) => {
			const d = new Date(start.getTime() + i * 86400000);
			return toLocalYmd(d);
		});
	});

	const dayLabels = $derived(() => {
		const start = new Date(weeklyAnchorStart() + 'T00:00:00');
		return days.map((i) => {
			const d = new Date(start.getTime() + i * 86400000);
			const dayName = DAYS_W[d.getDay()];
			const dd = d.getDate();
			const mm = d.getMonth() + 1;
			return `${dayName} ${dd}/${mm}`;
		});
	});

	function slotHasContent(slot: PlanSlot | undefined): boolean {
		if (!slot) return false;
		return Boolean(slot.recipeId || slot.supplementId || slot.foodItemId || slot.aiMeal?.total);
	}

	const diagnosisOptions = $derived(() => {
		const builtin = DIAGS.map((d) => ({ id: d.id as string, label: d.label, recs: d.recs }));
		const custom = customDiags.map((d) => ({
			id: d.id,
			label: d.label,
			recs: [] as string[],
			code: d.code,
			severity: d.severity,
			diagnosedDate: d.diagnosedDate,
			status: d.status,
			notes: d.notes
		}));
		return [...builtin, ...custom];
	});

	type DiagnosisOption = {
		id: string;
		label: string;
		recs: readonly string[];
		code?: string;
		severity?: 'mild' | 'moderate' | 'severe' | '';
		diagnosedDate?: string;
		status?: 'active' | 'resolved' | 'managed';
		notes?: string;
	};

	const diagnosisLookup = $derived(() => {
		const map = new Map<string, DiagnosisOption>();
		for (const d of diagnosisOptions()) map.set(d.id, d);
		return map;
	});

	/** Is today visible in the current view? Returns the column index (0-based), or -1 */
	const todayDayIdx = $derived(() => {
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const start = new Date(weeklyAnchorStart() + 'T00:00:00');
		const diff = Math.round((today.getTime() - start.getTime()) / 86400000);
		const count = planType === 'weekly' ? 7 : 1;
		return diff >= 0 && diff < count ? diff : -1;
	});

	/** Navigate: daily moves ±1 day, weekly moves ±7 days, 0 = jump to today */
	function goNav(offset: number) {
		if (offset === 0) {
			viewWeekStart = planType === 'weekly' ? snapToSunday(todayStr()) : todayStr();
		} else {
			const step = planType === 'weekly' ? 7 : 1;
			const base = planType === 'weekly' ? weeklyAnchorStart() : viewWeekStart;
			const d = new Date(base + 'T00:00:00');
			d.setDate(d.getDate() + offset * step);
			viewWeekStart = planType === 'weekly' ? snapToSunday(toLocalYmd(d)) : toLocalYmd(d);
		}
	}

	/** Format date range for the center nav button */
	const navRangeLabel = $derived(() => {
		const start = new Date(weeklyAnchorStart() + 'T00:00:00');
		const monthYearFmt = new Intl.DateTimeFormat('ar', {
			month: 'long',
			year: 'numeric'
		});
		if (planType === 'daily') {
			const dayName = DAYS_W[start.getDay()];
			return `${dayName} ${start.getDate()} ${monthYearFmt.format(start)}`;
		}
		const end = new Date(start.getTime() + 6 * 86400000);
		return `${start.getDate()} ${monthYearFmt.format(start)} – ${end.getDate()} ${monthYearFmt.format(end)}`;
	});

	const recipeLookup = $derived(() => {
		const map = new Map<number, RecipeNutrients>();
		for (const { recipe } of data.recipes) {
			const n = parseNutrients(recipe.nutrients);
			if (n) map.set(recipe.id, n);
		}
		return map;
	});

	const supplementLookup = $derived(() => {
		const map = new Map<number, { totalKcal: number; protein: number; carbs: number; fat: number }>();
		for (const s of data.supplements) {
			map.set(s.id, {
				totalKcal: s.totalKcal ?? 0,
				protein: s.protein ?? 0,
				carbs: s.carbs ?? 0,
				fat: s.fat ?? 0
			});
		}
		return map;
	});

	const foodLookup = $derived(() => {
		const map = new Map<number, { calories: number; protein: number; carbs: number; fat: number }>();
		for (const f of data.foods) {
			map.set(f.id, {
				calories: f.calories ?? 0,
				protein: f.protein ?? 0,
				carbs: f.carbs ?? 0,
				fat: f.fat ?? 0
			});
		}
		return map;
	});

	const currentWeekPlan = $derived(() => {
		const dates = new Set(dayDates());
		const filtered: PlanGrid = {};
		for (const [key, val] of Object.entries(plan)) {
			if (dates.has(key)) filtered[key] = val;
		}
		return filtered;
	});

	const planCalc = $derived(computePlanTotals(currentWeekPlan(), recipeLookup(), supplementLookup(), foodLookup()));

	/** Meal types that actually have filled slots in the day/week currently shown (not other weeks). */
	const mealTypesUsedInView = $derived(() => {
		const s = new Set<string>();
		for (const daySlots of Object.values(currentWeekPlan())) {
			for (const [mealType, slot] of Object.entries(daySlots)) {
				if (slotHasContent(slot as PlanSlot)) s.add(mealType);
			}
		}
		return s;
	});

	/** Rows in the plan grid: selected types plus any type that already has slots in this view period. */
	const displayMealTypes = $derived(() => {
		const fromViewedPeriod = new Set<string>();
		for (const daySlots of Object.values(currentWeekPlan())) {
			for (const mealType of Object.keys(daySlots)) fromViewedPeriod.add(mealType);
		}
		return MEAL_TYPES.map((m) => m.id).filter(
			(id) => selectedMeals.includes(id) || fromViewedPeriod.has(id)
		);
	});

	/** Donut charts + per-meal breakdown: only types with calories in the viewed day/week (avoids 0% rings for unused slots). */
	const chartMealTypes = $derived(() =>
		displayMealTypes().filter((id) => (planCalc.mealTotals[id]?.calories ?? 0) > 0)
	);

	/** Meal chips: types used in the current day/week first so the grid matches what you see at a glance. */
	const sortedMealTypesForChips = $derived(() => {
		const used = mealTypesUsedInView();
		return [...MEAL_TYPES].sort((a, b) => {
			const au = used.has(a.id) ? 1 : 0;
			const bu = used.has(b.id) ? 1 : 0;
			if (bu !== au) return bu - au;
			return MEAL_TYPES.findIndex((x) => x.id === a.id) - MEAL_TYPES.findIndex((x) => x.id === b.id);
		});
	});

	/** When day/week navigation (or daily↔weekly) changes, turn off meal chips that have no slots in the new view. */
	let lastMealChipNavKey: string | null = null;
	$effect(() => {
		if (!initialRestoreDone) return;
		const navKey = `${planType}:${weeklyAnchorStart()}`;
		if (lastMealChipNavKey === null) {
			lastMealChipNavKey = navKey;
			return;
		}
		if (lastMealChipNavKey === navKey) return;
		lastMealChipNavKey = navKey;

		const used = mealTypesUsedInView();
		const next = selectedMeals.filter((id) => used.has(id));
		const same =
			next.length === selectedMeals.length && next.every((id, i) => id === selectedMeals[i]);
		if (!same) selectedMeals = next;
	});

	/**
	 * When the plan was created without builderConfig (e.g. DB seed), targetCalories stays 0 and the
	 * summary panel showed 0% / —g goals. Use a conservative implicit goal from current totals for display.
	 */
	const effectiveTargetCalories = $derived(
		targetCalories > 0
			? targetCalories
			: planCalc.totals.calories > 0
				? Math.max(1600, Math.ceil(planCalc.totals.calories * 1.08))
				: 2000
	);

	const mg = $derived(macroGrams(effectiveTargetCalories, macros));
	const microData = $derived(estimateMicros(planCalc.totals.calories));

	const recipeIngredientNames = $derived(() => {
		const map = new Map<number, string[]>();
		for (const { recipe } of data.recipes) {
			const ing = (recipe as any).ingredientNames as string[] | undefined;
			if (ing) map.set(recipe.id, ing);
		}
		return map;
	});

	const supplementNutrientTotals = $derived(() => {
		const totals: Record<string, number> = { sodium: 0, potassium: 0, phosphorus: 0, calcium: 0, fiber: 0 };
		for (const daySlots of Object.values(currentWeekPlan())) {
			for (const slot of Object.values(daySlots)) {
				if (slot.supplementId) {
					const s = data.supplements.find((x) => x.id === slot.supplementId);
					if (s) {
						totals.sodium += s.sodium ?? 0;
						totals.potassium += s.potassium ?? 0;
						totals.phosphorus += s.phosphorus ?? 0;
						totals.calcium += s.calcium ?? 0;
						totals.fiber += s.fiber ?? 0;
					}
				}
			}
		}
		return totals;
	});

	const planValidation = $derived<ValidationResult>(
		validatePlan(
			currentWeekPlan(),
			excludedFoods,
			selectedTags,
			selectedDietTypes,
			macros,
			recipeIngredientNames(),
			supplementNutrientTotals(),
			planCalc.totals.calories
		)
	);

	const pctDone = $derived(
		effectiveTargetCalories > 0
			? Math.min(100, Math.round((planCalc.totals.calories / effectiveTargetCalories) * 100))
			: 0
	);
	const remaining = $derived(Math.max(0, effectiveTargetCalories - planCalc.totals.calories));
	const usingImplicitCalorieGoal = $derived(targetCalories <= 0 && planCalc.totals.calories > 0);

	const builderConfigJson = $derived(
		JSON.stringify({
			planType,
			diags: selectedDiags,
			targetCalories,
			excluded: excludedFoods,
			macros,
			selectedMeals,
			tags: selectedTags,
			dietTypes: selectedDietTypes,
			extraNote,
			diagNotes
		})
	);

	const planGridJson = $derived(JSON.stringify(plan));

	/* ─── FILTERED ITEMS FOR PICKER ─── */
	const pickerItems = $derived(() => {
		if (!pickerContext) return [];
		const q = pickerSearch.toLowerCase();

		if (pickerTab === 'supplement') {
			return data.supplements
				.filter((s) => {
					const cat = (s as any).formulaCategory as string | null;
					if (pickerSupplCategory !== 'all' && cat !== pickerSupplCategory) return false;
					if (q && !s.name.toLowerCase().includes(q)) return false;
					return true;
				})
				.map((s) => ({
					id: s.id,
					type: 'supplement' as const,
					name: s.name,
					nameAr: s.name,
					emoji: '',
					calories: s.totalKcal ?? 0,
					protein: s.protein ?? 0,
					carbs: s.carbs ?? 0,
					fat: s.fat ?? 0,
					formulaCategory: (s as any).formulaCategory as string | null,
					kcalPerMl: s.kcalPerMl ?? null,
					volumeMl: s.volumeMl ?? null,
					fiber: s.fiber ?? null,
					osmolarity: s.osmolarity ?? null
				}));
		}

		return data.recipes
			.filter(({ recipe }) => {
				if (!q) return true;
				return recipe.name.toLowerCase().includes(q) || (recipe.nameAr ?? '').toLowerCase().includes(q);
			})
			.map(({ recipe }) => {
				const n = parseNutrients(recipe.nutrients);
				return {
					id: recipe.id,
					type: 'recipe' as const,
					name: recipe.name,
					nameAr: recipe.nameAr ?? recipe.name,
					emoji: '',
					calories: n?.calories ?? 0,
					protein: n?.protein ?? 0,
					carbs: n?.carbs ?? 0,
					fat: n?.fat ?? 0,
					imageUrl: recipe.imageUrl ?? null
				};
			});
	});

	/* ─── ACTIONS ─── */
	function toggleDiag(id: string) {
		if (selectedDiags.includes(id)) selectedDiags = selectedDiags.filter((d) => d !== id);
		else selectedDiags = [...selectedDiags, id];
	}

	function resetCreateDiagForm() {
		newDiagName = '';
		newDiagCode = '';
		newDiagSeverity = '';
		newDiagDate = todayStr();
		newDiagStatus = 'active';
		newDiagNotes = '';
		createDiagError = '';
		editingDiagKey = null;
		createDiagBasicOpen = true;
		createDiagClinicalOpen = true;
		createDiagNotesOpen = false;
	}

	async function createDiagnosis() {
		createDiagError = '';
		if (!newDiagName.trim() || !newDiagSeverity || !newDiagDate || !newDiagStatus || !newDiagNotes.trim()) {
			createDiagError = 'يرجى تعبئة جميع الحقول المطلوبة';
			return;
		}
		if (isCreatingDiag) return;
		isCreatingDiag = true;
		const diagKey = editingDiagKey ?? `custom_${Date.now()}`;
		const body = new FormData();
		body.append('diagKey', diagKey);
		body.append('name', newDiagName.trim());
		body.append('code', newDiagCode.trim());
		body.append('severity', newDiagSeverity);
		body.append('diagnosedDate', newDiagDate);
		body.append('status', newDiagStatus);
		body.append('notes', newDiagNotes.trim());

		try {
			const action = editingDiagKey ? 'updateDiagnosis' : 'createDiagnosis';
			const res = await upsertDiagnosis(action, body);
			if (!res.ok) {
				createDiagError = 'تعذر إنشاء التشخيص، حاول مرة أخرى.';
				return;
			}
			const updatedDiag = {
				id: diagKey,
				label: newDiagName.trim(),
				code: newDiagCode.trim(),
				severity: newDiagSeverity,
				diagnosedDate: newDiagDate,
				status: newDiagStatus,
				notes: newDiagNotes.trim()
			};
			customDiags = editingDiagKey
				? customDiags.map((d) => (d.id === diagKey ? updatedDiag : d))
				: [updatedDiag, ...customDiags];
			if (!selectedDiags.includes(diagKey)) selectedDiags = [...selectedDiags, diagKey];
			if (!expandedDiagIds.includes(diagKey)) expandedDiagIds = [...expandedDiagIds, diagKey];
			showCreateDiagModal = false;
			resetCreateDiagForm();
		} catch {
			createDiagError = 'تعذر الاتصال بالخادم.';
		} finally {
			isCreatingDiag = false;
		}
	}

	function toggleDiagDetails(id: string) {
		expandedDiagIds = expandedDiagIds.includes(id)
			? expandedDiagIds.filter((x) => x !== id)
			: [...expandedDiagIds, id];
	}

	function startEditDiagnosis(diagId: string) {
		const d = customDiags.find((x) => x.id === diagId);
		if (!d) return;
		editingDiagKey = d.id;
		newDiagName = d.label;
		newDiagCode = d.code ?? '';
		newDiagSeverity = d.severity ?? '';
		newDiagDate = d.diagnosedDate ?? todayStr();
		newDiagStatus = (d.status as 'active' | 'resolved' | 'managed') ?? 'active';
		newDiagNotes = d.notes ?? '';
		createDiagError = '';
		createDiagBasicOpen = true;
		createDiagClinicalOpen = true;
		createDiagNotesOpen = true;
		showCreateDiagModal = true;
	}

	function toggleExcluded(item: string) {
		if (excludedFoods.includes(item)) excludedFoods = excludedFoods.filter((x) => x !== item);
		else excludedFoods = [...excludedFoods, item];
	}

	function toggleMeal(id: MealTypeId) {
		if (selectedMeals.includes(id)) selectedMeals = selectedMeals.filter((x) => x !== id);
		else selectedMeals = [...selectedMeals, id];
	}

	function toggleTag(tag: string) {
		if (selectedTags.includes(tag)) selectedTags = selectedTags.filter((x) => x !== tag);
		else selectedTags = [...selectedTags, tag];
	}

	function toggleDietType(tag: string) {
		if (selectedDietTypes.includes(tag))
			selectedDietTypes = selectedDietTypes.filter((x) => x !== tag);
		else selectedDietTypes = [...selectedDietTypes, tag];
	}

	function onSlider(which: 'c' | 'p' | 'f', val: number) {
		macros = adjustMacro(which, val, macros);
	}

	function openPicker(mealType: string, dateKey: string) {
		pickerContext = { mealType, dateKey };
		pickerSearch = '';
		pickerTab = mealType === 'supplement' ? 'supplement' : 'recipe';
		showRecipePicker = true;
	}

	function pickItem(item: { id: number; type: 'recipe' | 'supplement' }) {
		if (!pickerContext) return;
		const { mealType, dateKey } = pickerContext;
		if (!plan[dateKey]) plan[dateKey] = {};
		if (item.type === 'supplement') {
			plan[dateKey][mealType] = { supplementId: item.id };
		} else {
			plan[dateKey][mealType] = { recipeId: item.id };
		}
		plan = { ...plan };
		showRecipePicker = false;
	}

	function removeSlot(dateKey: string, mealType: string) {
		if (plan[dateKey]) {
			delete plan[dateKey][mealType];
			if (Object.keys(plan[dateKey]).length === 0) delete plan[dateKey];
			plan = { ...plan };
		}
	}

	function getSlotInfo(slot: PlanSlot) {
		if (slot.aiMeal) {
			return {
				name: slot.aiMeal.name,
				emoji: '',
				calories: slot.aiMeal.total?.calories ?? 0,
				type: 'ai' as const
			};
		}
		if (slot.recipeId) {
			const r = data.recipes.find((x) => x.recipe.id === slot.recipeId);
			if (!r) return null;
			const n = parseNutrients(r.recipe.nutrients);
			return {
				name: r.recipe.nameAr ?? r.recipe.name,
				emoji: '',
				calories: n?.calories ?? 0,
				type: 'recipe' as const,
				imageUrl: r.recipe.imageUrl ?? null
			};
		}
		if (slot.supplementId) {
			const s = data.supplements.find((x) => x.id === slot.supplementId);
			if (!s) return null;
			return { name: s.name, emoji: '', calories: s.totalKcal ?? 0, type: 'supplement' as const };
		}
		if (slot.foodItemId) {
			const f = data.foods.find((x) => x.id === slot.foodItemId);
			if (!f) return null;
			return { name: f.nameAr ?? f.name, emoji: '', calories: f.calories ?? 0, type: 'food' as const };
		}
		return null;
	}

	function openSwap(mealType: string, dateKey: string) {
		swapContext = { mealType, dateKey };
		showSwapModal = true;
	}

	function doSwap(targetDateKey: string) {
		if (!swapContext) return;
		const { mealType, dateKey: fromKey } = swapContext;
		const fromSlot = plan[fromKey]?.[mealType];
		const toSlot = plan[targetDateKey]?.[mealType];
		if (!plan[fromKey]) plan[fromKey] = {};
		if (!plan[targetDateKey]) plan[targetDateKey] = {};
		if (toSlot) plan[fromKey][mealType] = toSlot;
		else delete plan[fromKey][mealType];
		if (fromSlot) plan[targetDateKey][mealType] = fromSlot;
		else delete plan[targetDateKey][mealType];
		plan = { ...plan };
		showSwapModal = false;
	}

	async function savePlan() {
		const body = new FormData();
		body.append('builderConfig', builderConfigJson);
		body.append('planGrid', planGridJson);
		body.append('planType', planType);
		body.append('recommendation', clientNotes);
		body.append('startDate', planStartDate);
		const res = await saveMealPlan(body);
		if (!res.ok) throw new Error(`Save failed: ${res.status}`);
	}

	function openRecipeDetail(recipeId: number) {
		detailRecipeId = recipeId;
		showMealDetail = true;
	}

	function openAiMealEdit(dateKey: string, mealType: string, aiMeal: AiMealData) {
		aiMealEditCtx = { dateKey, mealType };
		aiMealEditName = aiMeal.name;
		aiMealEditIngredients = aiMeal.ingredients.map((i) => ({ ...i }));
		aiMealEditSteps = aiMeal.steps ?? '';
		showAiMealEdit = true;
	}

	function addAiIngredient() {
		aiMealEditIngredients = [
			...aiMealEditIngredients,
			{ name_ar: '', quantity: 100, unit: 'g', calories: 0, protein: 0, carbs: 0, fat: 0 }
		];
	}

	function removeAiIngredient(i: number) {
		aiMealEditIngredients = aiMealEditIngredients.filter((_, idx) => idx !== i);
	}

	const aiMealEditTotal = $derived(() =>
		aiMealEditIngredients.reduce(
			(acc, ing) => ({
				calories: acc.calories + (ing.calories || 0),
				protein: acc.protein + (ing.protein || 0),
				carbs: acc.carbs + (ing.carbs || 0),
				fat: acc.fat + (ing.fat || 0)
			}),
			{ calories: 0, protein: 0, carbs: 0, fat: 0 }
		)
	);

	function saveAiMealEdit() {
		if (!aiMealEditCtx) return;
		const { dateKey, mealType } = aiMealEditCtx;
		if (!plan[dateKey]) plan[dateKey] = {};
		plan[dateKey][mealType] = {
			aiMeal: {
				name: aiMealEditName,
				ingredients: aiMealEditIngredients,
				total: aiMealEditTotal(),
				steps: aiMealEditSteps
			}
		};
		plan = { ...plan };
		showAiMealEdit = false;
		aiMealEditCtx = null;
	}

	function closeDropdowns(e: MouseEvent) {
		const target = e.target as HTMLElement;
		if (!target.closest('.diag-drop-zone')) showDiagDrop = false;
		if (!target.closest('.exc-drop-zone')) showExcDrop = false;
	}

	const detailRecipe = $derived(
		detailRecipeId ? data.recipes.find((r) => r.recipe.id === detailRecipeId)?.recipe ?? null : null
	);
	const detailNutrients = $derived(detailRecipe ? parseNutrients(detailRecipe.nutrients) : null);
</script>

<svelte:head><title>الخطة الغذائية — {data.patient.name} — نيوتريكير</title></svelte:head>
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div onclick={closeDropdowns}>

<style>
	/* ─── LAYOUT ─── */
	.builder-wrap {
		display: flex;
		gap: 22px;
		padding: 20px 24px;
		padding-inline: max(16px, env(safe-area-inset-left, 0px)) max(16px, env(safe-area-inset-right, 0px));
		align-items: flex-start;
		min-height: calc(100vh - 56px);
		font-family: 'Tajawal', sans-serif;
		width: 100%;
		max-width: 100%;
		box-sizing: border-box;
	}
	.form-panel { flex: 1; min-width: 0; }
	.right-panel { width: 340px; flex-shrink: 0; min-width: 0; }

	/* ─── CARDS ─── */
	.form-card { background:#fff; border-radius:16px; box-shadow:0 1px 10px rgba(16,24,40,.06); border:1px solid #eef1f5; padding:20px 22px; margin-bottom:14px; transition:box-shadow .2s, border-color .2s; }
	.form-card:hover { box-shadow:0 8px 24px rgba(16,24,40,.08); border-color:#e1e7ef; }
	.field-label { display:flex; align-items:center; gap:9px; font-size:13px; font-weight:700; color:#6f7785; margin-bottom:9px; }

	/* ─── BUTTONS ─── */
	.plan-switch { display:flex; gap:8px; background:#f6f8fb; border:1px solid #e8edf3; border-radius:12px; padding:6px; }
	.plan-btn { flex:1; padding:10px; border-radius:9px; border:1.5px solid transparent; background:transparent; font-size:14px; font-weight:700; color:#7b8493; cursor:pointer; transition:.2s; font-family:'Tajawal',sans-serif; }
	.plan-btn.active { border-color:#3cb96b; background:#fff; color:#1f9e57; box-shadow:0 2px 8px rgba(46,165,93,.16); }
	.plan-btn:hover:not(.active) { border-color:#d7deea; background:#fff; color:#4d5563; }

	/* ─── SELECT BOXES ─── */
	.sel-box {
		border: 1.5px solid #e8eaed;
		border-radius: 10px;
		padding: 10px 12px;
		padding-inline-end: 36px;
		min-height: 44px;
		cursor: pointer;
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		align-items: center;
		background: #fff;
		transition: border-color 0.15s, box-shadow 0.15s;
		position: relative;
		touch-action: manipulation;
	}
	.sel-box:hover { border-color:#3cb96b; box-shadow:0 0 0 3px rgba(60,185,107,.10); }
	.sel-chevron {
		position: absolute;
		inset-inline-end: 10px;
		top: 50%;
		transform: translateY(-50%);
		color: #8b909a;
		pointer-events: none;
		font-size: 11px;
		line-height: 1;
	}
	.diag-placeholder { color:#a0a8b7; font-size:13px; font-weight:500; }
	.chip { background:#edf9f2; color:#3cb96b; border-radius:20px; padding:3px 10px; font-size:11.5px; font-weight:500; display:flex; align-items:center; gap:4px; }
	.chip-x { cursor:pointer; opacity:.6; font-size:14px; line-height:1; border:none; background:none; color:#3cb96b; font-family:'Tajawal',sans-serif; padding:0; }
	.chip-x:hover { opacity:1; }
	.dropdown {
		position: absolute;
		top: calc(100% + 6px);
		inset-inline: 0;
		background: #fff;
		border: 1.5px solid #e8eaed;
		border-radius: 12px;
		box-shadow: 0 10px 28px rgba(16, 24, 40, 0.12);
		z-index: 200;
		max-height: min(50vh, 280px);
		overflow-y: auto;
		padding: 4px;
		-webkit-overflow-scrolling: touch;
	}
	.drop-item { padding:10px 12px; cursor:pointer; font-size:13px; transition:.15s; display:flex; align-items:center; justify-content:space-between; width:100%; text-align:right; border:none; background:none; border-radius:8px; font-family:'Tajawal',sans-serif; color:#1a1d23; font-weight:600; }
	.drop-item:hover { background:#f4f7fb; }
	.drop-item.selected { background:#edf9f2; color:#1f9e57; }
	.drop-item-check { font-size:11px; font-weight:700; color:#1f9e57; background:#dff5e8; padding:2px 8px; border-radius:999px; }
	.diag-info-card { background:#f7fafc; border:1px solid #e4ebf3; border-radius:10px; padding:10px 12px; margin-top:8px; }
	.diag-info-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
	.diag-info-label { font-size:10px; color:#8b909a; font-weight:700; margin-bottom:2px; }
	.diag-info-value { font-size:12px; color:#1f2937; font-weight:600; }
	.diag-section-btn { width:100%; border:1px solid #e8eaed; border-radius:8px; background:#fff; padding:8px 10px; display:flex; align-items:center; justify-content:space-between; cursor:pointer; font-family:'Tajawal',sans-serif; font-size:12px; font-weight:700; color:#4b5563; margin-bottom:8px; }
	.diag-section-btn:hover { border-color:#cfe6d8; background:#f7fcf9; }

	/* ─── INPUTS ─── */
	.cal-input { flex:1; min-width:0; border:1.5px solid #e8eaed; border-radius:9px; padding:9px 12px; font-size:13px; outline:none; transition:border-color .15s; color:#1a1d23; font-family:'Tajawal',sans-serif; }
	.cal-input:focus { border-color:#3cb96b; }
	.calories-row { display:flex; gap:8px; align-items:stretch; flex-wrap:wrap; }
	.kcal-suffix {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0 12px;
		background: #f4f6f9;
		border: 1.5px solid #e8eaed;
		border-radius: 9px;
		font-size: 13px;
		font-weight: 600;
		color: #8b909a;
		white-space: nowrap;
		flex-shrink: 0;
	}
	.macro-header-row { display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; }
	.macro-header-row > span:last-child { flex-shrink:0; max-width:100%; }
	.macro-pill-row { display:flex; gap:8px; margin-bottom:18px; flex-wrap:wrap; }
	.macro-pill-row .macro-pill { flex:1 1 88px; min-width:min(100%, 88px); }
	.macro-slider-row { display:flex; align-items:center; gap:10px; margin-bottom:10px; min-width:0; }
	.macro-slider-row:last-child { margin-bottom:0; }
	.macro-slider-row .slider { min-width:0; }
	.meal-type-grid { display:grid; grid-template-columns:repeat(3, 1fr); gap:7px; }
	.validation-banner {
		margin-inline: clamp(10px, 3vw, 24px);
		margin-block: 0 10px;
		padding: 12px 16px;
		border-radius: 12px;
		font-family: 'Tajawal', sans-serif;
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		align-items: center;
		box-sizing: border-box;
		max-width: 100%;
	}
	.plan-grid-card { margin-top: 14px; padding: 16px 20px; }
	.plan-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; margin-inline: -4px; padding-inline: 4px; }
	.mdt-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; margin-inline: -6px; padding-inline: 6px; }
	.cal-target-stats { display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap; font-size:10.5px; opacity:0.9; }
	.cal-target-stats > div { flex:1 1 72px; min-width:0; }
	.cal-target-stats .stat-start { text-align: start; }
	.cal-target-stats .stat-mid { text-align:center; }
	.cal-target-stats .stat-end { text-align:end; }
	.chart-macro-row { display:flex; gap:6px; margin-bottom:12px; min-width:0; }
	.chart-macro-row > div { min-width:0; flex:1; }

	/* ─── MACROS ─── */
	.macro-pill { flex:1; border-radius:12px; padding:12px 10px; display:flex; flex-direction:column; align-items:center; gap:4px; }
	.macro-pill-pct { font-size:22px; font-weight:800; line-height:1; }
	.slider { flex:1; -webkit-appearance:none; height:5px; border-radius:3px; outline:none; cursor:pointer; }
	.slider::-webkit-slider-thumb { -webkit-appearance:none; width:18px; height:18px; border-radius:50%; cursor:pointer; border:2px solid #fff; box-shadow:0 1px 4px rgba(0,0,0,.2); }

	/* ─── MEALS ─── */
	.meal-chip { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:12px 14px; border:1.5px solid #e8eaed; border-radius:9px; cursor:pointer; transition:all .15s; user-select:none; background:#fff; font-family:'Tajawal',sans-serif; font-size:13px; font-weight:600; color:#6b7280; min-height:48px; }
	.meal-chip:hover { border-color:#c5edd8; background:#fafffe; }
	.meal-chip.on { border-color:#3cb96b; background:#edf9f2; color:#1f9e57; font-weight:700; }
	.meal-chip.in-view-period:not(.on) { box-shadow: inset 3px 0 0 0 #7dd3a0; background:#fafffe; }
	.meal-chip.in-view-period.on { box-shadow: inset 3px 0 0 0 #22c55e; }

	/* ─── TAGS ─── */
	.tag-btn { border:1.5px solid #e8eaed; border-radius:20px; padding:8px 16px; font-size:12.5px; font-weight:600; color:#6b7280; cursor:pointer; transition:.15s; user-select:none; background:#fff; font-family:'Tajawal',sans-serif; min-height:40px; }
	.tag-btn:hover { border-color:#3cb96b; color:#3cb96b; background:#edf9f2; }
	.tag-btn.on { border-color:#3cb96b; background:#edf9f2; color:#1f9e57; font-weight:700; }

	/* ─── GENERATE ─── */
	.btn-generate { width:100%; padding:14px; border-radius:10px; border:none; background:#3cb96b; color:#fff; font-size:15px; font-weight:700; cursor:pointer; transition:.15s; letter-spacing:.2px; font-family:'Tajawal',sans-serif; }
	.btn-generate:hover { background:#2ea55d; }
	.btn-generate:active { transform:scale(.98); }

	/* ─── RIGHT PANEL ─── */
	.chart-card { background:#fff; border-radius:16px; box-shadow:0 8px 26px rgba(16,24,40,.08); padding:18px; border:1px solid #e8edf3; position:static; }
	.divider { height:1px; background:#e8eaed; margin:12px 0; }

	/* ─── PLAN GRID ─── */
	.plan-table { border-collapse:separate; border-spacing:6px; width:100%; table-layout:fixed; }
	.plan-table-weekly {
		/* ~92px per day column at 720px — comfortable scroll on phones */
		min-width: 720px;
	}
	.plan-table th { font-size:11px; font-weight:700; color:#8b909a; text-align:center; padding:10px 4px 4px; letter-spacing:.5px; text-transform:uppercase; }
	.plan-corner-th,
	.plan-meal-label-cell {
		position: sticky;
		inset-inline-end: 0;
		z-index: 4;
		background: #fff;
		box-shadow: -6px 0 10px -4px rgba(15, 23, 42, 0.08);
	}
	.plan-meal-label-cell {
		z-index: 3;
	}
	.meal-cell { border:2px dashed #d9dce3; border-radius:10px; min-height:100px; cursor:pointer; vertical-align:top; transition:all .2s; position:relative; }
	.meal-cell:hover { border-color:#3cb96b; background:#f0faf4; }
	.meal-card { border-radius:8px; overflow:hidden; background:#fff; border:2px solid transparent; height:100%; box-shadow:0 1px 6px rgba(0,0,0,.08); transition:.2s; cursor:pointer; }
	.meal-card:hover { box-shadow:0 4px 16px rgba(0,0,0,.13); }
	.meal-card-hero {
		width: 100%;
		height: 48px;
		position: relative;
		overflow: hidden;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 13px;
		font-weight: 700;
		flex-shrink: 0;
	}
	.meal-card-body {
		padding: 5px 7px 6px;
	}
	.meal-slot-placeholder {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100px;
		gap: 4px;
	}
	.meal-card-name {
		font-size: 10px;
		font-weight: 600;
		color: #1a1d23;
		line-height: 1.35;
		margin-bottom: 2px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.meal-card-cals {
		font-size: 9px;
		color: #8b909a;
	}
	.cell-actions { position:absolute; top:4px; right:4px; display:none; gap:3px; z-index:10; }
	.meal-cell:hover .cell-actions { display:flex; }
	.cell-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		background: rgba(255, 255, 255, 0.97);
		border: 1px solid #e8eaed;
		border-radius: 6px;
		padding: 3px 6px;
		font-size: 10px;
		cursor: pointer;
		font-weight: 600;
		transition: 0.1s;
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
		font-family: 'Tajawal', sans-serif;
		line-height: 1.4;
	}
	.cell-btn-swap { color:#3cb96b; }
	.cell-btn-swap:hover { background:#3cb96b; color:#fff; border-color:#3cb96b; }
	.cell-btn-edit { color:#4e9af1; }
	.cell-btn-edit:hover { background:#4e9af1; color:#fff; border-color:#4e9af1; }
	.cell-btn-del { color:#ef4444; }
	.cell-btn-del:hover { background:#ef4444; color:#fff; border-color:#ef4444; }

	/* ─── WEEK NAVIGATOR ─── */
	.week-nav { display:flex; align-items:center; gap:6px; margin-bottom:14px; justify-content:center; }
	.week-nav-arrow { display:flex; align-items:center; justify-content:center; width:36px; height:36px; border-radius:50%; border:1.5px solid #e8eaed; background:#fff; color:#8b909a; cursor:pointer; transition:.15s; flex-shrink:0; }
	.week-nav-arrow:hover { border-color:#3cb96b; color:#3cb96b; background:#edf9f2; }
	.week-nav-center { display:flex; align-items:center; gap:8px; padding:7px 18px; border-radius:10px; border:1.5px solid #e8eaed; background:#fff; cursor:pointer; font-family:'Tajawal',sans-serif; font-size:13px; font-weight:600; color:#1a1d23; transition:.15s; }
	.week-nav-center:hover { border-color:#3cb96b; background:#f0faf4; }
	.week-current-badge { font-size:10px; font-weight:700; color:#3cb96b; background:#edf9f2; padding:2px 8px; border-radius:12px; }

	/* ─── TODAY HIGHLIGHT ─── */
	.today-col { background:#f0faf4; }
	th.today-col { color:#3cb96b !important; font-weight:800 !important; }

	/* ─── PICKER MODAL ─── */
	.picker-tabs { display:flex; gap:6px; margin-bottom:12px; }
	.picker-tab { flex:1; padding:8px 10px; border-radius:8px; border:1.5px solid #e8eaed; background:#fff; font-size:12px; font-weight:600; color:#8b909a; cursor:pointer; transition:.15s; font-family:'Tajawal',sans-serif; }
	.picker-tab.active { border-color:#3cb96b; background:#edf9f2; color:#3cb96b; }

	/* ─── MODALS ─── */
	.overlay {
		position: fixed;
		inset: 0;
		background: rgba(15, 23, 42, 0.52);
		z-index: 600;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.modal {
		background: #ffffff;
		background-color: #ffffff;
		border-radius: 16px;
		padding: 26px;
		max-width: 440px;
		width: 92%;
		max-height: 85vh;
		overflow-y: auto;
		box-shadow: 0 12px 48px rgba(0, 0, 0, 0.18);
		font-family: 'Tajawal', sans-serif;
		position: relative;
		z-index: 1;
		isolation: isolate;
		-webkit-backface-visibility: hidden;
		backface-visibility: hidden;
	}
	.recipe-item { display:flex; align-items:center; gap:10px; padding:10px 12px; border:1.5px solid #e8eaed; border-radius:9px; cursor:pointer; transition:.13s; font-family:'Tajawal',sans-serif; min-height:44px; }
	.recipe-item:hover { border-color:#3cb96b; background:#edf9f2; }
	.diet-tag { padding:7px 14px; border-radius:20px; border:1.5px solid #e8eaed; background:#fff; font-size:12.5px; font-weight:600; color:#8b909a; cursor:pointer; transition:.15s; user-select:none; font-family:'Tajawal',sans-serif; }
	.diet-tag:hover { border-color:#3cb96b; color:#3cb96b; }
	.diet-tag.on { background:#edf9f2; color:#3cb96b; border-color:#c5edd8; }
	.btn-close { flex:1; padding:11px; border-radius:9px; border:1.5px solid #e8eaed; background:#fff; font-size:13px; font-weight:600; cursor:pointer; color:#8b909a; font-family:'Tajawal',sans-serif; }
	.btn-close:hover { background:#f4f6f9; }

	/* ─── DIAGNOSIS RECS ─── */
	.diag-recs-card { background:#fffdf0; border:1.5px solid #fde68a; border-radius:12px; padding:14px 16px; margin-top:10px; }

	/* ─── MICRO BARS ─── */
	.micro-item { display:flex; align-items:center; gap:7px; font-size:11px; margin-bottom:7px; }
	.micro-name { width:76px; flex-shrink:0; color:#1a1d23; font-weight:500; font-size:10.5px; }
	.micro-track { flex:1 1 0; min-width:0; min-height:5px; height:5px; background:#e8eaed; border-radius:3px; overflow:hidden; }
	.chart-meal-ring { display:block; margin:0 auto; filter:drop-shadow(0 2px 5px rgba(16,24,40,.07)); }
	.micro-nums { font-size:9.5px; color:#8b909a; white-space:nowrap; min-width:48px; text-align:end; flex-shrink:0; }

	/* ─── MEAL DETAIL TABLE ─── */
	.mdt { width:100%; min-width:300px; border-collapse:collapse; font-size:11px; }
	.mdt th { font-size:10px; color:#8b909a; font-weight:700; text-align:center; padding:5px 3px 6px; border-bottom:1.5px solid #e8eaed; }
	.mdt th:first-child { text-align:right; }
	.mdt td { text-align:center; padding:5px 3px; border-bottom:1px solid #e8eaed; }
	.mdt td:first-child { text-align:right; font-weight:600; font-size:10.5px; color:#8b909a; }

	/* ─── SAVE STATUS ─── */
	.save-indicator { display:inline-flex; align-items:center; gap:5px; font-size:11px; font-weight:500; padding:3px 10px; border-radius:20px; transition:all .3s; }
	.save-saving { color:#f59e0b; background:#fffbeb; }
	.save-saved { color:#3cb96b; background:#edf9f2; }
	.save-dot { width:6px; height:6px; border-radius:50%; }
	.save-dot-saving { background:#f59e0b; animation:pulse 1s infinite; }
	.save-dot-saved { background:#3cb96b; }
	@keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:.4; } }

	/* ─── AI PROGRESS ─── */
	.ai-progress-indeterminate {
		height: 100%;
		width: 40%;
		background: linear-gradient(90deg, #7c3aed, #a855f7);
		border-radius: 99px;
		animation: ai-slide 1.4s ease-in-out infinite;
	}
	@keyframes ai-slide {
		0%   { transform: translateX(-100%); }
		50%  { transform: translateX(200%); }
		100% { transform: translateX(200%); }
	}
	.ai-day-dot {
		width: 28px;
		height: 4px;
		border-radius: 99px;
		background: #c4b5fd;
		animation: ai-dot-pulse 1.4s ease-in-out infinite;
	}
	.ai-day-dot:nth-child(1) { animation-delay: 0s; }
	.ai-day-dot:nth-child(2) { animation-delay: .2s; }
	.ai-day-dot:nth-child(3) { animation-delay: .4s; }
	.ai-day-dot:nth-child(4) { animation-delay: .6s; }
	.ai-day-dot:nth-child(5) { animation-delay: .8s; }
	.ai-day-dot:nth-child(6) { animation-delay: 1s; }
	.ai-day-dot:nth-child(7) { animation-delay: 1.2s; }
	@keyframes ai-dot-pulse {
		0%,100% { background: #e9d5ff; }
		50%      { background: #7c3aed; }
	}

	/* ─── TOPBAR (desktop: back | identity(name+extras) | save — mobile: back+save row, identity full width) ─── */
	.topbar {
		background: rgba(255, 255, 255, 0.97);
		border-bottom: 1px solid #e8eaed;
		backdrop-filter: blur(10px);
		box-shadow: 0 1px 0 rgba(255, 255, 255, 0.85) inset, 0 8px 24px -12px rgba(15, 23, 42, 0.06);
		padding: 0 28px;
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		grid-template-areas: 'back identity save';
		align-items: center;
		column-gap: 16px;
		row-gap: 8px;
		min-height: 60px;
		height: auto;
		flex-shrink: 0;
		position: sticky;
		top: 0;
		z-index: 100;
	}
	.topbar-identity {
		grid-area: identity;
		display: flex;
		align-items: center;
		gap: 12px;
		min-width: 0;
	}
	.topbar-back-link {
		grid-area: back;
		justify-self: start;
		color:#667085;
		text-decoration:none;
		font-size:13px;
		font-weight:600;
		display:flex;
		align-items:center;
		gap:6px;
		padding:6px 10px;
		border-radius:10px;
		transition:all .15s;
		border:1px solid #e8edf3;
		background:#fff;
	}
	.topbar-back-link:hover {
		color:#1f9e57;
		background:#f0faf4;
		border-color:#cdebd9;
	}
	.topbar-patient-name {
		flex: 1 1 auto;
		min-width: 0;
		font-size: 17px;
		font-weight: 800;
		color: #1f2937;
		letter-spacing: -0.02em;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.topbar-extras {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
		justify-content: flex-end;
		flex: 0 1 auto;
		min-width: 0;
	}
	.topbar-save-btn {
		grid-area: save;
		justify-self: end;
		touch-action: manipulation;
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 8px 16px;
		border-radius: 9px;
		border: none;
		background: #3cb96b;
		color: #fff;
		font-size: 13px;
		font-weight: 700;
		cursor: pointer;
		font-family: 'Tajawal', sans-serif;
		transition: background 0.15s ease, opacity 0.15s ease;
	}
	.topbar-save-btn:hover:not(:disabled) {
		background: #2ea55d;
	}
	.topbar-save-btn:focus-visible {
		outline: 2px solid #166534;
		outline-offset: 2px;
	}
	.topbar-save-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	/* ─── VALIDATION BANNER ─── */
	@keyframes slideDown { from { opacity:0; transform:translateY(-8px); } to { opacity:1; transform:translateY(0); } }

	/* ─── AI MEAL EDIT MODAL ─── */
	.ai-meal-modal {
		max-width: min(720px, 96vw) !important;
		width: 100%;
		padding: 0 !important;
		overflow: hidden;
		display: flex;
		flex-direction: column;
		max-height: min(92vh, 880px);
		border: 1px solid #e4e9e4;
		box-shadow: 0 24px 80px rgba(18, 24, 22, 0.14);
		animation: ai-meal-modal-in 0.35s cubic-bezier(0.22, 1, 0.36, 1) both;
		background: #ffffff;
		background-color: #ffffff;
		isolation: isolate;
		-webkit-backface-visibility: hidden;
		backface-visibility: hidden;
	}
	@keyframes ai-meal-modal-in {
		from { opacity: 0; transform: scale(0.97) translateY(10px); }
		to { opacity: 1; transform: scale(1) translateY(0); }
	}
	.ai-meal-modal-hd {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 18px 22px;
		border-bottom: 1px solid #eef1ee;
		background: #ffffff;
		background-color: #ffffff;
		flex-shrink: 0;
	}
	.ai-meal-modal-hd-inner {
		display: flex;
		align-items: center;
		gap: 10px;
		min-width: 0;
	}
	.ai-meal-badge {
		font-size: 10px;
		font-weight: 800;
		letter-spacing: 0.06em;
		color: #5b4a9e;
		background: linear-gradient(145deg, #f3f0ff, #ebe4ff);
		padding: 4px 10px;
		border-radius: 8px;
		border: 1px solid #ddd6fe;
		flex-shrink: 0;
	}
	.ai-meal-modal-title {
		font-family: 'El Messiri', 'Tajawal', serif;
		font-size: 1.15rem;
		font-weight: 700;
		margin: 0;
		color: #121816;
	}
	.ai-meal-modal-x {
		border: none;
		background: #f3f5f2;
		cursor: pointer;
		padding: 8px;
		color: #5c6560;
		line-height: 1;
		border-radius: 10px;
		transition: background 0.15s ease, color 0.15s ease;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.ai-meal-modal-x:hover {
		background: #e8ece9;
		color: #121816;
	}
	.ai-meal-modal-x:focus-visible {
		outline: 2px solid #2a9d62;
		outline-offset: 2px;
	}
	.ai-meal-body {
		overflow-y: auto;
		padding: 20px 22px;
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 20px;
		background: #ffffff;
		background-color: #ffffff;
	}
	.ai-meal-label {
		font-size: 11px;
		font-weight: 700;
		color: #5c6560;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		display: block;
		margin-bottom: 8px;
	}
	.ai-meal-name-inp {
		width: 100%;
		border: 1.5px solid #e2e8e4;
		border-radius: 12px;
		padding: 12px 14px;
		font-size: 15px;
		font-family: 'Tajawal', sans-serif;
		font-weight: 600;
		color: #121816;
		outline: none;
		box-sizing: border-box;
		background: #faf9f6;
		transition: border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
	}
	.ai-meal-name-inp:hover {
		border-color: #c5cdc7;
	}
	.ai-meal-name-inp:focus {
		border-color: #2a9d62;
		box-shadow: 0 0 0 4px rgba(42, 157, 98, 0.12);
		background: #fff;
	}
	/* Compact totals — one strip */
	.ai-meal-totals {
		display: flex;
		gap: 0;
		border-radius: 14px;
		overflow: hidden;
		border: 1px solid #e2e8e4;
		box-shadow: 0 2px 12px rgba(18, 24, 22, 0.04);
	}
	.ai-meal-total-seg {
		flex: 1;
		text-align: center;
		padding: 10px 8px;
		min-width: 0;
	}
	.ai-meal-total-seg + .ai-meal-total-seg {
		border-inline-start: 1px solid rgba(226, 232, 228, 0.9);
	}
	.ai-meal-total-seg.cal {
		background: linear-gradient(180deg, #ecf8f0 0%, #e0f3e8 100%);
	}
	.ai-meal-total-seg.prot {
		background: linear-gradient(180deg, #fff5f5 0%, #ffecec 100%);
	}
	.ai-meal-total-seg.carb {
		background: linear-gradient(180deg, #f0f7ff 0%, #e8f2ff 100%);
	}
	.ai-meal-total-seg.fat {
		background: linear-gradient(180deg, #fffbeb 0%, #fff4e0 100%);
	}
	.ai-meal-total-val {
		display: block;
		font-size: clamp(15px, 2.8vw, 17px);
		font-weight: 800;
		font-variant-numeric: tabular-nums;
		line-height: 1.2;
	}
	.ai-meal-total-seg.cal .ai-meal-total-val { color: #15803d; }
	.ai-meal-total-seg.prot .ai-meal-total-val { color: #dc2626; }
	.ai-meal-total-seg.carb .ai-meal-total-val { color: #2563eb; }
	.ai-meal-total-seg.fat .ai-meal-total-val { color: #d97706; }
	.ai-meal-total-lbl {
		display: block;
		font-size: 10px;
		font-weight: 700;
		color: #5c6560;
		margin-top: 3px;
	}
	.ai-ing-section-hd {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 10px;
		flex-wrap: wrap;
	}
	.ai-ing-section-title {
		font-size: 11px;
		font-weight: 700;
		color: #5c6560;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
	.ai-ing-add {
		font-size: 12.5px;
		font-weight: 700;
		color: #1f7a4a;
		border: 1.5px solid #9dd4b3;
		background: linear-gradient(180deg, #f0faf4, #e6f4eb);
		border-radius: 10px;
		padding: 8px 14px;
		cursor: pointer;
		font-family: 'Tajawal', sans-serif;
		transition: box-shadow 0.2s ease, transform 0.15s ease;
		white-space: nowrap;
	}
	.ai-ing-add:hover {
		box-shadow: 0 4px 14px rgba(42, 157, 98, 0.2);
	}
	.ai-ing-add:active {
		transform: scale(0.98);
	}
	.ai-ing-add:focus-visible {
		outline: 2px solid #2a9d62;
		outline-offset: 2px;
	}
	.ai-ing-scroll {
		overflow-x: auto;
		margin: 0 -6px;
		padding: 0 6px;
		-webkit-overflow-scrolling: touch;
	}
	.ai-ing-table {
		min-width: 620px;
		display: flex;
		flex-direction: column;
		gap: 0;
	}
	.ai-ing-head,
	.ai-ing-row {
		display: grid;
		grid-template-columns: minmax(120px, 1.35fr) 76px 64px 72px 64px 64px 64px 40px;
		gap: 8px;
		align-items: stretch;
	}
	.ai-ing-head {
		padding: 0 0 8px;
		border-bottom: 2px solid #e2e8e4;
		margin-bottom: 8px;
	}
	.ai-ing-th {
		font-size: 10px;
		font-weight: 800;
		color: #5c6560;
		text-align: center;
		line-height: 1.3;
		padding: 4px 2px;
	}
	.ai-ing-th.name {
		text-align: right;
		padding-inline-end: 4px;
	}
	.ai-ing-th.m-cal { color: #b45309; }
	.ai-ing-th.m-prot { color: #dc2626; }
	.ai-ing-th.m-carb { color: #2563eb; }
	.ai-ing-th.m-fat { color: #15803d; }
	.ai-ing-th.del {
		color: transparent;
		user-select: none;
	}
	.ai-ing-row {
		padding: 10px 0;
		border-bottom: 1px solid #f0f3f0;
	}
	.ai-ing-row:last-child {
		border-bottom: none;
	}
	.ai-ing-inp {
		border: 1.5px solid #e2e8e4;
		border-radius: 10px;
		padding: 10px 10px;
		font-size: 13px;
		font-family: 'Tajawal', sans-serif;
		color: #121816;
		outline: none;
		min-width: 0;
		width: 100%;
		box-sizing: border-box;
		background: #faf9f6;
		transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
		min-height: 44px;
	}
	.ai-ing-inp:hover {
		border-color: #c5cdc7;
	}
	.ai-ing-inp:focus {
		background: #fff;
		box-shadow: 0 0 0 3px rgba(42, 157, 98, 0.12);
	}
	.ai-ing-inp.name:focus {
		border-color: #2a9d62;
	}
	.ai-ing-inp.qty,
	.ai-ing-inp.unit {
		text-align: center;
		font-variant-numeric: tabular-nums;
	}
	.ai-ing-inp.m-cal {
		border-color: #fde68a;
		color: #b45309;
		font-weight: 700;
	}
	.ai-ing-inp.m-cal:focus {
		border-color: #f59e0b;
		box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.15);
	}
	.ai-ing-inp.m-prot {
		border-color: #fecaca;
		color: #dc2626;
		font-weight: 700;
	}
	.ai-ing-inp.m-prot:focus {
		border-color: #ef4444;
		box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.12);
	}
	.ai-ing-inp.m-carb {
		border-color: #bfdbfe;
		color: #2563eb;
		font-weight: 700;
	}
	.ai-ing-inp.m-carb:focus {
		border-color: #3b82f6;
		box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.12);
	}
	.ai-ing-inp.m-fat {
		border-color: #bbf7d0;
		color: #15803d;
		font-weight: 700;
	}
	.ai-ing-inp.m-fat:focus {
		border-color: #22c55e;
		box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.12);
	}
	.ai-ing-rm {
		border: none;
		background: #f3f5f2;
		cursor: pointer;
		color: #94a3b0;
		padding: 0;
		line-height: 1;
		border-radius: 10px;
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 44px;
		transition: background 0.15s ease, color 0.15s ease;
	}
	.ai-ing-rm:hover {
		background: #fef2f2;
		color: #dc2626;
	}
	.ai-ing-rm:focus-visible {
		outline: 2px solid #ef4444;
		outline-offset: 2px;
	}
	.ai-ing-empty {
		text-align: center;
		padding: 28px 16px;
		color: #8b9490;
		font-size: 13px;
		border: 2px dashed #e2e8e4;
		border-radius: 14px;
		background: #faf9f6;
		line-height: 1.55;
	}
	.ai-meal-steps {
		width: 100%;
		border: 1.5px solid #e2e8e4;
		border-radius: 14px;
		padding: 14px 16px;
		font-size: 14px;
		font-family: 'Tajawal', sans-serif;
		color: #121816;
		outline: none;
		resize: vertical;
		min-height: 140px;
		box-sizing: border-box;
		line-height: 1.7;
		background: #faf9f6;
		transition: border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
	}
	.ai-meal-steps:hover {
		border-color: #c5cdc7;
	}
	.ai-meal-steps:focus {
		border-color: #2a9d62;
		box-shadow: 0 0 0 4px rgba(42, 157, 98, 0.1);
		background: #fff;
	}
	.ai-meal-ft {
		display: flex;
		gap: 12px;
		padding: 16px 22px 20px;
		border-top: 1px solid #eef1ee;
		flex-shrink: 0;
		background: #ffffff;
		background-color: #ffffff;
	}
	.ai-meal-btn-cancel {
		flex: 1;
		padding: 13px 16px;
		border-radius: 12px;
		border: 1.5px solid #e2e8e4;
		background: #fff;
		color: #5c6560;
		font-size: 14px;
		font-weight: 700;
		cursor: pointer;
		font-family: 'Tajawal', sans-serif;
		transition: background 0.15s ease, border-color 0.15s ease;
	}
	.ai-meal-btn-cancel:hover {
		background: #f3f5f2;
		border-color: #c5cdc7;
	}
	.ai-meal-btn-cancel:focus-visible {
		outline: 2px solid #2a9d62;
		outline-offset: 2px;
	}
	.ai-meal-btn-save {
		flex: 1.8;
		padding: 13px 16px;
		border-radius: 12px;
		border: none;
		background: linear-gradient(165deg, #34b16f 0%, #2a9d62 45%, #1f7a4a 100%);
		color: #fff;
		font-size: 14px;
		font-weight: 700;
		cursor: pointer;
		font-family: 'Tajawal', sans-serif;
		box-shadow: 0 4px 18px rgba(42, 157, 98, 0.3);
		transition: box-shadow 0.2s ease, transform 0.15s ease;
	}
	.ai-meal-btn-save:hover {
		box-shadow: 0 8px 28px rgba(42, 157, 98, 0.38);
	}
	.ai-meal-btn-save:active {
		transform: scale(0.99);
	}
	.ai-meal-btn-save:focus-visible {
		outline: 2px solid #166534;
		outline-offset: 3px;
	}

	/* ─── RESPONSIVE: TABLET ─── */
	@media (max-width: 1024px) {
		.builder-wrap { flex-direction: column; padding: 16px; gap: 16px; align-items: stretch; }
		.right-panel { width: 100%; }
		.chart-card { position: static; max-height: none; }
	}

	/* ─── RESPONSIVE: MOBILE / NARROW (matches dietitian shell ≤900px) ─── */
	@media (max-width: 900px) {
		.builder-wrap { padding: 12px max(10px, env(safe-area-inset-left, 0px)) max(10px, env(safe-area-inset-right, 0px)); gap: 12px; min-height: auto; }
		.form-card { padding: 14px 16px; border-radius: 14px; margin-bottom: 12px; }
		.plan-grid-card { padding: 14px 12px; margin-top: 10px; }
		.chart-card { padding: 14px 12px; border-radius: 14px; }
		.modal { max-width:100%; width:100%; height:100dvh; border-radius:16px 16px 0 0; max-height:100dvh; margin:0; align-self:flex-end; }
		.overlay { align-items:flex-end; }
		.plan-table { border-spacing: 4px; }
		.plan-table-weekly {
			/* Wider day columns on touch: easier to read while horizontal scrolling */
			min-width: 880px;
		}
		.plan-table th {
			font-size: 9px;
			padding: 6px 2px 2px;
		}
		.plan-corner-th {
			width: 64px !important;
		}
		.plan-meal-label-cell {
			width: 58px !important;
			font-size: 9px !important;
			padding: 0 4px !important;
			white-space: normal !important;
			line-height: 1.25;
			hyphens: auto;
		}
		.meal-cell {
			min-height: 0;
			border-radius: 8px;
		}
		.meal-card-hero {
			height: 38px;
			font-size: 11px;
		}
		.meal-cell .meal-card {
			height: auto;
			min-height: 0;
			display: flex;
			flex-direction: column;
		}
		.meal-card-body {
			flex: 1;
			min-height: 0;
			padding: 4px 5px 5px;
		}
		.meal-card-name {
			font-size: 10px;
			font-weight: 700;
			white-space: normal;
			display: -webkit-box;
			-webkit-box-orient: vertical;
			-webkit-line-clamp: 3;
			line-clamp: 3;
			overflow: hidden;
			line-height: 1.3;
		}
		.meal-card-cals {
			font-size: 9px;
			font-weight: 600;
			color: #64748b;
		}
		.meal-slot-placeholder {
			height: 76px;
			gap: 2px;
		}
		.meal-slot-placeholder > div:first-child {
			font-size: 20px !important;
		}
		.meal-slot-placeholder > div:last-child {
			font-size: 9px !important;
		}
		.meal-cell .cell-actions {
			position: static;
			display: flex !important;
			flex-direction: row;
			flex-wrap: nowrap;
			align-items: center;
			justify-content: stretch;
			gap: 4px;
			margin-top: 2px;
			padding: 3px 4px 5px;
			box-sizing: border-box;
			width: 100%;
		}
		.meal-cell:hover .cell-actions {
			display: flex !important;
		}
		.cell-btn {
			min-height: 32px;
			min-width: 0;
			padding: 4px 6px;
			font-size: 10px;
			border-radius: 7px;
			box-sizing: border-box;
			touch-action: manipulation;
		}
		.cell-btn-edit {
			flex: 1 1 0;
			min-width: 0;
			justify-content: center;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}
		.cell-btn-swap {
			flex: 0 0 32px;
			width: 32px;
			height: 32px;
			min-width: 32px;
			padding: 0;
			font-size: 13px;
			line-height: 1;
		}
		.cell-btn-del {
			flex: 0 0 32px;
			width: 32px;
			height: 32px;
			min-width: 32px;
			padding: 0;
			font-size: 15px;
			line-height: 1;
		}
		.plan-scroll {
			margin-inline: -8px;
			padding-inline: 8px;
			padding-bottom: 8px;
			scroll-padding-inline: 8px;
			-webkit-overflow-scrolling: touch;
			overscroll-behavior-x: contain;
		}
		.meal-chip { padding:10px 12px; font-size:13px; min-height: 48px; }
		.tag-btn { padding:7px 12px; font-size:13px; }
		.macro-pill-pct { font-size:18px; }
		.meal-type-grid { grid-template-columns: repeat(2, 1fr); gap: 8px; }
		.topbar {
			grid-template-columns: minmax(0, 1fr) auto;
			grid-template-areas:
				'back save'
				'identity identity';
			padding: 10px max(12px, env(safe-area-inset-left, 0px)) 12px max(12px, env(safe-area-inset-right, 0px));
			min-height: 0;
			column-gap: 10px;
			row-gap: 10px;
			align-items: center;
		}
		.topbar-identity {
			flex-direction: column;
			align-items: stretch;
			gap: 6px;
		}
		.topbar-identity .topbar-patient-name {
			flex: 0 1 auto;
		}
		.topbar-back-link {
			grid-area: back;
			font-size: 12px;
			padding: 0 12px;
			min-height: 44px;
			border-radius: 12px;
			justify-self: start;
			align-self: center;
		}
		.topbar-patient-name {
			font-size: 15px;
			font-weight: 800;
			white-space: nowrap;
			line-height: 1.25;
		}
		.topbar-extras {
			justify-content: flex-start;
			flex-wrap: wrap;
			gap: 6px;
			row-gap: 6px;
		}
		.topbar-save-btn {
			grid-area: save;
			justify-self: end;
			align-self: center;
			flex-shrink: 0;
			min-height: 44px;
			padding: 0 16px;
			font-size: 13px;
			border-radius: 12px;
			box-shadow: 0 2px 10px rgba(60, 185, 107, 0.28);
		}
		.plan-switch { padding:4px; gap:6px; }
		.plan-btn { font-size:13px; padding:9px; }
		.slider::-webkit-slider-thumb { width:22px; height:22px; }
		.week-nav { gap:4px; flex-wrap: wrap; }
		.week-nav-center { padding:6px 12px; font-size:12px; max-width: 100%; text-align: center; }
		.week-nav-arrow { width:32px; height:32px; }
		.picker-tabs { flex-wrap:wrap; }
		.micro-name { width: 64px; font-size: 10px; }
		.ai-meal-modal { max-height: 100dvh; border-radius: 16px 16px 0 0; }
		.ai-meal-total-seg { padding: 8px 4px; }
		.ai-meal-total-lbl { font-size: 9px; }
		.ai-ing-table { min-width: 580px; }
		.ai-ing-head,
		.ai-ing-row {
			grid-template-columns: minmax(100px, 1.2fr) 68px 56px 64px 56px 56px 56px 38px;
			gap: 6px;
		}
		.ai-ing-inp { min-height: 48px; font-size: 16px; }
		.ai-meal-name-inp { font-size: 16px; }
		.cal-target-stats { row-gap: 8px; }
		.cal-target-stats > div { flex: 1 1 30%; text-align: center; }
		.cal-target-stats .stat-end { text-align: center; }
	}

	@media (max-width: 420px) {
		.meal-type-grid { grid-template-columns: 1fr; }
		.calories-row { flex-direction: column; align-items: stretch; }
		.kcal-suffix { padding: 8px 12px; }
		.macro-pill-row .macro-pill { flex: 1 1 100%; }
		.topbar-patient-name {
			font-size: 14px;
		}
		.topbar-back-link {
			padding: 0 10px;
			font-size: 11px;
			gap: 4px;
		}
		.topbar-save-btn {
			padding: 0 14px;
			font-size: 12px;
		}
	}
</style>

<!-- ─── TOPBAR ─── -->
<div class="topbar">
	<a href="/dietitian/meal-plan" class="topbar-back-link" aria-label="العودة إلى العملاء">
		<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
		العملاء
	</a>
	<div class="topbar-identity">
		<span class="topbar-patient-name" title={data.patient.name}>{data.patient.name}</span>
		{#if planValidation.status !== 'pass' || saveStatus === 'saving' || saveStatus === 'saved'}
			<div class="topbar-extras">
				{#if planValidation.status !== 'pass'}
					<span style="display:inline-flex; align-items:center; gap:4px; font-size:11px; font-weight:700; padding:4px 12px; border-radius:20px;
						background:{planValidation.status === 'fail' ? '#fef2f2' : '#fffbeb'};
						color:{planValidation.status === 'fail' ? '#dc2626' : '#d97706'};">
						<span style="width:7px; height:7px; border-radius:50%; background:{planValidation.status === 'fail' ? '#dc2626' : '#d97706'};"></span>
						{planValidation.status === 'fail' ? 'يوجد مشاكل' : 'تنبيهات'}
					</span>
				{/if}
				{#if saveStatus === 'saving' || saveStatus === 'saved'}
					<div class="save-indicator" class:save-saving={saveStatus === 'saving'} class:save-saved={saveStatus === 'saved'}>
						{#if saveStatus === 'saving'}
							<span class="save-dot save-dot-saving"></span>
							جاري الحفظ…
						{:else}
							<span class="save-dot save-dot-saved"></span>
							تم الحفظ
						{/if}
					</div>
				{/if}
			</div>
		{/if}
	</div>
	<button type="button" class="topbar-save-btn" onclick={() => doSave()} disabled={saveStatus === 'saving'}>
		<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
		حفظ
	</button>
</div>

{#if planValidation.status !== 'pass' && (planValidation.exclusionWarnings.length > 0 || planValidation.restrictionWarnings.length > 0 || !planValidation.macroValid)}
	<div
		class="validation-banner"
		style="background:{planValidation.status === 'fail' ? '#fef2f2' : '#fffbeb'};
		border:1.5px solid {planValidation.status === 'fail' ? '#fca5a5' : '#fde68a'};"
	>
		<span style="font-size:12px; font-weight:800; color:{planValidation.status === 'fail' ? '#dc2626' : '#d97706'}; flex-shrink:0;">
			{planValidation.status === 'fail' ? '⛔ تحذير خطير' : '⚠️ يوجد تنبيهات'}
		</span>
		{#if planValidation.exclusionWarnings.length > 0}
			<span style="font-size:11.5px; color:#991b1b; background:#fee2e2; padding:3px 10px; border-radius:8px; font-weight:600;">
				{planValidation.exclusionWarnings.length} وجبة تحتوي أطعمة مستثناة
			</span>
		{/if}
		{#each planValidation.restrictionWarnings as rw}
			<span style="font-size:11.5px; color:#92400e; background:#fef3c7; padding:3px 10px; border-radius:8px; font-weight:600;">
				{rw.label}: {rw.isMinimum ? 'أقل من الحد الأدنى' : 'تجاوز الحد'} ({Math.round(rw.actual)}/{rw.limit} {rw.unit})
			</span>
		{/each}
		{#if !planValidation.macroValid}
			<span style="font-size:11.5px; color:#92400e; background:#fef3c7; padding:3px 10px; border-radius:8px; font-weight:600;">
				مجموع المغذيات الكبرى ≠ 100%
			</span>
		{/if}
	</div>
{/if}

<div class="builder-wrap">

	<!-- ─── FORM PANEL (LEFT) ─── -->
	<div class="form-panel">

		<!-- 1. Plan Type -->
		<div class="form-card" style="padding-bottom:12px;">
			<div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
				<div class="field-label" style="margin-bottom:0;">إعدادات الخطة</div>
				<div style="display:flex; align-items:center; background:#f0f2f5; border-radius:10px; padding:3px; gap:2px;">
					<button
						onclick={() => { planType = 'daily'; viewWeekStart = todayStr(); }}
						style="padding:5px 14px; border-radius:8px; border:none; font-size:12px; font-weight:700; font-family:'Tajawal',sans-serif; cursor:pointer; transition:.15s;
							background:{planType === 'daily' ? '#fff' : 'transparent'};
							color:{planType === 'daily' ? '#1f9e57' : '#8b909a'};
							box-shadow:{planType === 'daily' ? '0 1px 4px rgba(0,0,0,.08)' : 'none'};">
						يومية
					</button>
					<button
						onclick={() => { planType = 'weekly'; viewWeekStart = snapToSunday(todayStr()); }}
						style="padding:5px 14px; border-radius:8px; border:none; font-size:12px; font-weight:700; font-family:'Tajawal',sans-serif; cursor:pointer; transition:.15s;
							background:{planType === 'weekly' ? '#fff' : 'transparent'};
							color:{planType === 'weekly' ? '#7c3aed' : '#8b909a'};
							box-shadow:{planType === 'weekly' ? '0 1px 4px rgba(0,0,0,.08)' : 'none'};">
						أسبوعية
					</button>
				</div>
			</div>
		</div>

		<!-- 2. Diagnosis -->
		<div class="form-card">
			<div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
				<div class="field-label" style="margin-bottom:0;">التشخيص</div>
				<button
					type="button"
					style="font-size:12px; font-weight:700; color:#1f9e57; border:1.5px solid #cbeed9; background:#edf9f2; border-radius:8px; padding:7px 10px; cursor:pointer; font-family:'Tajawal',sans-serif;"
					onclick={() => { resetCreateDiagForm(); showCreateDiagModal = true; }}
				>
					+ إضافة تشخيص
				</button>
			</div>
			<div style="position:relative;" class="diag-drop-zone">
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div class="sel-box" onclick={() => (showDiagDrop = !showDiagDrop)}>
					{#if selectedDiags.length === 0}
						<span class="diag-placeholder">اختر التشخيص المناسب للحالة…</span>
					{/if}
					{#each selectedDiags as diagId}
						{@const d = diagnosisLookup().get(diagId)}
						{#if d}
							<span class="chip">
								<button
									type="button"
									style="border:none; background:none; padding:0; margin:0; color:inherit; font:inherit; cursor:pointer; text-decoration:underline; text-decoration-thickness:1px;"
									onclick={(e) => { e.stopPropagation(); toggleDiagDetails(d.id); }}
								>
									{d.label}
								</button>
								<button class="chip-x" onclick={(e) => { e.stopPropagation(); toggleDiag(diagId); }}>×</button>
							</span>
						{/if}
					{/each}
					<span class="sel-chevron" aria-hidden="true">▾</span>
				</div>
				{#if showDiagDrop}
					<div class="dropdown">
						{#each diagnosisOptions() as d}
							<button class="drop-item" class:selected={selectedDiags.includes(d.id)} onclick={() => { toggleDiag(d.id); showDiagDrop = false; }}>
								<span>{d.label}</span>
								{#if selectedDiags.includes(d.id)}
									<span class="drop-item-check">محدد</span>
								{/if}
							</button>
						{/each}
					</div>
				{/if}
			</div>

			{#if selectedDiags.length > 0}
				<div class="diag-recs-card">
					<div style="display:flex; align-items:center; gap:7px; margin-bottom:10px;">
						<span style="font-size:11.5px; font-weight:700; color:#92400e; text-transform:uppercase; letter-spacing:.4px;">التفاصيل والتوصيات</span>
					</div>
					{#each selectedDiags as diagId}
						{@const d = diagnosisLookup().get(diagId)}
						{#if d}
							<div style="border:1px solid #fde68a; border-radius:10px; background:#fff; margin-bottom:10px;">
								<div style="display:flex; align-items:center; justify-content:space-between; gap:8px; padding:8px 10px;">
									<button
										type="button"
										style="border:none; background:none; padding:0; margin:0; font-size:12.5px; font-weight:800; color:#1a1d23; cursor:pointer; display:flex; align-items:center; gap:6px;"
										onclick={() => toggleDiagDetails(d.id)}
									>
										<span>{expandedDiagIds.includes(d.id) ? '▾' : '▸'}</span>
										<span>{d.label}</span>
									</button>
									{#if customDiags.some((x) => x.id === d.id)}
										<button type="button" class="cell-btn cell-btn-edit" onclick={() => startEditDiagnosis(d.id)}>تعديل</button>
									{/if}
								</div>
								{#if expandedDiagIds.includes(d.id)}
									<div style="padding:0 10px 10px;">
										{#if 'severity' in d}
											<div class="diag-info-grid" style="margin-bottom:8px;">
												<div><div class="diag-info-label">الكود</div><div class="diag-info-value">{d.code || '—'}</div></div>
												<div><div class="diag-info-label">الشدة</div><div class="diag-info-value">{d.severity === 'mild' ? 'خفيف' : d.severity === 'moderate' ? 'متوسط' : d.severity === 'severe' ? 'شديد' : '—'}</div></div>
												<div><div class="diag-info-label">تاريخ التشخيص</div><div class="diag-info-value">{d.diagnosedDate || '—'}</div></div>
												<div><div class="diag-info-label">الحالة</div><div class="diag-info-value">{d.status === 'active' ? 'نشط' : d.status === 'resolved' ? 'تم العلاج' : d.status === 'managed' ? 'تحت السيطرة' : '—'}</div></div>
											</div>
											<div class="diag-info-label">الملاحظات</div>
											<div style="font-size:12px; color:#374151; line-height:1.6;">{d.notes || '—'}</div>
										{:else if d.recs?.length}
											{#each d.recs as rec}
												<div style="display:flex; gap:8px; font-size:12.5px; color:#44403c; margin-bottom:5px; line-height:1.55;">
													<span style="color:#d97706; font-weight:700; flex-shrink:0;">•</span>
													<span>{rec}</span>
												</div>
											{/each}
										{:else}
											<div style="font-size:12px; color:#8b909a;">لا توجد تفاصيل إضافية.</div>
										{/if}
									</div>
								{/if}
							</div>
						{/if}
					{/each}
				</div>
				<div style="margin-top:12px; padding-top:12px; border-top:1px solid #fde68a;">
					<div style="font-size:10.5px; font-weight:700; color:#92400e; text-transform:uppercase; letter-spacing:.4px; margin-bottom:6px;">ملاحظات الأخصائي</div>
					<textarea bind:value={diagNotes} placeholder="أضف ملاحظاتك الخاصة هنا…" style="width:100%; border:1.5px solid #fde68a; border-radius:8px; padding:8px 10px; font-size:12.5px; font-family:'Tajawal',sans-serif; resize:vertical; min-height:72px; outline:none; color:#44403c; background:#fffdf0; box-sizing:border-box;"></textarea>
				</div>
			{/if}
		</div>

		<!-- 3. Calories -->
		<div class="form-card">
			<div class="field-label">احتياج السعرات</div>
			<div class="calories-row">
				<input type="number" class="cal-input" placeholder="مثال: 1800" bind:value={targetCalories} min="0" max="10000" inputmode="numeric" />
				<span class="kcal-suffix">kcal/d</span>
			</div>
			{#if targetCalories > 0}
				<div style="font-size:10.5px; color:#8b909a; margin-top:6px;">
					{targetCalories < 1200 ? '⚠️ أقل من الحد الأدنى الآمن (1200 سعرة)' : targetCalories > 5000 ? '⚠️ مرتفع جداً — تأكد من صحة القيمة' : `سيتم توزيع ${targetCalories} سعرة على الوجبات المحددة`}
				</div>
			{/if}
		</div>

		<!-- 4. Excluded Foods -->
		<div class="form-card">
			<div class="field-label">الأطعمة المستثناة</div>
			<div style="position:relative;" class="exc-drop-zone">
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div class="sel-box" onclick={() => (showExcDrop = !showExcDrop)}>
					{#if excludedFoods.length === 0}
						<span style="color:#b0b5c0; font-size:13px;">اختر الأطعمة المستثناة…</span>
					{/if}
					{#each excludedFoods as item}
						<span class="chip">
							{item}
							<button class="chip-x" onclick={(e) => { e.stopPropagation(); toggleExcluded(item); }}>×</button>
						</span>
					{/each}
					<span class="sel-chevron" aria-hidden="true">▾</span>
				</div>
				{#if showExcDrop}
					<div class="dropdown">
						<div style="padding:5px 12px 2px; font-size:10px; font-weight:700; color:#92400e; letter-spacing:.4px; background:#fffbf5; border-radius:8px 8px 0 0;">مسببات الحساسية</div>
						{#each ALLERGEN_OPTS as allergen}
							<button class="drop-item {excludedFoods.includes(allergen.value) ? 'selected' : ''}" onclick={() => toggleExcluded(allergen.value)}>
								{allergen.value}
								{#if excludedFoods.includes(allergen.value)}<span class="drop-item-check">✓</span>{/if}
							</button>
						{/each}
					</div>
				{/if}
			</div>
		</div>

		<!-- 5. Macros -->
		<div class="form-card">
			<div class="macro-header-row" style="font-size:12px; font-weight:600; color:#8b909a; margin-bottom:14px;">
				<span>توزيع المغذيات الكبرى</span>
				<span style="font-size:11px; padding:3px 10px; border-radius:20px; font-weight:700; transition:all .2s;
				background:{macros.c + macros.p + macros.f === 100 ? '#edf9f2' : '#fef2f2'};
				color:{macros.c + macros.p + macros.f === 100 ? '#3cb96b' : '#dc2626'};">
				المجموع: {macros.c + macros.p + macros.f}%
				{#if macros.c + macros.p + macros.f !== 100}
					(يجب 100%)
				{/if}
			</span>
			</div>

			<div class="macro-pill-row">
				<div class="macro-pill" style="background:#eef4ff;">
					<div class="macro-pill-pct" style="color:#4e9af1;">{macros.c}%</div>
					<div style="font-size:11px; font-weight:600; color:#8b909a;">كارب</div>
					<div style="font-size:10px; color:#b0b5c0;">{mg.carbG ? mg.carbG + 'g' : '–'}</div>
				</div>
				<div class="macro-pill" style="background:#fff0f0;">
					<div class="macro-pill-pct" style="color:#ef4444;">{macros.p}%</div>
					<div style="font-size:11px; font-weight:600; color:#8b909a;">بروتين</div>
					<div style="font-size:10px; color:#b0b5c0;">{mg.protG ? mg.protG + 'g' : '–'}</div>
				</div>
				<div class="macro-pill" style="background:#fffbeb;">
					<div class="macro-pill-pct" style="color:#f59e0b;">{macros.f}%</div>
					<div style="font-size:11px; font-weight:600; color:#8b909a;">دهون</div>
					<div style="font-size:10px; color:#b0b5c0;">{mg.fatG ? mg.fatG + 'g' : '–'}</div>
				</div>
			</div>

			<div class="macro-slider-row">
				<div style="width:8px; height:8px; border-radius:50%; background:#4e9af1; flex-shrink:0;"></div>
				<div style="width:46px; font-size:12px; font-weight:600; color:#1a1d23;">كارب</div>
				<input type="range" class="slider" min="0" max="100" value={macros.c} oninput={(e) => onSlider('c', +(e.target as HTMLInputElement).value)} style="background:linear-gradient(to left, #4e9af1 0%, #4e9af1 {macros.c}%, #e8eaed {macros.c}%);" />
			</div>
			<div class="macro-slider-row">
				<div style="width:8px; height:8px; border-radius:50%; background:#ef4444; flex-shrink:0;"></div>
				<div style="width:46px; font-size:12px; font-weight:600; color:#1a1d23;">بروتين</div>
				<input type="range" class="slider" min="0" max="100" value={macros.p} oninput={(e) => onSlider('p', +(e.target as HTMLInputElement).value)} style="background:linear-gradient(to left, #ef4444 0%, #ef4444 {macros.p}%, #e8eaed {macros.p}%);" />
			</div>
			<div class="macro-slider-row">
				<div style="width:8px; height:8px; border-radius:50%; background:#f59e0b; flex-shrink:0;"></div>
				<div style="width:46px; font-size:12px; font-weight:600; color:#1a1d23;">دهون</div>
				<input type="range" class="slider" min="0" max="100" value={macros.f} oninput={(e) => onSlider('f', +(e.target as HTMLInputElement).value)} style="background:linear-gradient(to left, #f59e0b 0%, #f59e0b {macros.f}%, #e8eaed {macros.f}%);" />
			</div>
		</div>

		<!-- 6. Meal Selection -->
		<div class="form-card">
			<div class="field-label" style="margin-bottom:4px">تخصيص الخطة</div>
			<div style="font-size:10.5px; color:#8b909a; margin-bottom:10px; line-height:1.4;">
				الشريط الجانبي: يوجد وجبة في {planType === 'weekly' ? 'الأسبوع المعروض' : 'اليوم المعروض'}. الوجبات ذات المحتوى تُرتّب أولاً.
			</div>
			<div class="meal-type-grid">
				{#each sortedMealTypesForChips() as m}
					<button
						type="button"
						class="meal-chip"
						class:on={selectedMeals.includes(m.id)}
						class:in-view-period={mealTypesUsedInView().has(m.id)}
						title={mealTypesUsedInView().has(m.id)
							? planType === 'weekly'
								? 'موجود في هذا الأسبوع'
								: 'موجود في هذا اليوم'
							: ''}
						onclick={() => toggleMeal(m.id)}
					>
						<span style="flex:1;">{m.label}</span>
						<span style="width:22px; height:22px; border-radius:50%; border:2px solid {selectedMeals.includes(m.id) ? '#3cb96b' : '#e8eaed'}; background:{selectedMeals.includes(m.id) ? '#3cb96b' : '#fff'}; display:flex; align-items:center; justify-content:center; font-size:13px; color:{selectedMeals.includes(m.id) ? '#fff' : 'transparent'};"></span>
					</button>
				{/each}
			</div>
		</div>

		<!-- Plan Grid -->
		<div class="form-card plan-grid-card">
			<div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; gap:10px; flex-wrap:wrap;">
				<div style="display:flex; align-items:center; gap:8px;">
					<div class="field-label" style="margin-bottom:0;">الخطة الغذائية</div>
					{#if todayDayIdx() >= 0}
						<span class="week-current-badge">{planType === 'weekly' ? 'هذا الأسبوع' : 'اليوم'}</span>
					{/if}
				</div>
				{#if Object.values(plan).some(day => Object.keys(day).length > 0)}
					<button style="font-size:11px; padding:5px 12px; border-radius:7px; border:1.5px solid #e8eaed; background:#f4f6f9; color:#8b909a; cursor:pointer; font-family:'Tajawal',sans-serif; font-weight:600; transition:.15s;"
						onclick={() => { for (const dateKey of dayDates()) { plan[dateKey] = {}; } plan = { ...plan }; }}
						onmouseenter={(e) => { (e.currentTarget as HTMLElement).style.borderColor='#ef4444'; (e.currentTarget as HTMLElement).style.color='#ef4444'; }}
						onmouseleave={(e) => { (e.currentTarget as HTMLElement).style.borderColor='#e8eaed'; (e.currentTarget as HTMLElement).style.color='#8b909a'; }}>
						مسح الكل
					</button>
				{/if}
			</div>

			<!-- Day / Week Navigator -->
			<div class="week-nav">
				<button class="week-nav-arrow" onclick={() => goNav(-1)} title={planType === 'weekly' ? 'الأسبوع السابق' : 'اليوم السابق'}>
					<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg>
				</button>
				<div class="week-nav-center" aria-live="polite">
					<span>{navRangeLabel()}</span>
				</div>
				<button class="week-nav-arrow" onclick={() => goNav(1)} title={planType === 'weekly' ? 'الأسبوع القادم' : 'اليوم القادم'}>
					<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>
				</button>
			</div>

			{#if displayMealTypes().length === 0}
				<div style="text-align:center; padding:32px 16px; color:#b0b5c0; font-size:13px; font-weight:600; border:2px dashed #e8eaed; border-radius:12px;">
					<div style="font-size:28px; margin-bottom:8px; opacity:.5;">🍽️</div>
					اختر نوع الوجبات من القائمة أعلاه لبدء بناء الخطة
				</div>
			{:else}
			<div class="plan-scroll">
				<table class="plan-table" class:plan-table-weekly={planType === 'weekly'}>
					<thead>
						<tr>
							<th class="plan-corner-th" style="width:80px;"></th>
							{#each dayLabels() as d, i}
								<th class:today-col={todayDayIdx() === i}>{d}</th>
							{/each}
						</tr>
					</thead>
					<tbody>
						{#each displayMealTypes() as mealType}
							{@const mealInfo = MEAL_TYPES.find((m) => m.id === mealType)}
							<tr>
								<td class="plan-meal-label-cell" style="font-size:10px; font-weight:700; color:#8b909a; text-transform:uppercase; letter-spacing:.5px; white-space:nowrap; padding:0 6px; vertical-align:middle; width:72px;">
									{mealInfo?.label}
								</td>
								{#each dayDates() as dateKey, i}
									{@const slot = plan[dateKey]?.[mealType]}
									{@const info = slot ? getSlotInfo(slot) : null}
									{#if info}
										<td class="meal-cell" class:today-col={todayDayIdx() === i} style="border:2px solid {todayDayIdx() === i ? '#3cb96b' : '#d9dce3'}; padding:0; position:relative;">
											<!-- svelte-ignore a11y_click_events_have_key_events -->
											<!-- svelte-ignore a11y_no_static_element_interactions -->
											<div class="meal-card" style="cursor:pointer;" onclick={() => {
												if (slot?.recipeId) openRecipeDetail(slot.recipeId);
												else if (slot?.aiMeal) openAiMealEdit(dateKey, mealType, slot.aiMeal);
											}}>
												<div class="meal-card-hero" style="background:{info.type === 'ai' ? 'linear-gradient(135deg,#f3e8ff,#e8dfff)' : info.type === 'supplement' ? 'linear-gradient(135deg,#f0ebff,#e8dfff)' : info.type === 'food' ? 'linear-gradient(135deg,#fff9ed,#fde68a44)' : info.type === 'recipe' && info.imageUrl ? '#e8edf3' : 'linear-gradient(135deg,#edf9f2,#c5edd8)'}; color:{info.type === 'ai' ? '#7c3aed' : info.type === 'supplement' ? '#7c5cbf' : info.type === 'food' ? '#d97706' : '#16a34a'};">
													{#if info.type === 'recipe' && info.imageUrl}
														<img src={info.imageUrl} alt="" style="position:absolute; inset:0; width:100%; height:100%; object-fit:cover;" />
														<span style="position:relative; z-index:1; background:rgba(255,255,255,.88); padding:2px 8px; border-radius:6px; font-size:11px; font-weight:700; color:#16a34a; box-shadow:0 1px 4px rgba(0,0,0,.08);">وصفة</span>
													{:else}
														{info.type === 'ai' ? 'AI' : info.type === 'supplement' ? 'مكمل' : info.type === 'food' ? 'طعام' : 'وصفة'}
													{/if}
												</div>
												<div class="meal-card-body">
													<div class="meal-card-name">{info.name}</div>
													<div class="meal-card-cals">{Math.round(info.calories)} سعرة</div>
												</div>
											</div>
											<div class="cell-actions">
												<button class="cell-btn cell-btn-edit" title="استبدال" onclick={(e) => { e.stopPropagation(); openPicker(mealType, dateKey); }}>تعديل</button>
												{#if planType === 'weekly'}
													<button class="cell-btn cell-btn-swap" title="تبديل" onclick={(e) => { e.stopPropagation(); openSwap(mealType, dateKey); }}>⇄</button>
												{/if}
												<button class="cell-btn cell-btn-del" title="حذف" onclick={(e) => { e.stopPropagation(); removeSlot(dateKey, mealType); }}>×</button>
											</div>
										</td>
									{:else}
										<!-- svelte-ignore a11y_click_events_have_key_events -->
										<!-- svelte-ignore a11y_no_static_element_interactions -->
										<td class="meal-cell" class:today-col={todayDayIdx() === i} onclick={() => openPicker(mealType, dateKey)}>
											<div class="meal-slot-placeholder">
												<div style="font-size:24px; color:#d0d4db;">+</div>
												<div style="font-size:10px; color:#b0b5c0;">أضف وجبة</div>
											</div>
										</td>
									{/if}
								{/each}
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</div>

		<!-- Generate Button -->
		<div style="display:flex; gap:8px; margin-top:16px;">
			<button
				style="flex:1; padding:14px; border-radius:10px; border:none; background:linear-gradient(135deg,#7c3aed,#a855f7); color:#fff; font-size:15px; font-weight:700; cursor:pointer; transition:.15s; letter-spacing:.2px; font-family:'Tajawal',sans-serif; {!selectedMeals.length || (!targetCalories && planCalc.totals.calories <= 0) ? 'opacity:.5; cursor:not-allowed;' : ''}"
				disabled={!selectedMeals.length || (!targetCalories && planCalc.totals.calories <= 0)}
				onclick={() => { aiExtraNote = ''; aiError = ''; showAiModal = true; }}
			>
				{#if !targetCalories && planCalc.totals.calories <= 0}
					حدد السعرات أولاً
				{:else if !selectedMeals.length}
					اختر الوجبات أولاً
				{:else}
					إنشاء بالذكاء الاصطناعي
				{/if}
			</button>
		</div>
	</div>

	<!-- ─── RIGHT SUMMARY PANEL ─── -->
	<div class="right-panel">
		<div class="chart-card">
			<div style="font-size:13px; font-weight:700; color:#1a1d23; margin-bottom:14px;">ملخص الخطة الغذائية</div>

			<!-- Calorie Card -->
			<div style="background:linear-gradient(135deg, #3cb96b 0%, #2ea55d 100%); border-radius:10px; padding:14px 16px; color:#fff; margin-bottom:10px;">
				<div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:10px;">
					<span style="font-size:11px; font-weight:600; opacity:.85;">السعرات الحرارية</span>
					<span style="font-size:16px; font-weight:800;">{Math.round(effectiveTargetCalories)} سعرة</span>
				</div>
				{#if usingImplicitCalorieGoal}
					<div style="font-size:9.5px; opacity:0.82; margin:-4px 0 8px; line-height:1.35;">
						لم يُحفظ هدف سعرات في الخطة — يُعرض هدف تقديري من مجموع الوجبات الحالي
					</div>
				{/if}
				<div style="height:7px; background:rgba(255,255,255,.3); border-radius:4px; overflow:hidden; margin-bottom:9px;">
					<div style="height:100%; background:#fff; border-radius:4px; transition:width .4s ease; width:{pctDone}%;"></div>
				</div>
				<div class="cal-target-stats">
					<div class="stat-start" style="display:flex; flex-direction:column; gap:1px;">
						<span style="font-size:13px; font-weight:800;">{Math.round(planCalc.totals.calories)}</span>
						<span>مستهلك</span>
					</div>
					<div class="stat-mid" style="display:flex; flex-direction:column; gap:1px;">
						<span style="font-size:13px; font-weight:800;">{pctDone}%</span>
						<span>من الهدف</span>
					</div>
					<div class="stat-end" style="display:flex; flex-direction:column; gap:1px;">
						<span style="font-size:13px; font-weight:800;">{Math.round(remaining)}</span>
						<span>متبقي</span>
					</div>
				</div>
			</div>

			<!-- Macro Grams -->
			<div class="chart-macro-row">
				<div style="flex:1; border-radius:9px; padding:10px 6px 8px; text-align:center; border:1.5px solid #c5d9fb; background:#eef4ff;">
					<div style="font-size:17px; font-weight:800; color:#4e9af1; margin-bottom:1px;">{mg.carbG}g</div>
					<div style="font-size:10px; color:#8b909a; font-weight:600; margin-bottom:5px;">كارب</div>
					<div style="font-size:9.5px; color:#8b909a; margin-bottom:4px;">{Math.round(planCalc.totals.carbs)} / {mg.carbG} g</div>
					<div style="height:4px; background:#e8eaed; border-radius:2px; overflow:hidden;">
						<div style="height:100%; border-radius:2px; background:#4e9af1; transition:width .4s; width:{mg.carbG > 0 ? Math.min(100, Math.round((planCalc.totals.carbs / mg.carbG) * 100)) : 0}%;"></div>
					</div>
				</div>
				<div style="flex:1; border-radius:9px; padding:10px 6px 8px; text-align:center; border:1.5px solid #fbbcbc; background:#fff0f0;">
					<div style="font-size:17px; font-weight:800; color:#ef4444; margin-bottom:1px;">{mg.protG}g</div>
					<div style="font-size:10px; color:#8b909a; font-weight:600; margin-bottom:5px;">بروتين</div>
					<div style="font-size:9.5px; color:#8b909a; margin-bottom:4px;">{Math.round(planCalc.totals.protein)} / {mg.protG} g</div>
					<div style="height:4px; background:#e8eaed; border-radius:2px; overflow:hidden;">
						<div style="height:100%; border-radius:2px; background:#ef4444; transition:width .4s; width:{mg.protG > 0 ? Math.min(100, Math.round((planCalc.totals.protein / mg.protG) * 100)) : 0}%;"></div>
					</div>
				</div>
				<div style="flex:1; border-radius:9px; padding:10px 6px 8px; text-align:center; border:1.5px solid #fde68a; background:#fffbf0;">
					<div style="font-size:17px; font-weight:800; color:#f59e0b; margin-bottom:1px;">{mg.fatG}g</div>
					<div style="font-size:10px; color:#8b909a; font-weight:600; margin-bottom:5px;">دهون</div>
					<div style="font-size:9.5px; color:#8b909a; margin-bottom:4px;">{Math.round(planCalc.totals.fat)} / {mg.fatG} g</div>
					<div style="height:4px; background:#e8eaed; border-radius:2px; overflow:hidden;">
						<div style="height:100%; border-radius:2px; background:#f59e0b; transition:width .4s; width:{mg.fatG > 0 ? Math.min(100, Math.round((planCalc.totals.fat / mg.fatG) * 100)) : 0}%;"></div>
					</div>
				</div>
			</div>

			<div class="divider"></div>

			<!-- Meal Donuts (only types with calories in the viewed day/week) -->
			<div style="margin-bottom:12px;">
				<div style="font-size:11px; font-weight:700; color:#8b909a; text-transform:uppercase; letter-spacing:.4px; margin-bottom:9px;">الوجبات</div>
				{#if displayMealTypes().length === 0}
					<div style="text-align:center; color:#8b909a; font-size:11px; padding:6px 0;">لا توجد وجبات محددة بعد</div>
				{:else if chartMealTypes().length === 0}
					<div style="text-align:center; color:#8b909a; font-size:11px; padding:6px 0; line-height:1.45;">
						لا توجد وجبات مسجّلة بسعرات في {planType === 'weekly' ? 'هذا الأسبوع' : 'هذا اليوم'} — أضف وجبات في الجدول أو انتقل إلى فترة فيها بيانات.
					</div>
				{:else}
					<div style="display:flex; flex-wrap:wrap; gap:8px;">
						{#each chartMealTypes() as mealType, mi}
							{@const mealInfo = MEAL_TYPES.find((m) => m.id === mealType)}
							{@const mt = planCalc.mealTotals[mealType]}
							{@const mealPct = planCalc.totals.calories && mt ? Math.round((mt.calories / planCalc.totals.calories) * 100) : 0}
							{@const ringR = 17}
							{@const ringC = 2 * Math.PI * ringR}
							{@const ringOff = ringC * (1 - Math.min(100, mealPct) / 100)}
							{@const ringHue = (135 + mi * 42) % 360}
							<div class="chart-meal-ring-wrap" style="text-align:center; min-width:58px;">
								<svg
									class="chart-meal-ring"
									viewBox="0 0 44 44"
									width="52"
									height="52"
									role="img"
									aria-label={`${mealInfo?.label ?? 'وجبة'} · ${mealPct}% من إجمالي السعرات`}
								>
									<circle cx="22" cy="22" r={ringR} fill="none" stroke="#e8edf3" stroke-width="5" />
									<circle
										cx="22"
										cy="22"
										r={ringR}
										fill="none"
										stroke={`hsl(${ringHue} 52% 46%)`}
										stroke-width="5"
										stroke-linecap="round"
										stroke-dasharray={ringC}
										stroke-dashoffset={ringOff}
										transform="rotate(-90 22 22)"
										style="transition: stroke-dashoffset 0.45s ease, stroke 0.25s ease;"
									/>
								</svg>
								<div style="font-size:11px; font-weight:700; color:#1a1d23; margin-top:2px;">{mealPct}%</div>
								<div style="font-size:10px; color:#8b909a; margin-top:3px; font-weight:500;">{mealInfo?.label}</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>

			<div class="divider"></div>

			<!-- Micronutrients -->
			<div style="margin-bottom:12px;">
				<div style="font-size:11px; font-weight:700; color:#8b909a; text-transform:uppercase; letter-spacing:.4px; margin-bottom:9px;">المغذيات الصغرى</div>
				{#each microData.slice(0, 5) as micro}
					{@const barColor = micro.pct >= 80 ? '#3cb96b' : micro.pct >= 50 ? '#f59e0b' : '#ef4444'}
					<div class="micro-item">
						<div class="micro-name">{micro.label}</div>
						<div class="micro-track">
							<div style="height:100%; border-radius:3px; background:{barColor}; width:{micro.pct}%; transition:width .4s;"></div>
						</div>
						<div class="micro-nums">{micro.val}/{micro.rda}{micro.unit}</div>
					</div>
				{/each}
				{#if microExpanded}
					{#each microData.slice(5) as micro}
						{@const barColor = micro.pct >= 80 ? '#3cb96b' : micro.pct >= 50 ? '#f59e0b' : '#ef4444'}
						<div class="micro-item">
							<div class="micro-name">{micro.label}</div>
							<div class="micro-track">
								<div style="height:100%; border-radius:3px; background:{barColor}; width:{micro.pct}%; transition:width .4s;"></div>
							</div>
							<div class="micro-nums">{micro.val}/{micro.rda}{micro.unit}</div>
						</div>
					{/each}
				{/if}
				<button onclick={() => (microExpanded = !microExpanded)} style="width:100%; border:1.5px solid #e8eaed; border-radius:8px; background:#fff; color:#8b909a; font-size:11px; font-weight:600; padding:6px; cursor:pointer; margin-top:4px; transition:.15s; font-family:'Tajawal',sans-serif;">
					{microExpanded ? 'عرض أقل ▲' : 'عرض المزيد ▼'}
				</button>
			</div>

			<div class="divider"></div>

			<!-- Meal Detail Table -->
			<div style="font-size:11px; font-weight:700; color:#8b909a; text-transform:uppercase; letter-spacing:.4px; margin-bottom:8px;">تفاصيل الوجبات</div>
			<div class="mdt-scroll">
				<table class="mdt">
					<thead>
						<tr>
							<th>الوجبة</th>
							<th>سعرات</th>
							<th>كارب</th>
							<th>بروتين</th>
							<th>دهون</th>
						</tr>
					</thead>
					<tbody>
						{#if displayMealTypes().length === 0}
							<tr><td colspan="5" style="text-align:center; color:#8b909a; padding:10px;">لا توجد وجبات في الخطة بعد</td></tr>
						{:else if chartMealTypes().length === 0}
							<tr><td colspan="5" style="text-align:center; color:#8b909a; padding:10px;">لا بيانات سعرات للوجبات في {planType === 'weekly' ? 'هذا الأسبوع' : 'هذا اليوم'}</td></tr>
						{:else}
							{#each chartMealTypes() as mealType}
								{@const mealInfo = MEAL_TYPES.find((m) => m.id === mealType)}
								{@const mt = planCalc.mealTotals[mealType]}
								<tr>
									<td>{mealInfo?.label}</td>
									<td>{mt ? Math.round(mt.calories) : 0}</td>
									<td>{mt ? Math.round(mt.carbs) : 0}g</td>
									<td>{mt ? Math.round(mt.protein) : 0}g</td>
									<td>{mt ? Math.round(mt.fat) : 0}g</td>
								</tr>
							{/each}
						{/if}
					</tbody>
					<tfoot>
						<tr style="font-weight:700; background:#f4f6f9; border-top:1.5px solid #e8eaed;">
							<td>المجموع</td>
							<td>{Math.round(planCalc.totals.calories)}</td>
							<td>{Math.round(planCalc.totals.carbs)}g</td>
							<td>{Math.round(planCalc.totals.protein)}g</td>
							<td>{Math.round(planCalc.totals.fat)}g</td>
						</tr>
					</tfoot>
				</table>
			</div>

			<div class="divider"></div>

			<!-- Tracking -->
			<a
				href="/dietitian/meal-plan/{data.session.id}/tracking?type={planType}&date={viewWeekStart}"
				style="width:100%; margin-top:8px; padding:10px; border-radius:8px; border:1.5px solid #c5edd8; background:#edf9f2; color:#1f9e57; font-size:13px; font-weight:600; cursor:pointer; font-family:'Tajawal',sans-serif; display:flex; align-items:center; justify-content:center; gap:6px; transition:all .15s; text-decoration:none; box-sizing:border-box;"
				onmouseenter={(e) => { (e.currentTarget as HTMLAnchorElement).style.background='#d6f5e6'; (e.currentTarget as HTMLAnchorElement).style.borderColor='#3cb96b'; }}
				onmouseleave={(e) => { (e.currentTarget as HTMLAnchorElement).style.background='#edf9f2'; (e.currentTarget as HTMLAnchorElement).style.borderColor='#c5edd8'; }}
			>
				<svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
				</svg>
				تتبع المريض
			</a>
		</div>
	</div>
</div>
</div>

<!-- ─── MODALS (outside closeDropdowns wrapper so overlays/buttons are not affected) ─── -->

<!-- Recipe/Food/Supplement Picker -->
{#if showRecipePicker}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="overlay" onclick={(e) => e.target === e.currentTarget && (showRecipePicker = false)}>
		<div class="modal">
			<div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:4px;">
				<h2 style="font-size:16px; font-weight:700; margin:0;">إضافة / استبدال وجبة</h2>
				<button onclick={() => (showRecipePicker = false)} style="background:none; border:none; font-size:20px; cursor:pointer; color:#8b909a; padding:4px; line-height:1;">×</button>
			</div>
			<p style="font-size:12px; color:#8b909a; margin:0 0 12px;">
				{MEAL_TYPES.find((m) => m.id === pickerContext!.mealType)?.label}
				{#if planType === 'weekly'} · {dayLabels()[dayDates().indexOf(pickerContext!.dateKey)]}{/if}
			</p>
			<div class="picker-tabs">
				<button class="picker-tab" class:active={pickerTab === 'recipe'} onclick={() => { pickerTab = 'recipe'; pickerSearch = ''; }}>وصفات ({data.recipes.length})</button>
				<button class="picker-tab" class:active={pickerTab === 'supplement'} onclick={() => { pickerTab = 'supplement'; pickerSearch = ''; pickerSupplCategory = 'all'; }}>مكملات ({data.supplements.length})</button>
			</div>

			{#if pickerTab === 'supplement'}
				<div style="display:flex; flex-wrap:wrap; gap:4px; margin-bottom:10px;">
					{#each [
						{ key: 'all', label: 'الكل' },
						{ key: 'standard', label: 'قياسي' },
						{ key: 'fiber', label: 'ألياف' },
						{ key: 'clear_ons', label: 'شفاف' },
						{ key: 'high_calorie', label: 'عالي السعرات' },
						{ key: 'diabetic', label: 'سكري' },
						{ key: 'renal', label: 'كلوي' },
						{ key: 'hepatic', label: 'كبدي' },
						{ key: 'pulmonary', label: 'رئوي' },
						{ key: 'surgery', label: 'جراحي' },
						{ key: 'semielemental', label: 'شبه عنصري' }
					] as cat}
						<button
							style="padding:3px 9px; border-radius:12px; border:1.5px solid {pickerSupplCategory === cat.key ? '#3cb96b' : '#e8eaed'}; background:{pickerSupplCategory === cat.key ? '#edf9f2' : '#fff'}; color:{pickerSupplCategory === cat.key ? '#3cb96b' : '#8b909a'}; font-size:11px; font-weight:600; cursor:pointer; font-family:'Tajawal',sans-serif; transition:.13s; white-space:nowrap;"
							onclick={() => pickerSupplCategory = cat.key}>
							{cat.label}
						</button>
					{/each}
				</div>
			{/if}

			<input type="text" bind:value={pickerSearch} placeholder="ابحث في القائمة…" style="width:100%; border:1.5px solid #e8eaed; border-radius:9px; padding:9px 12px; font-size:13px; outline:none; margin-bottom:10px; font-family:'Tajawal',sans-serif; box-sizing:border-box;" />
			<div style="max-height:280px; overflow-y:auto; display:flex; flex-direction:column; gap:5px;">
				{#each pickerItems() as item}
					<button class="recipe-item" onclick={() => pickItem(item)}>
						{#if item.type === 'recipe' && 'imageUrl' in item && item.imageUrl}
							<img src={item.imageUrl} alt="" style="width:40px;height:40px;object-fit:cover;border-radius:8px;flex-shrink:0;border:1px solid #e8eaed;" />
						{:else if item.type === 'supplement'}
							<div style="width:40px; height:40px; flex-shrink:0; border-radius:9px; background:linear-gradient(135deg,#f3e8ff,#ede9fe); display:flex; flex-direction:column; align-items:center; justify-content:center; gap:1px;">
								<span style="font-size:11px; font-weight:800; color:#7c3aed; line-height:1;">{(item as any).kcalPerMl ?? '—'}</span>
								<span style="font-size:7.5px; color:#9d6bef; font-weight:600; line-height:1; letter-spacing:.2px;">kcal/mL</span>
							</div>
						{:else}
							<div style="width:40px; height:40px; flex-shrink:0; border-radius:9px; background:linear-gradient(135deg,#edf9f2,#c5edd8); display:flex; align-items:center; justify-content:center;">
								<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3cb96b" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
							</div>
						{/if}
						<div style="flex:1; min-width:0;">
							<div style="font-size:12.5px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">{item.nameAr}</div>
							<div style="font-size:10px; color:#8b909a; margin-top:2px; display:flex; gap:5px; flex-wrap:wrap; align-items:center;">
								{#if item.protein}<span>بروتين: {Math.round(item.protein)}g</span>{/if}
								{#if item.carbs}<span>كارب: {Math.round(item.carbs)}g</span>{/if}
								{#if item.fat}<span>دهون: {Math.round(item.fat)}g</span>{/if}
								{#if (item as any).volumeMl}<span style="color:#64748b;">{(item as any).volumeMl} mL</span>{/if}
								{#if (item as any).fiber}<span style="color:#059669; font-weight:600;">ألياف: {(item as any).fiber}g</span>{/if}
								{#if (item as any).osmolarity}<span style="color:#94a3b8;">{(item as any).osmolarity} mOsm/L</span>{/if}
							</div>
						</div>
						<div style="font-size:11px; color:#3cb96b; font-weight:700; white-space:nowrap; text-align:left;">{Math.round(item.calories)} kcal</div>
					</button>
				{:else}
					<div style="text-align:center; padding:24px; color:#8b909a; font-size:13px;">لا توجد نتائج مطابقة</div>
				{/each}
			</div>
			<div style="margin-top:12px;">
				<button class="btn-close" onclick={() => (showRecipePicker = false)} style="width:100%;">إلغاء</button>
			</div>
		</div>
	</div>
{/if}

<!-- Meal Detail -->
{#if showMealDetail && detailRecipe}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="overlay" onclick={(e) => e.target === e.currentTarget && (showMealDetail = false)}>
		<div class="modal" style="max-width:560px;">
			<h2 style="font-size:17px; font-weight:700; margin:0 0 4px;">{detailRecipe.nameAr ?? detailRecipe.name}</h2>
			<p style="font-size:12.5px; color:#8b909a; margin:0 0 6px;">
				{detailRecipe.portions ? detailRecipe.portions + ' حصة' : ''}{detailRecipe.source === 'internal' ? ' - يدوية' : ''}
			</p>
			{#if detailRecipe.imageUrl}
				<div style="margin:10px 0 14px; border-radius:10px; overflow:hidden; border:1px solid #e8eaed;">
					<img src={detailRecipe.imageUrl} alt="" style="width:100%; height:160px; object-fit:cover; display:block;" />
				</div>
			{/if}
			{#if detailNutrients}
				<div style="display:flex; gap:8px; margin-bottom:18px; margin-top:10px;">
					<div style="flex:1; background:linear-gradient(135deg,#edf9f2,#d4f0e0); border-radius:9px; padding:10px 8px; text-align:center;">
						<div style="font-size:18px; font-weight:800; color:#16a34a;">{Math.round(detailNutrients.calories ?? 0)}</div>
						<div style="font-size:10px; color:#6b7280; margin-top:2px;">سعرة</div>
					</div>
					<div style="flex:1; background:#f4f6f9; border-radius:9px; padding:10px 8px; text-align:center;">
						<div style="font-size:17px; font-weight:700; color:#ef4444;">{Math.round(detailNutrients.protein ?? 0)}g</div>
						<div style="font-size:10px; color:#8b909a; margin-top:2px;">بروتين</div>
					</div>
					<div style="flex:1; background:#f4f6f9; border-radius:9px; padding:10px 8px; text-align:center;">
						<div style="font-size:17px; font-weight:700; color:#4e9af1;">{Math.round(detailNutrients.carbs ?? 0)}g</div>
						<div style="font-size:10px; color:#8b909a; margin-top:2px;">كارب</div>
					</div>
					<div style="flex:1; background:#f4f6f9; border-radius:9px; padding:10px 8px; text-align:center;">
						<div style="font-size:17px; font-weight:700; color:#f59e0b;">{Math.round(detailNutrients.fat ?? 0)}g</div>
						<div style="font-size:10px; color:#8b909a; margin-top:2px;">دهون</div>
					</div>
				</div>
			{/if}
			{#if detailRecipe.ingredientDetails?.length}
				<div style="font-size:12px; font-weight:700; color:#8b909a; text-transform:uppercase; letter-spacing:.4px; margin-bottom:6px;">المكونات ({detailRecipe.ingredientDetails.length})</div>
				<div style="background:#f4f6f9; border-radius:8px; padding:8px 12px; margin-bottom:16px;">
					{#each detailRecipe.ingredientDetails as ing}
						<div style="display:flex; justify-content:space-between; padding:5px 0; border-bottom:1px solid #e8eaed; font-size:12.5px;">
							<span style="color:#1a1d23; font-weight:500;">{ing.name}</span>
							<span style="color:#8b909a; font-size:11px;">{ing.quantity} {ing.unit}</span>
						</div>
					{/each}
				</div>
			{/if}
			{#if detailRecipe.steps}
				<div style="font-size:12px; font-weight:700; color:#8b909a; text-transform:uppercase; letter-spacing:.4px; margin-bottom:6px;">طريقة التحضير</div>
				<div style="font-size:12.5px; color:#4b5563; line-height:1.65; background:#f4f6f9; border-radius:8px; padding:10px 12px; margin-bottom:16px; white-space:pre-wrap;">{detailRecipe.steps}</div>
			{/if}
			<button class="btn-close" onclick={() => (showMealDetail = false)} style="width:100%;">إغلاق</button>
		</div>
	</div>
{/if}

<!-- AI Meal Edit Modal -->
{#if showAiMealEdit && aiMealEditCtx}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="overlay" onclick={(e) => { if (e.target === e.currentTarget) { showAiMealEdit = false; aiMealEditCtx = null; } }}>
		<div class="modal ai-meal-modal" dir="rtl">
			<header class="ai-meal-modal-hd">
				<div class="ai-meal-modal-hd-inner">
					<span class="ai-meal-badge">AI</span>
					<h2 class="ai-meal-modal-title">تعديل الوجبة</h2>
				</div>
				<button
					type="button"
					class="ai-meal-modal-x"
					aria-label="إغلاق"
					title="إغلاق"
					onclick={() => { showAiMealEdit = false; aiMealEditCtx = null; }}
				>
					<svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
				</button>
			</header>

			<div class="ai-meal-body">
				<div>
					<label for="ai-meal-edit-name" class="ai-meal-label">اسم الوجبة</label>
					<input
						id="ai-meal-edit-name"
						bind:value={aiMealEditName}
						type="text"
						class="ai-meal-name-inp"
						placeholder="اسم الوجبة بالعربي"
					/>
				</div>

				{#each [aiMealEditTotal()] as tot}
					<div class="ai-meal-totals" aria-label="إجمالي القيم الغذائية للوجبة">
						<div class="ai-meal-total-seg cal">
							<span class="ai-meal-total-val">{Math.round(tot.calories)}</span>
							<span class="ai-meal-total-lbl">سعرة</span>
						</div>
						<div class="ai-meal-total-seg prot">
							<span class="ai-meal-total-val">{Math.round(tot.protein)}g</span>
							<span class="ai-meal-total-lbl">بروتين</span>
						</div>
						<div class="ai-meal-total-seg carb">
							<span class="ai-meal-total-val">{Math.round(tot.carbs)}g</span>
							<span class="ai-meal-total-lbl">كارب</span>
						</div>
						<div class="ai-meal-total-seg fat">
							<span class="ai-meal-total-val">{Math.round(tot.fat)}g</span>
							<span class="ai-meal-total-lbl">دهون</span>
						</div>
					</div>
				{/each}

				<div>
					<div class="ai-ing-section-hd">
						<span class="ai-ing-section-title">المكونات ({aiMealEditIngredients.length})</span>
						<button type="button" class="ai-ing-add" onclick={addAiIngredient}>+ إضافة مكون</button>
					</div>

					{#if aiMealEditIngredients.length > 0}
						<div class="ai-ing-scroll">
							<div class="ai-ing-table">
								<div class="ai-ing-head" role="row">
									<span class="ai-ing-th name">المكون</span>
									<span class="ai-ing-th">كمية</span>
									<span class="ai-ing-th">وحدة</span>
									<span class="ai-ing-th m-cal">kcal</span>
									<span class="ai-ing-th m-prot">بروتين</span>
									<span class="ai-ing-th m-carb">كارب</span>
									<span class="ai-ing-th m-fat">دهون</span>
									<span class="ai-ing-th del" aria-hidden="true">&#8203;</span>
								</div>
								{#each aiMealEditIngredients as ing, i}
									<div class="ai-ing-row" role="row">
										<input
											bind:value={ing.name_ar}
											class="ai-ing-inp name"
											type="text"
											placeholder="اسم المكون"
											aria-label="اسم المكون"
										/>
										<input
											bind:value={ing.quantity}
											class="ai-ing-inp qty"
											type="number"
											min="0"
											step="any"
											placeholder="—"
											dir="ltr"
											aria-label="الكمية"
										/>
										<input
											bind:value={ing.unit}
											class="ai-ing-inp unit"
											type="text"
											placeholder="g"
											aria-label="الوحدة"
										/>
										<input
											bind:value={ing.calories}
											class="ai-ing-inp m-cal"
											type="number"
											min="0"
											step="any"
											dir="ltr"
											title="سعرات"
											aria-label="السعرات"
										/>
										<input
											bind:value={ing.protein}
											class="ai-ing-inp m-prot"
											type="number"
											min="0"
											step="any"
											dir="ltr"
											title="بروتين بالغرام"
											aria-label="البروتين بالغرام"
										/>
										<input
											bind:value={ing.carbs}
											class="ai-ing-inp m-carb"
											type="number"
											min="0"
											step="any"
											dir="ltr"
											title="الكربوهيدرات بالغرام"
											aria-label="الكربوهيدرات بالغرام"
										/>
										<input
											bind:value={ing.fat}
											class="ai-ing-inp m-fat"
											type="number"
											min="0"
											step="any"
											dir="ltr"
											title="الدهون بالغرام"
											aria-label="الدهون بالغرام"
										/>
										<button
											type="button"
											class="ai-ing-rm"
											aria-label="حذف المكون"
											title="حذف المكون"
											onclick={() => removeAiIngredient(i)}
										>
											<svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
										</button>
									</div>
								{/each}
							</div>
						</div>
					{:else}
						<div class="ai-ing-empty">
							لا توجد مكونات. اضغط «+ إضافة مكون» لإضافة مكون إلى الوجبة.
						</div>
					{/if}
				</div>

				<div>
					<label for="ai-meal-edit-steps" class="ai-meal-label">طريقة التحضير</label>
					<textarea
						id="ai-meal-edit-steps"
						bind:value={aiMealEditSteps}
						rows="6"
						class="ai-meal-steps"
						placeholder="اكتب خطوات التحضير بالعربي…"
					></textarea>
				</div>
			</div>

			<footer class="ai-meal-ft">
				<button
					type="button"
					class="ai-meal-btn-cancel"
					onclick={() => { showAiMealEdit = false; aiMealEditCtx = null; }}
				>
					إلغاء
				</button>
				<button type="button" class="ai-meal-btn-save" onclick={saveAiMealEdit}>
					حفظ التعديلات
				</button>
			</footer>
		</div>
	</div>
{/if}

<!-- Swap Modal -->
{#if showSwapModal && swapContext}
	{@const sc = swapContext}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="overlay" onclick={(e) => e.target === e.currentTarget && (showSwapModal = false)}>
		<div class="modal">
			<h2 style="font-size:17px; font-weight:700; margin:0 0 4px;">تبديل الوجبة</h2>
			<p style="font-size:12.5px; color:#8b909a; margin:0 0 16px;">
				{MEAL_TYPES.find((m) => m.id === sc.mealType)?.label} - {dayLabels()[dayDates().indexOf(sc.dateKey)]}
			</p>
			<div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:12px;">
				{#each dayDates() as dateKey, i}
					{#if dateKey !== sc.dateKey}
						{@const slot = plan[dateKey]?.[sc.mealType]}
						{@const info = slot ? getSlotInfo(slot) : null}
						<button style="border:1.5px solid #e8eaed; border-radius:10px; padding:11px 10px; cursor:pointer; text-align:center; transition:.13s; font-size:12px; background:#fff; font-family:'Tajawal',sans-serif;" onclick={() => doSwap(dateKey)}
							onmouseenter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#3cb96b'; (e.currentTarget as HTMLElement).style.background = '#edf9f2'; }}
							onmouseleave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#e8eaed'; (e.currentTarget as HTMLElement).style.background = '#fff'; }}>
							<strong style="display:block; font-size:13px; margin-bottom:3px;">{dayLabels()[i]}</strong>
							{info ? info.name : 'فارغ'}
						</button>
					{/if}
				{/each}
			</div>
			<div style="margin-top:12px;">
				<button class="btn-close" onclick={() => (showSwapModal = false)} style="width:100%;">إلغاء</button>
			</div>
		</div>
	</div>
{/if}


<!-- AI Generate Modal -->
{#if showAiModal}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="overlay" onclick={(e) => e.target === e.currentTarget && !aiGenerating && (showAiModal = false)}>
		<div class="modal" style="max-width:520px;">
			<h2 style="font-size:17px; font-weight:700; margin:0 0 4px;">إنشاء خطة بالذكاء الاصطناعي</h2>
			<p style="font-size:12.5px; color:#8b909a; margin:0 0 12px; line-height:1.6;">
				سيتم استخدام بيانات المريض تلقائيا (التشخيص، الأطعمة المستثناة، السعرات، المغذيات الكبرى) لإنشاء خطة مخصصة.
			</p>

			<!-- Mode badge — locked to current planType, not user-selectable here -->
			<div style="display:inline-flex; align-items:center; gap:6px; padding:6px 14px; border-radius:20px; margin-bottom:14px;
				background:{planType === 'weekly' ? '#f3e8ff' : '#edf9f2'};
				border:1.5px solid {planType === 'weekly' ? '#c4b5fd' : '#cbeed9'};
				color:{planType === 'weekly' ? '#7c3aed' : '#1f9e57'}; font-size:12px; font-weight:700; font-family:'Tajawal',sans-serif;">
				{planType === 'weekly' ? '📅 إنشاء لأسبوع كامل (7 أيام)' : '☀️ إنشاء ليوم واحد'}
			</div>

			<div style="background:#f4f6f9; border-radius:10px; padding:12px; margin-bottom:14px;">
				<div style="font-size:11px; font-weight:700; color:#8b909a; margin-bottom:8px; text-transform:uppercase; letter-spacing:.4px;">ملخص الإعدادات المستخدمة</div>
				<div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; font-size:12px; color:#4b5563;">
					<div>السعرات: <strong>{targetCalories} kcal</strong></div>
					<div>كارب {macros.c}% | بروتين {macros.p}% | دهون {macros.f}%</div>
					{#if selectedMeals.filter(m => m !== 'supplement').length}
						<div style="grid-column:1/-1;">
							الوجبات:
							{#each selectedMeals.filter(m => m !== 'supplement') as mId}
								<span style="display:inline-block; background:#e9d5ff; color:#7c3aed; border-radius:6px; padding:1px 8px; font-size:11px; font-weight:700; margin:1px 2px;">
									{MEAL_TYPES.find(m => m.id === mId)?.label ?? mId}
								</span>
							{/each}
						</div>
					{/if}
					{#if excludedFoods.length}
						<div style="grid-column:1/-1;">مستثناة: {excludedFoods.join('، ')}</div>
					{/if}
					{#if selectedDiags.length}
						<div style="grid-column:1/-1;">تشخيصات: {selectedDiags.length}</div>
					{/if}
				</div>
			</div>

			<div style="font-size:11px; font-weight:700; color:#8b909a; text-transform:uppercase; letter-spacing:.4px; margin-bottom:6px;">نوع النظام الغذائي</div>
			<div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:14px;">
				{#each DIET_TYPES as dt}
					<button class="diet-tag" class:on={selectedDietTypes.includes(dt)} onclick={() => toggleDietType(dt)}>{dt}</button>
				{/each}
			</div>

			<div style="font-size:11px; font-weight:700; color:#8b909a; text-transform:uppercase; letter-spacing:.4px; margin-bottom:6px;">تعليمات إضافية (اختياري)</div>
			<textarea bind:value={aiExtraNote} placeholder="مثال: يفضل المريض الأكلات السعودية، لا يحب السمك…" style="width:100%; border:1.5px solid #e8eaed; border-radius:9px; padding:10px 13px; font-size:13px; font-family:'Tajawal',sans-serif; resize:vertical; min-height:72px; outline:none; color:#1a1d23; margin-bottom:4px; box-sizing:border-box;"></textarea>

			{#if aiError}
				<div style="font-size:12px; color:#dc2626; margin:8px 0; padding:8px; background:#fef2f2; border-radius:8px;">{aiError}</div>
			{/if}

			{#if aiGenerating && aiProgressTotal > 1}
				<!-- Indeterminate progress bar — all days fire in parallel, no real per-day signal -->
				<div style="margin-bottom:12px;">
					<div style="font-size:11px; font-weight:600; color:#7c3aed; margin-bottom:6px;">
						جاري إنشاء {aiProgressTotal} أيام بالتوازي…
					</div>
					<div style="height:6px; background:#e9d5ff; border-radius:99px; overflow:hidden;">
						<div class="ai-progress-indeterminate"></div>
					</div>
					<div style="display:flex; gap:4px; margin-top:8px; justify-content:center;">
						{#each Array.from({ length: aiProgressTotal }) as _}
							<div class="ai-day-dot"></div>
						{/each}
					</div>
				</div>
			{/if}

			<div style="display:flex; gap:8px; margin-top:8px;">
				<button class="btn-close" onclick={() => (showAiModal = false)} disabled={aiGenerating}>إلغاء</button>
				<button
					style="flex:2; padding:12px; border-radius:10px; border:none; background:linear-gradient(135deg,#7c3aed,#a855f7); color:#fff; font-size:14px; font-weight:700; cursor:pointer; font-family:'Tajawal',sans-serif; {aiGenerating ? 'opacity:.7; cursor:wait;' : ''}"
					disabled={aiGenerating}
					onclick={startAiGenerate}
				>
					{aiGenerating ? 'جاري الإنشاء…' : 'إنشاء الخطة'}
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- AI Confirm Replace Modal -->
{#if showAiConfirm && aiGeneratedPlan}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="overlay" onclick={(e) => e.target === e.currentTarget && (showAiConfirm = false)}>
		<div class="modal" style="max-width:560px;">
			<h2 style="font-size:17px; font-weight:700; margin:0 0 4px;">
				{aiPlanPartial ? 'تم إنشاء جزء من الخطة' : 'تم إنشاء الخطة بنجاح'}
			</h2>
			<p style="font-size:12.5px; color:#8b909a; margin:0 0 16px;">
				{aiGeneratedPlan.days?.length ?? 0} يوم — {aiGeneratedPlan.days?.reduce((s: number, d: any) => s + (d.meals?.length ?? 0), 0) ?? 0} وجبة
			</p>
			{#if aiPlanPartial && aiPlanFailedDates.length > 0}
				<div
					style="background:#fff7ed; border:1.5px solid #fdba74; border-radius:10px; padding:10px 12px; font-size:12px; color:#9a3412; margin:-8px 0 14px;"
				>
					لم يُنشأ بعض الأيام (مهلة أو خطأ). يمكنك إعادة المحاولة لأسبوع أقل أو توليد يوم واحد.
					<div style="margin-top:6px; font-weight:700; direction:ltr; text-align:right;">{aiPlanFailedDates.join('، ')}</div>
				</div>
			{/if}

			<div style="max-height:300px; overflow-y:auto; margin-bottom:16px;">
				{#each aiGeneratedPlan.days ?? [] as day}
					<div style="border:1px solid #e8eaed; border-radius:10px; padding:10px 12px; margin-bottom:8px;">
						<div style="font-size:12px; font-weight:800; color:#7c3aed; margin-bottom:6px;">{day.date}</div>
						{#each day.meals ?? [] as meal}
							<div style="display:flex; justify-content:space-between; padding:4px 0; border-bottom:1px solid #f0f0f0; font-size:12px;">
								<span style="font-weight:600; color:#1f2937;">{meal.name_ar}</span>
								<span style="color:#3cb96b; font-weight:700;">{Math.round(meal.total?.calories ?? 0)} سعرة</span>
							</div>
						{/each}
					</div>
				{/each}
			</div>

			<div style="background:#fffbeb; border:1.5px solid #fde68a; border-radius:10px; padding:10px 12px; font-size:12px; color:#92400e; margin-bottom:14px;">
				سيتم استبدال الوجبات الحالية في الأيام المحددة. هذه الوجبات خاصة بهذا العميل ولن تُضاف إلى مكتبة الوصفات.
			</div>

			<div style="display:flex; gap:8px;">
				<button
					class="btn-close"
					onclick={() => {
						showAiConfirm = false;
						aiGeneratedPlan = null;
						aiPlanPartial = false;
						aiPlanFailedDates = [];
					}}>إلغاء</button>
				<button class="btn-generate" style="width:auto; flex:2; padding:11px;" onclick={applyAiPlan}>تطبيق الخطة ←</button>
			</div>
		</div>
	</div>
{/if}

<!-- Create Diagnosis Modal -->
{#if showCreateDiagModal}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="overlay" onclick={(e) => e.target === e.currentTarget && (showCreateDiagModal = false)}>
		<div class="modal" style="max-width:560px;">
			<h2 style="font-size:17px; font-weight:700; margin:0 0 4px;">إضافة تشخيص جديد</h2>
			<p style="font-size:12.5px; color:#8b909a; margin:0 0 16px;">سيتم حفظه في السجل الطبي للمريض ويمكن اختياره مباشرةً في الخطة.</p>

			<div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:10px;">
				<div style="grid-column:1 / -1;">
					<button type="button" class="diag-section-btn" onclick={() => (createDiagBasicOpen = !createDiagBasicOpen)}>
						<span>البيانات الأساسية</span>
						<span>{createDiagBasicOpen ? '▾' : '▸'}</span>
					</button>
					{#if createDiagBasicOpen}
						<div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
							<div style="grid-column:1 / -1;">
								<div style="font-size:11px; font-weight:700; color:#8b909a; margin-bottom:5px;">اسم التشخيص *</div>
								<input bind:value={newDiagName} placeholder="مثال: السكري النوع الثاني" style="width:100%; border:1.5px solid #e8eaed; border-radius:8px; padding:9px 10px; font-size:13px; font-family:'Tajawal',sans-serif; box-sizing:border-box;" />
							</div>
							<div>
								<div style="font-size:11px; font-weight:700; color:#8b909a; margin-bottom:5px;">الكود</div>
								<input bind:value={newDiagCode} placeholder="مثال: E11" style="width:100%; border:1.5px solid #e8eaed; border-radius:8px; padding:9px 10px; font-size:13px; font-family:'Tajawal',sans-serif; box-sizing:border-box;" />
							</div>
							<div>
								<div style="font-size:11px; font-weight:700; color:#8b909a; margin-bottom:5px;">الشدة *</div>
								<select bind:value={newDiagSeverity} style="width:100%; border:1.5px solid #e8eaed; border-radius:8px; padding:9px 10px; font-size:13px; font-family:'Tajawal',sans-serif; background:#fff; box-sizing:border-box;">
									<option value="">اختر الشدة</option>
									<option value="mild">خفيف</option>
									<option value="moderate">متوسط</option>
									<option value="severe">شديد</option>
								</select>
							</div>
						</div>
					{/if}
				</div>

				<div style="grid-column:1 / -1;">
					<button type="button" class="diag-section-btn" onclick={() => (createDiagClinicalOpen = !createDiagClinicalOpen)}>
						<span>البيانات السريرية</span>
						<span>{createDiagClinicalOpen ? '▾' : '▸'}</span>
					</button>
					{#if createDiagClinicalOpen}
						<div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
							<div>
								<div style="font-size:11px; font-weight:700; color:#8b909a; margin-bottom:5px;">تاريخ التشخيص *</div>
								<input type="date" bind:value={newDiagDate} style="width:100%; border:1.5px solid #e8eaed; border-radius:8px; padding:9px 10px; font-size:13px; font-family:'Tajawal',sans-serif; box-sizing:border-box;" />
							</div>
							<div>
								<div style="font-size:11px; font-weight:700; color:#8b909a; margin-bottom:5px;">الحالة *</div>
								<select bind:value={newDiagStatus} style="width:100%; border:1.5px solid #e8eaed; border-radius:8px; padding:9px 10px; font-size:13px; font-family:'Tajawal',sans-serif; background:#fff; box-sizing:border-box;">
									<option value="active">نشط</option>
									<option value="resolved">تم العلاج</option>
									<option value="managed">تحت السيطرة</option>
								</select>
							</div>
						</div>
					{/if}
				</div>

				<div style="grid-column:1 / -1;">
					<button type="button" class="diag-section-btn" onclick={() => (createDiagNotesOpen = !createDiagNotesOpen)}>
						<span>الملاحظات</span>
						<span>{createDiagNotesOpen ? '▾' : '▸'}</span>
					</button>
					{#if createDiagNotesOpen}
						<div>
							<div style="font-size:11px; font-weight:700; color:#8b909a; margin-bottom:5px;">الملاحظات *</div>
							<textarea bind:value={newDiagNotes} placeholder="أضف ملاحظات التشخيص..." style="width:100%; min-height:82px; border:1.5px solid #e8eaed; border-radius:8px; padding:9px 10px; font-size:13px; font-family:'Tajawal',sans-serif; resize:vertical; box-sizing:border-box;"></textarea>
						</div>
					{/if}
				</div>
			</div>

			{#if createDiagError}
				<div style="font-size:12px; color:#ef4444; margin-bottom:10px;">{createDiagError}</div>
			{/if}

			<div style="display:flex; gap:8px;">
				<button class="btn-close" onclick={() => (showCreateDiagModal = false)}>إلغاء</button>
				<button class="btn-generate" style="width:auto; flex:2; padding:11px;" disabled={isCreatingDiag} onclick={createDiagnosis}>
					{isCreatingDiag ? 'جاري الحفظ...' : editingDiagKey ? 'حفظ التعديلات' : 'حفظ التشخيص'}
				</button>
			</div>
		</div>
	</div>
{/if}
