<script lang="ts">
	import type { PageData, ActionData } from '../../../../routes/dietitian/meal-plan/[sessionId]/$types';
	import {
		DIAGS,
		MEAL_TYPES,
		TAGS,
		DIET_TYPES,
		AI_DIET_MODAL_PRESETS,
		MICROS,
		DAYS_W
	} from '$lib/meal-plan/constants';
	import type { MealTypeId } from '$lib/meal-plan/constants';
	import type { Macros, PlanGrid, PlanSlot, RecipeNutrients, AiMealData } from '$lib/meal-plan/types';
	import { syncAiMealData } from '$lib/meal-plan/ai-meal-sync';
	import { adjustMacro, macroGrams, parseNutrients, computePlanTotals, estimateMicros } from '$lib/meal-plan/macro-utils';
	import { buildChartContract } from '$lib/meal-plan/chart-contract';
	import { validatePlan, getLimitsForTags, type ValidationResult, type ValidationStatus } from '$lib/meal-plan/validation';
	import {
		generateMealPlanWithAi,
		saveMealPlan,
		upsertDiagnosis,
		publishMealPlan,
		clearMealPlanMeals,
		createMealPlanShareLink
	} from '$lib/features/meal-plan/services/meal-plan-api';
	import { searchRecipeFoods, type SearchRecipeFood } from '$lib/features/recipes/services/recipes-api';
	import {
		filterExclusionCatalog,
		getExclusionCatalogItem,
		stableNegativeFoodId
	} from '$lib/meal-plan/exclusion-catalog';
	import { tick, untrack } from 'svelte';
	import { snapToSubscriptionPeriod, todayStr, toLocalYmd } from '$lib/features/meal-plan/state/date-utils';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	type PeriodBuilderSlice = {
		diags: string[];
		targetCalories: number;
		excluded: string[];
		excludedFoodItemIds: number[];
		macros: Macros;
		selectedMeals: MealTypeId[];
		tags: string[];
		dietTypes: string[];
		extraNote: string;
	};

	type ExcludedFoodChip = {
		foodId: number;
		name: string;
		nameAr: string | null;
		calories?: number;
		protein?: number;
		carbs?: number;
		fat?: number;
		unit?: string;
		source?: 'local' | 'external-db' | 'api';
	};

	const ALL_PRESET_DIET_TYPES: Set<string> = new Set(
		AI_DIET_MODAL_PRESETS.flatMap((p) => [...p.dietTypes] as string[])
	);

	/* ─── BUILDER STATE ─── */
	let planType = $state<'daily' | 'weekly'>('daily');
	let selectedDiags = $state<string[]>([]);
	let targetCalories = $state(0);
	let excludedFoods = $state<ExcludedFoodChip[]>([]);
	let macros = $state<Macros>({ c: 50, p: 25, f: 25 });
	let selectedMeals = $state<MealTypeId[]>([]);
	let selectedTags = $state<string[]>([]);
	let selectedDietTypes = $state<string[]>([]);
	let extraNote = $state('');
	let plan = $state<PlanGrid>({});
	let planStartDate = $state<string>(untrack(() => data.session.startDate || todayStr()));
	let viewWeekStart = $state<string>(untrack(() => data.session.startDate || todayStr()));
	const timelineMinDate = $derived(data.timelineMinDate || data.session.startDate || todayStr());
	const timelineMaxDate = $derived(data.timelineMaxDate || data.session.endDate || todayStr());
	const timelineAnchorBaseDate = $derived(data.timelineAnchorBaseDate || data.session.startDate || todayStr());
	let periodBuilderByAnchor = $state<Record<string, PeriodBuilderSlice>>({});
	let selectedSummaryDate = $state<string | null>(null);

	/* ─── DROPDOWN STATE ─── */
	let showDiagDrop = $state(false);
	/** Per-diagnosis: collapsed = recommendations body hidden (toggle by clicking block header). */
	let diagRecBlockCollapsed = $state<Record<string, boolean>>({});
	let showExclusionDrop = $state(false);
	let exclusionSearchQuery = $state('');
	let exclusionSearchInputEl: HTMLInputElement | null = null;

	const exclusionCatalogFiltered = $derived(filterExclusionCatalog(exclusionSearchQuery));
	const exclusionCatalogFlat = $derived.by(() => {
		const rows = exclusionCatalogFiltered.flatMap((g) => g.items);
		return [...rows].sort((a, b) => a.labelAr.localeCompare(b.labelAr, 'ar'));
	});
	const exclusionCatalogEmpty = $derived(
		exclusionSearchQuery.trim().length > 0 && exclusionCatalogFlat.length === 0
	);

	/* ─── MODAL STATE ─── */
	let showRecipePicker = $state(false);
	let pickerContext = $state<{ mealType: string; dateKey: string } | null>(null);
	let pickerSearch = $state('');
	let pickerTab = $state<'recipe' | 'supplement'>('recipe');
	let pickerSupplCategory = $state<string>('all');
	let showMealDetail = $state(false);
	let detailRecipeId = $state<number | null>(null);
	let showAiMealDetail = $state(false);
	let aiMealDetailCtx = $state<{ dateKey: string; mealType: string; aiMeal: AiMealData } | null>(null);
	let showSupplementDetail = $state(false);
	let supplementDetailCtx = $state<{ dateKey: string; mealType: string } | null>(null);
	// AI meal edit state
	let showAiMealEdit = $state(false);
	let aiMealEditCtx = $state<{ dateKey: string; mealType: string } | null>(null);
	let aiMealEditName = $state('');
	let aiMealEditIngredients = $state<AiMealData['ingredients']>([]);
	let aiMealEditSteps = $state('');
	let aiFoodSearchOpen = $state(false);
	let aiFoodSearchQuery = $state('');
	let aiFoodSearchLoading = $state(false);
	let aiFoodSearchRemoteResults = $state<SearchRecipeFood[]>([]);
	let aiFoodSearchHasSearched = $state(false);
	let aiFoodSearchError = $state('');
	let aiFoodSearchTimer: ReturnType<typeof setTimeout>;
	let showSwapModal = $state(false);
	let swapContext = $state<{ mealType: string; dateKey: string } | null>(null);
	let showCreateDiagModal = $state(false);
	let createDiagError = $state('');
	let isCreatingDiag = $state(false);
	let editingDiagKey = $state<string | null>(null);
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
	let newDiagNotes = $state('');

	/* ─── AI GENERATE STATE ─── */
	let showAiModal = $state(false);
	let showAiDietAdvanced = $state(false);
	let aiDraftDietTypes = $state<string[]>([]);
	let aiExtraNote = $state('');
	let aiGenerating = $state(false);
	let aiProgressTotal = $state(1);
	let aiError = $state('');
	let aiGeneratedPlan = $state<any>(null);
	/** Set when some days failed but others succeeded (week generation). */
	let aiPlanPartial = $state(false);
	let aiPlanFailedDates = $state<string[]>([]);
	let chartCardEl: HTMLDivElement | null = null;

	async function startAiGenerate() {
		if (!canGenerateAi()) {
			aiError = `يرجى استكمال الحقول الأساسية: ${aiMissingRequirements().join('، ')}`;
			return;
		}
		aiGenerating = true;
		aiError = '';
		aiPlanPartial = false;
		aiPlanFailedDates = [];

		const dates = dayDates();
		aiProgressTotal = planType === 'weekly' ? Math.min(dates.length, 7) : 1;

		try {
			// Keep global builder state in sync only when user confirms generation.
			selectedDietTypes = [...aiDraftDietTypes];
			const res = await generateMealPlanWithAi({
				sessionId: data.session.id,
				scope: planType === 'weekly' ? 'week' : 'day',
				targetCalories: targetCalories > 0 ? targetCalories : effectiveTargetCalories,
				macros,
				excludedFoods: excludedFoodNames(),
				excludedFoodItemIds: excludedFoodItemIds(),
				diagnoses: selectedDiags,
				tags: selectedTags,
				dietTypes: aiDraftDietTypes,
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
				applyAiPlan();
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
		showAiModal = false;
		aiGeneratedPlan = null;
		aiPlanPartial = false;
		aiPlanFailedDates = [];
	}

	function getPeriodAnchor(mode: 'daily' | 'weekly', startYmd: string) {
		return mode === 'weekly' ? snapToSubscriptionPeriod(startYmd, timelineAnchorBaseDate) : startYmd;
	}

	function getPeriodDates(mode: 'daily' | 'weekly', startYmd: string) {
		const anchor = getPeriodAnchor(mode, startYmd);
		if (mode === 'daily') return [anchor];
		const base = new Date(anchor + 'T00:00:00');
		return [0, 1, 2, 3, 4, 5, 6].map((i) => toLocalYmd(new Date(base.getTime() + i * 86400000)));
	}

	function clonePlanGrid(input: PlanGrid): PlanGrid {
		const out: PlanGrid = {};
		for (const [dateKey, slots] of Object.entries(input)) out[dateKey] = { ...slots };
		return out;
	}

	function clonePeriodBuilderMap(input: Record<string, PeriodBuilderSlice>) {
		const out: Record<string, PeriodBuilderSlice> = {};
		for (const [anchor, slice] of Object.entries(input)) out[anchor] = { ...slice };
		return out;
	}

	function sanitizeMacros(value: unknown): Macros {
		const base = value && typeof value === 'object' ? value as { c?: unknown; p?: unknown; f?: unknown } : {};
		return {
			c: Math.max(0, Math.min(100, Number(base.c ?? 50) || 0)),
			p: Math.max(0, Math.min(100, Number(base.p ?? 25) || 0)),
			f: Math.max(0, Math.min(100, Number(base.f ?? 25) || 0))
		};
	}

	function normalizeMealTypes(value: unknown): MealTypeId[] {
		if (!Array.isArray(value)) return [];
		const allowed = new Set(MEAL_TYPES.map((m) => m.id));
		return value.filter((id): id is MealTypeId => typeof id === 'string' && allowed.has(id as MealTypeId));
	}

	function emptyPeriodSlice(): PeriodBuilderSlice {
		return {
			diags: [],
			targetCalories: 0,
			excluded: [],
			excludedFoodItemIds: [],
			macros: { c: 50, p: 25, f: 25 },
			selectedMeals: [],
			tags: [],
			dietTypes: [],
			extraNote: ''
		};
	}

	function normalizeFoodItemIds(value: unknown): number[] {
		if (!Array.isArray(value)) return [];
		return value
			.map((item) => Number(item))
			.filter((item) => Number.isFinite(item) && item > 0)
			.map((item) => Math.trunc(item));
	}

	function normalizePeriodSlice(input: Partial<PeriodBuilderSlice> | null | undefined): PeriodBuilderSlice {
		const base = emptyPeriodSlice();
		return {
			diags: Array.isArray(input?.diags) ? input!.diags.filter((x): x is string => typeof x === 'string') : base.diags,
			targetCalories: Number.isFinite(input?.targetCalories) ? Math.max(0, Math.round(Number(input?.targetCalories))) : base.targetCalories,
			excluded: Array.isArray(input?.excluded) ? input!.excluded.filter((x): x is string => typeof x === 'string') : base.excluded,
			excludedFoodItemIds: normalizeFoodItemIds(input?.excludedFoodItemIds),
			macros: sanitizeMacros(input?.macros),
			selectedMeals: normalizeMealTypes(input?.selectedMeals),
			tags: Array.isArray(input?.tags) ? input!.tags.filter((x): x is string => typeof x === 'string') : base.tags,
			dietTypes: Array.isArray(input?.dietTypes) ? input!.dietTypes.filter((x): x is string => typeof x === 'string') : base.dietTypes,
			extraNote: typeof input?.extraNote === 'string' ? input.extraNote : base.extraNote
		};
	}

	function normalizePeriodBuilderMap(input: unknown): Record<string, PeriodBuilderSlice> {
		if (!input || typeof input !== 'object') return {};
		const out: Record<string, PeriodBuilderSlice> = {};
		for (const [anchor, rawSlice] of Object.entries(input as Record<string, unknown>)) {
			if (!/^\d{4}-\d{2}-\d{2}$/.test(anchor)) continue;
			out[anchor] = normalizePeriodSlice((rawSlice ?? {}) as Partial<PeriodBuilderSlice>);
		}
		return out;
	}

	function hasMeaningfulSlice(slice: PeriodBuilderSlice): boolean {
		return (
			slice.diags.length > 0 ||
			slice.targetCalories > 0 ||
			slice.excluded.length > 0 ||
			slice.excludedFoodItemIds.length > 0 ||
			slice.selectedMeals.length > 0 ||
			slice.tags.length > 0 ||
			slice.dietTypes.length > 0 ||
			Boolean(slice.extraNote)
		);
	}

	function resolveExcludedFoodsFromSlice(slice: PeriodBuilderSlice): ExcludedFoodChip[] {
		const ids = normalizeFoodItemIds(slice.excludedFoodItemIds);
		if (ids.length > 0) {
			return ids.map((id) => {
				const food = data.foods.find((item) => item.id === id);
				return {
					foodId: id,
					name: food?.name ?? `Food #${id}`,
					nameAr: food?.nameAr ?? null
				};
			});
		}
		return (slice.excluded ?? []).map((name, index) => ({
			foodId: -(index + 1),
			name,
			nameAr: name
		}));
	}

	function sliceFromForm(): PeriodBuilderSlice {
		return normalizePeriodSlice({
			diags: selectedDiags,
			targetCalories,
			excluded: excludedFoods.map((food) => food.nameAr ?? food.name),
			excludedFoodItemIds: excludedFoods.filter((food) => food.foodId > 0).map((food) => food.foodId),
			macros,
			selectedMeals,
			tags: selectedTags,
			dietTypes: selectedDietTypes,
			extraNote
		});
	}

	function applySliceToForm(slice: PeriodBuilderSlice) {
		selectedDiags = [...slice.diags];
		targetCalories = slice.targetCalories;
		excludedFoods = resolveExcludedFoodsFromSlice(slice);
		macros = { ...slice.macros };
		selectedMeals = [...slice.selectedMeals];
		selectedTags = [...slice.tags];
		selectedDietTypes = [...slice.dietTypes];
		extraNote = slice.extraNote;
	}

	function inferSelectedMealsFromGrid(input: PlanGrid, mode: 'daily' | 'weekly', startYmd: string): MealTypeId[] {
		const dates = getPeriodDates(mode, startYmd);
		const present = new Set<string>();
		for (const dateKey of dates) {
			const slots = input[dateKey] ?? {};
			for (const [mealType, slot] of Object.entries(slots)) {
				if (slotHasContent(slot)) present.add(mealType);
			}
		}
		const allowed = new Set(MEAL_TYPES.map((m) => m.id));
		return [...present].filter((id): id is MealTypeId => allowed.has(id as MealTypeId));
	}

	function resolvePeriodSliceForAnchor(
		sourceMap: Record<string, PeriodBuilderSlice>,
		mode: 'daily' | 'weekly',
		startYmd: string,
		inputPlan: PlanGrid
	): PeriodBuilderSlice {
		const anchor = getPeriodAnchor(mode, startYmd);
		const mapped = sourceMap[anchor];
		if (mapped) return normalizePeriodSlice(mapped);
		const fallback = emptyPeriodSlice();
		const inferredMeals = inferSelectedMealsFromGrid(inputPlan, mode, startYmd);
		if (inferredMeals.length > 0) fallback.selectedMeals = inferredMeals;
		return fallback;
	}

	function periodBuilderMapWithCurrentSlice() {
		return {
			...periodBuilderByAnchor,
			[getPeriodAnchor(planType, viewWeekStart)]: sliceFromForm()
		};
	}

	function periodGridSnapshot(input: PlanGrid, mode: 'daily' | 'weekly', startYmd: string): PlanGrid {
		const dates = getPeriodDates(mode, startYmd);
		const out: PlanGrid = {};
		for (const dateKey of dates) {
			const slots = input[dateKey];
			if (slots && Object.keys(slots).length > 0) out[dateKey] = { ...slots };
		}
		return out;
	}

	function hasPendingPeriodChangesFor(mode: 'daily' | 'weekly', startYmd: string) {
		const current = JSON.stringify(periodGridSnapshot(plan, mode, startYmd));
		const saved = JSON.stringify(periodGridSnapshot(savedPlanSnapshot, mode, startYmd));
		const anchor = getPeriodAnchor(mode, startYmd);
		const currentBuilder =
			anchor === getPeriodAnchor(planType, viewWeekStart)
				? sliceFromForm()
				: resolvePeriodSliceForAnchor(periodBuilderByAnchor, mode, startYmd, plan);
		const savedBuilder = resolvePeriodSliceForAnchor(
			savedPeriodBuilderByAnchor,
			mode,
			startYmd,
			savedPlanSnapshot
		);
		return current !== saved || JSON.stringify(currentBuilder) !== JSON.stringify(savedBuilder);
	}

	function hasPendingCurrentPeriodChanges() {
		return hasPendingPeriodChangesFor(planType, viewWeekStart);
	}

	function restoreCurrentPeriodFromSavedSnapshot() {
		const dates = getPeriodDates(planType, viewWeekStart);
		const nextPlan = clonePlanGrid(plan);
		for (const dateKey of dates) {
			const savedSlots = savedPlanSnapshot[dateKey];
			if (savedSlots && Object.keys(savedSlots).length > 0) nextPlan[dateKey] = { ...savedSlots };
			else delete nextPlan[dateKey];
		}
		plan = nextPlan;
		const anchor = getPeriodAnchor(planType, viewWeekStart);
		const restoredSlice = resolvePeriodSliceForAnchor(savedPeriodBuilderByAnchor, planType, viewWeekStart, savedPlanSnapshot);
		periodBuilderByAnchor = {
			...periodBuilderByAnchor,
			[anchor]: restoredSlice
		};
		hydratingPeriod = true;
		applySliceToForm(restoredSlice);
		hydratingPeriod = false;
	}

	function applyNavigation(nextPlanType: 'daily' | 'weekly', nextStart: string) {
		const currentAnchor = getPeriodAnchor(planType, viewWeekStart);
		const nextMap = {
			...periodBuilderByAnchor,
			[currentAnchor]: sliceFromForm()
		};
		periodBuilderByAnchor = nextMap;
		planType = nextPlanType;
		viewWeekStart = getPeriodAnchor(nextPlanType, nextStart);
		const nextSlice = resolvePeriodSliceForAnchor(nextMap, nextPlanType, viewWeekStart, plan);
		hydratingPeriod = true;
		applySliceToForm(nextSlice);
		hydratingPeriod = false;
	}

	function requestNavigation(nextPlanType: 'daily' | 'weekly', nextStart: string) {
		if (hasPendingCurrentPeriodChanges()) {
			pendingNav = { nextPlanType, nextStart };
			showNavGuard = true;
			return;
		}
		applyNavigation(nextPlanType, nextStart);
	}

	async function confirmNavSave() {
		if (!pendingNav) return;
		await doSave();
		const next = pendingNav;
		pendingNav = null;
		showNavGuard = false;
		applyNavigation(next.nextPlanType, next.nextStart);
	}

	function confirmNavDiscard() {
		if (!pendingNav) return;
		restoreCurrentPeriodFromSavedSnapshot();
		const next = pendingNav;
		pendingNav = null;
		showNavGuard = false;
		applyNavigation(next.nextPlanType, next.nextStart);
	}

	function cancelNavChange() {
		pendingNav = null;
		showNavGuard = false;
	}

	/* ─── AUTO-SAVE ─── */
	let saveStatus = $state<'idle' | 'saving' | 'saved'>('idle');
	let saveTimer: ReturnType<typeof setTimeout> | undefined;
	let saveError = $state('');
	let initialRestoreDone = $state(false);
	let hydratingPeriod = $state(false);
	let saveInFlight = false;
	let pendingSave = false;
	let savedPlanSnapshot = $state<PlanGrid>({});
	let savedPeriodBuilderByAnchor = $state<Record<string, PeriodBuilderSlice>>({});
	let saveRequestSeq = 0;
	let pendingNav = $state<{ nextPlanType: 'daily' | 'weekly'; nextStart: string } | null>(null);
	let showNavGuard = $state(false);

	/* ─── PUBLISH ─── */
	let publishStatus = $state<'idle' | 'publishing' | 'published' | 'error'>('idle');
	let publishError = $state('');
	let isPublished = $state(false);
	let shareStatus = $state<'idle' | 'sharing' | 'shared' | 'error'>('idle');
	let shareError = $state('');
	let lastSharedUrl = $state('');
	let shareModalOpen = $state(false);
	let shareModalCopied = $state(false);
	$effect(() => {
		if (publishStatus === 'idle' && isPublished === false) {
			isPublished = data.session.status === 'active';
		}
	});

	async function doPublish() {
		if (publishStatus === 'publishing') return;
		// First ensure the latest state is saved
		if (saveStatus !== 'saved' && saveStatus !== 'idle') {
			await doSave();
		}
		publishStatus = 'publishing';
		publishError = '';
		try {
			const res = await publishMealPlan();
			const body = await res.json().catch(() => ({}));
			if (res.ok) {
				publishStatus = 'published';
				isPublished = true;
				setTimeout(() => { if (publishStatus === 'published') publishStatus = 'idle'; }, 4000);
			} else {
				publishStatus = 'error';
				publishError = body?.error ?? 'فشل نشر الخطة. حاول مرة أخرى.';
				setTimeout(() => { publishStatus = 'idle'; }, 4000);
			}
		} catch {
			publishStatus = 'error';
			publishError = 'تعذر الاتصال بالخادم';
			setTimeout(() => { publishStatus = 'idle'; }, 4000);
		}
	}

	async function shareCurrentMealPlan() {
		if (shareStatus === 'sharing') return;
		shareStatus = 'sharing';
		shareError = '';
		shareModalOpen = true;
		shareModalCopied = false;
		try {
			// Shared links should always point to the patient-visible, published plan.
			if (!isPublished) {
				await doPublish();
			}
			if (!isPublished) {
				throw new Error('الرجاء نشر الخطة أولاً قبل مشاركتها');
			}

			// Always share the currently selected summary day.
			const anchorDate = effectiveSummaryDate() ?? viewWeekStart;
			const res = await createMealPlanShareLink({
				sessionId: data.session.id,
				scope: 'day',
				anchorDate
			});
			const body = await res.json().catch(() => ({} as { error?: string; url?: string }));
			if (!res.ok || !body?.url) {
				throw new Error(body?.error ?? 'فشل إنشاء رابط المشاركة');
			}

			lastSharedUrl = body.url;
			shareStatus = 'shared';
		} catch (err) {
			shareStatus = 'error';
			shareError = err instanceof Error ? err.message : 'تعذر إنشاء رابط المشاركة';
		}
	}

	async function copyShareUrl() {
		if (!lastSharedUrl) return;
		try {
			await navigator.clipboard.writeText(lastSharedUrl);
			shareModalCopied = true;
			setTimeout(() => { shareModalCopied = false; }, 2200);
		} catch {
			// fallback: select the text in the input
		}
	}

	function closeShareModal() {
		shareModalOpen = false;
		shareStatus = 'idle';
		shareError = '';
		shareModalCopied = false;
	}

	/* ─── RESTORE STATE FROM EXISTING PLAN ─── */
	$effect(() => {
		if (initialRestoreDone) return;

		let restoredPlanType: 'daily' | 'weekly' = planType;
		let restoredSupplementMeta: Record<
			string,
			{ volumeMl?: number; overrides?: { calories?: number; protein?: number; carbs?: number; fat?: number } }
		> = {};
		let cfg: Record<string, unknown> = {};
		if (data.existingPlan?.builderConfig) {
			try {
				cfg = JSON.parse(data.existingPlan.builderConfig);
				if (cfg.planType === 'daily' || cfg.planType === 'weekly') {
					planType = cfg.planType;
					restoredPlanType = cfg.planType;
				}
				if (cfg.supplementSlotMeta && typeof cfg.supplementSlotMeta === 'object') {
					restoredSupplementMeta = cfg.supplementSlotMeta as Record<string, { volumeMl?: number; overrides?: { calories?: number; protein?: number; carbs?: number; fat?: number } }>;
				}
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
						try {
							const raw = JSON.parse((meal as any).aiMealJson) as AiMealData;
							slot.aiMeal = syncAiMealData(raw);
						} catch { /* ignore */ }
					}
					if (slot.supplementId) {
						const meta = restoredSupplementMeta[supplementSlotKey(dateKey, meal.mealType)];
						if (meta) {
							const volume = toSafeNum(meta.volumeMl);
							if (volume !== undefined) slot.supplementVolumeMl = volume;
							const overrides = meta.overrides ?? {};
							const resolvedOverrides = {
								calories: toSafeNum(overrides.calories),
								protein: toSafeNum(overrides.protein),
								carbs: toSafeNum(overrides.carbs),
								fat: toSafeNum(overrides.fat)
							};
							if (Object.values(resolvedOverrides).some((v) => v !== undefined)) {
								slot.supplementOverrides = resolvedOverrides;
							}
						}
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
			planStartDate = anchorYmd;
			viewWeekStart = snapToSubscriptionPeriod(anchorYmd, timelineAnchorBaseDate);
		}

		const fromMap = normalizePeriodBuilderMap(cfg.periodBuilder);
		if (Object.keys(fromMap).length > 0) {
			periodBuilderByAnchor = fromMap;
		} else {
			const migrated = normalizePeriodSlice({
				diags: cfg.diags as string[] | undefined,
				targetCalories: cfg.targetCalories as number | undefined,
				excluded: cfg.excluded as string[] | undefined,
				excludedFoodItemIds: cfg.excludedFoodItemIds as number[] | undefined,
				macros: cfg.macros as Macros | undefined,
				selectedMeals: cfg.selectedMeals as MealTypeId[] | undefined,
				tags: cfg.tags as string[] | undefined,
				dietTypes: cfg.dietTypes as string[] | undefined,
				extraNote: cfg.extraNote as string | undefined
			});
			const migratedAnchor = getPeriodAnchor(restoredPlanType, viewWeekStart);
			periodBuilderByAnchor = hasMeaningfulSlice(migrated) ? { [migratedAnchor]: migrated } : {};
		}

		const initialSlice = resolvePeriodSliceForAnchor(periodBuilderByAnchor, restoredPlanType, viewWeekStart, plan);
		hydratingPeriod = true;
		applySliceToForm(initialSlice);
		hydratingPeriod = false;

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

		savedPlanSnapshot = clonePlanGrid(plan);
		savedPeriodBuilderByAnchor = clonePeriodBuilderMap(periodBuilderMapWithCurrentSlice());
		initialRestoreDone = true;
	});

	/* ─── DEBOUNCED AUTO-SAVE EFFECT ─── */
	$effect(() => {
		const _cfg = builderConfigJson;
		const _grid = planGridJson;

		if (!initialRestoreDone || hydratingPeriod) return;

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
		saveError = '';
		const payload = {
			builderConfig: builderConfigJson,
			planGrid: planGridJson,
			planType,
			recommendation: clientNotes,
			startDate: planStartDate
		};
		const requestSeq = ++saveRequestSeq;
		try {
			await savePlan(payload);
			savedPlanSnapshot = clonePlanGrid(JSON.parse(payload.planGrid) as PlanGrid);
			savedPeriodBuilderByAnchor = clonePeriodBuilderMap(periodBuilderMapWithCurrentSlice());
			// Saving keeps this plan as draft; only publish marks it active for patient.
			isPublished = false;
			saveStatus = 'saved';
			setTimeout(() => { if (saveStatus === 'saved') saveStatus = 'idle'; }, 2000);
		} catch {
			saveStatus = 'idle';
			saveError = 'تعذر حفظ الخطة. تحقق من الاتصال ثم أعد المحاولة.';
		} finally {
			saveInFlight = false;
			if (pendingSave && requestSeq === saveRequestSeq) {
				pendingSave = false;
				doSave();
			}
		}
	}

	/* ─── DERIVED ─── */
	const days = $derived(planType === 'weekly' ? [0, 1, 2, 3, 4, 5, 6] : [0]);
	const weeklyAnchorStart = $derived(() =>
		planType === 'weekly' ? snapToSubscriptionPeriod(viewWeekStart, timelineAnchorBaseDate) : viewWeekStart
	);

	/** Start of the 7-day period that contains today — the furthest period the user can navigate to */
	const navMaxWeekAnchor = $derived(() =>
		snapToSubscriptionPeriod(timelineMaxDate, timelineAnchorBaseDate)
	);

	/** Disable "previous" arrow when already at the session start */
	const navPrevDisabled = $derived(() =>
		planType === 'weekly'
			? weeklyAnchorStart() <= timelineMinDate
			: viewWeekStart <= timelineMinDate
	);

	/** Disable "next" arrow when already at the current active period */
	const navNextDisabled = $derived(() =>
		planType === 'weekly'
			? weeklyAnchorStart() >= navMaxWeekAnchor
			: viewWeekStart >= timelineMaxDate
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
		let nextStart = viewWeekStart;
		const dailyMaxDate = timelineMaxDate;
		if (offset === 0) {
			nextStart = planType === 'weekly'
				? snapToSubscriptionPeriod(timelineMaxDate, timelineAnchorBaseDate)
				: timelineMaxDate;
		} else {
			const step = planType === 'weekly' ? 7 : 1;
			const base = planType === 'weekly' ? weeklyAnchorStart() : viewWeekStart;
			const d = new Date(base + 'T00:00:00');
			d.setDate(d.getDate() + offset * step);
			nextStart = planType === 'weekly'
				? snapToSubscriptionPeriod(toLocalYmd(d), timelineAnchorBaseDate)
				: toLocalYmd(d);
		}
		// Enforce subscription bounds
		if (nextStart < timelineMinDate) return;
		if (planType === 'weekly' && nextStart > navMaxWeekAnchor()) return;
		if (planType === 'daily' && nextStart > dailyMaxDate) return;
		requestNavigation(planType, nextStart);
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
		const map = new Map<number, { totalKcal: number; protein: number; carbs: number; fat: number; volumeMl: number | null }>();
		for (const s of data.supplements) {
			map.set(s.id, {
				totalKcal: s.totalKcal ?? 0,
				protein: s.protein ?? 0,
				carbs: s.carbs ?? 0,
				fat: s.fat ?? 0,
				volumeMl: s.volumeMl ?? null
			});
		}
		return map;
	});

	function supplementSlotKey(dateKey: string, mealType: string) {
		return `${dateKey}__${mealType}`;
	}

	function toSafeNum(value: unknown): number | undefined {
		if (value === '' || value === null || value === undefined) return undefined;
		const n = Number(value);
		if (!Number.isFinite(n)) return undefined;
		return Math.max(0, n);
	}

	function resolveSupplementSlot(slot: PlanSlot) {
		if (!slot.supplementId) return null;
		const supplement = data.supplements.find((x) => x.id === slot.supplementId);
		if (!supplement) return null;
		const baseVolume = supplement.volumeMl && supplement.volumeMl > 0 ? supplement.volumeMl : null;
		const slotVolume = slot.supplementVolumeMl && slot.supplementVolumeMl > 0 ? slot.supplementVolumeMl : baseVolume;
		const ratio = baseVolume && slotVolume ? slotVolume / baseVolume : 1;
		const base = {
			calories: (supplement.totalKcal ?? 0) * ratio,
			protein: (supplement.protein ?? 0) * ratio,
			carbs: (supplement.carbs ?? 0) * ratio,
			fat: (supplement.fat ?? 0) * ratio
		};
		const effective = slot.supplementOverrides
			? {
				calories: toSafeNum(slot.supplementOverrides.calories) ?? 0,
				protein: toSafeNum(slot.supplementOverrides.protein) ?? 0,
				carbs: toSafeNum(slot.supplementOverrides.carbs) ?? 0,
				fat: toSafeNum(slot.supplementOverrides.fat) ?? 0
			}
			: base;
		return { supplement, base, effective, slotVolume, slot };
	}

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

	/** The date key currently shown in the summary panel — defaults to today if in view, else first day. */
	const effectiveSummaryDate = $derived(() => {
		const dates = dayDates();
		if (!dates.length) return null;
		if (selectedSummaryDate && dates.includes(selectedSummaryDate)) return selectedSummaryDate;
		return todayDayIdx() >= 0 ? dates[todayDayIdx()] : dates[0];
	});

	// Keep summary panel behavior consistent when switching days.
	// If user expanded micronutrients on one day, collapse it on next selected day.
	let lastEffectiveSummaryDate: string | null = null;
	$effect(() => {
		const currentSummaryDate = effectiveSummaryDate();
		if (currentSummaryDate !== lastEffectiveSummaryDate) {
			microExpanded = false;
			lastEffectiveSummaryDate = currentSummaryDate;
		}
	});

	const summaryDayPlan = $derived(() => {
		const dateKey = effectiveSummaryDate();
		if (!dateKey) return {};
		return plan[dateKey] ? { [dateKey]: plan[dateKey] } : { [dateKey]: {} };
	});

	const summaryDayCalc = $derived(
		computePlanTotals(summaryDayPlan(), recipeLookup(), supplementLookup(), foodLookup())
	);

	const summaryEffectiveCalories = $derived(
		targetCalories > 0
			? targetCalories
			: summaryDayCalc.totals.calories > 0
				? Math.max(1600, Math.ceil(summaryDayCalc.totals.calories * 1.08))
				: 0
	);

	const summaryUsingImplicitGoal = $derived(targetCalories <= 0 && summaryDayCalc.totals.calories > 0);

	const summaryChartContract = $derived(
		buildChartContract({
			planType: 'daily',
			targetCalories: summaryEffectiveCalories,
			macros,
			totals: summaryDayCalc.totals,
			mealTotals: summaryDayCalc.mealTotals,
			mealLabelMap: mealLabelMap(),
			mealTypes: displayMealTypes()
		})
	);

	const summaryMealProgress = $derived(() => {
		const progress = new Map<string, { percent: number; calories: number }>();
		const totalCalories = summaryDayCalc.totals.calories;
		for (const mealType of displayMealTypes()) {
			const mealCalories = summaryDayCalc.mealTotals[mealType]?.calories ?? 0;
			const percent = totalCalories > 0 ? Math.round((mealCalories / totalCalories) * 100) : 0;
			progress.set(mealType, { percent, calories: mealCalories });
		}
		return progress;
	});

	const summaryMealProgressTypes = $derived(displayMealTypes());

	const summarySupplementTotal = $derived(() => {
		const dateKey = effectiveSummaryDate();
		if (!dateKey) return 0;
		let total = 0;
		const daySlots = plan[dateKey] ?? {};
		for (const slot of Object.values(daySlots)) {
			if (!(slot as PlanSlot).supplementId) continue;
			const resolved = resolveSupplementSlot(slot as PlanSlot);
			if (!resolved) continue;
			total += resolved.effective.calories ?? 0;
		}
		return total;
	});

	const summaryMicroData = $derived(estimateMicros(summarySupplementTotal()));

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
	const mealLabelMap = $derived(() => {
		const base = Object.fromEntries(MEAL_TYPES.map((m) => [m.id, m.label])) as Record<string, string>;
		if (!base.supplement) base.supplement = 'مكمل';
		return base;
	});

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

	/** Selected meal types are session-global and should not be auto-pruned by period navigation. */

	/**
	 * When the plan was created without builderConfig (e.g. DB seed), targetCalories stays 0 and the
	 * summary panel showed 0% / —g goals. Use a conservative implicit goal from current totals for display.
	 */
	const effectiveTargetCalories = $derived(
		targetCalories > 0
			? targetCalories
			: planCalc.totals.calories > 0
				? Math.max(1600, Math.ceil(planCalc.totals.calories * 1.08))
				: 0
	);
	const mg = $derived(macroGrams(effectiveTargetCalories, macros));

	const chartContract = $derived(
		buildChartContract({
			planType,
			targetCalories: effectiveTargetCalories,
			macros,
			totals: planCalc.totals,
			mealTotals: planCalc.mealTotals,
			mealLabelMap: mealLabelMap(),
			mealTypes: displayMealTypes()
		})
	);
	const chartMealTypes = $derived(chartContract.mealDistribution.map((m) => m.mealType));
	const mealProgressByType = $derived(() => {
		const periodDays = planType === 'weekly' ? 7 : 1;
		const progress = new Map<string, { count: number; target: number; percent: number }>();
		for (const mealType of displayMealTypes()) {
			let count = 0;
			for (const dateKey of dayDates()) {
				const slot = plan[dateKey]?.[mealType];
				if (slotHasContent(slot)) count += 1;
			}
			const percent = periodDays > 0 ? Math.round((count / periodDays) * 100) : 0;
			progress.set(mealType, {
				count,
				target: periodDays,
				percent: Math.max(0, Math.min(100, percent))
			});
		}
		return progress;
	});
	const mealProgressTypes = $derived(
		displayMealTypes().filter((mealType) => {
			const stats = mealProgressByType().get(mealType);
			return Boolean(stats && (stats.target > 0 || stats.count > 0));
		})
	);
	const supplementCaloriesTotal = $derived(() => {
		let total = 0;
		for (const daySlots of Object.values(currentWeekPlan())) {
			for (const slot of Object.values(daySlots)) {
				if (!slot.supplementId) continue;
				const resolved = resolveSupplementSlot(slot);
				if (!resolved) continue;
				total += resolved.effective.calories ?? 0;
			}
		}
		return total;
	});
	const microData = $derived(estimateMicros(supplementCaloriesTotal()));

	const recipeIngredientNames = $derived(() => {
		const map = new Map<number, string[]>();
		for (const { recipe } of data.recipes) {
			const ing = (recipe as any).ingredientNames as string[] | undefined;
			if (ing) map.set(recipe.id, ing);
		}
		return map;
	});
	const foodNamesById = $derived(() => {
		const map = new Map<number, string>();
		for (const food of data.foods) {
			map.set(food.id, food.nameAr ?? food.name);
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
						const baseVolume = s.volumeMl && s.volumeMl > 0 ? s.volumeMl : null;
						const slotVolume = slot.supplementVolumeMl && slot.supplementVolumeMl > 0 ? slot.supplementVolumeMl : baseVolume;
						const ratio = baseVolume && slotVolume ? slotVolume / baseVolume : 1;
						totals.sodium += (s.sodium ?? 0) * ratio;
						totals.potassium += (s.potassium ?? 0) * ratio;
						totals.phosphorus += (s.phosphorus ?? 0) * ratio;
						totals.calcium += (s.calcium ?? 0) * ratio;
						totals.fiber += (s.fiber ?? 0) * ratio;
					}
				}
			}
		}
		return totals;
	});

	const excludedFoodItemIds = $derived(() =>
		excludedFoods.filter((food) => food.foodId > 0).map((food) => food.foodId)
	);
	const excludedFoodNames = $derived(() => excludedFoods.map((food) => food.nameAr ?? food.name));

	const planValidation = $derived<ValidationResult>(
		validatePlan(
			currentWeekPlan(),
			excludedFoodItemIds(),
			selectedTags,
			selectedDietTypes,
			macros,
			recipeIngredientNames(),
			foodNamesById(),
			supplementNutrientTotals(),
			planCalc.totals.calories
		)
	);

	const usingImplicitCalorieGoal = $derived(targetCalories <= 0 && planCalc.totals.calories > 0);
	const macroTotal = $derived(macros.c + macros.p + macros.f);
	const aiMissingRequirements = $derived(() => {
		const missing: string[] = [];
		if (targetCalories <= 0) missing.push('حدد السعرات');
		if (macroTotal !== 100) missing.push('اجعل مجموع المغذيات 100%');
		if (selectedMeals.length === 0) missing.push('اختر نوع وجبة واحد على الأقل');
		return missing;
	});
	const canGenerateAi = $derived(() => aiMissingRequirements().length === 0);

	const supplementSlotMeta = $derived(() => {
		const meta: Record<
			string,
			{ volumeMl?: number; overrides?: { calories?: number; protein?: number; carbs?: number; fat?: number } }
		> = {};
		for (const [dateKey, daySlots] of Object.entries(plan)) {
			for (const [mealType, slot] of Object.entries(daySlots)) {
				if (!slot.supplementId) continue;
				const key = supplementSlotKey(dateKey, mealType);
				const item: { volumeMl?: number; overrides?: { calories?: number; protein?: number; carbs?: number; fat?: number } } = {};
				if (slot.supplementVolumeMl && slot.supplementVolumeMl > 0) item.volumeMl = slot.supplementVolumeMl;
				if (slot.supplementOverrides) {
					const overrides = {
						calories: toSafeNum(slot.supplementOverrides.calories),
						protein: toSafeNum(slot.supplementOverrides.protein),
						carbs: toSafeNum(slot.supplementOverrides.carbs),
						fat: toSafeNum(slot.supplementOverrides.fat)
					};
					if (Object.values(overrides).some((v) => v !== undefined)) item.overrides = overrides;
				}
				if (item.volumeMl !== undefined || item.overrides) {
					meta[key] = item;
				}
			}
		}
		return meta;
	});

	const builderConfigJson = $derived(
		(() => {
			const periodBuilder = periodBuilderMapWithCurrentSlice();
			const mirrorAnchor = snapToSubscriptionPeriod(timelineMaxDate, timelineAnchorBaseDate);
			// Keep legacy top-level fields for consumers that do not parse periodBuilder yet.
			const mirrorSlice = resolvePeriodSliceForAnchor(periodBuilder, 'weekly', mirrorAnchor, plan);
			return JSON.stringify({
			planType,
			diags: mirrorSlice.diags,
			targetCalories: mirrorSlice.targetCalories,
			excluded: mirrorSlice.excluded,
			excludedFoodItemIds: mirrorSlice.excludedFoodItemIds,
			macros: mirrorSlice.macros,
			selectedMeals: mirrorSlice.selectedMeals,
			tags: mirrorSlice.tags,
			dietTypes: mirrorSlice.dietTypes,
			extraNote: mirrorSlice.extraNote,
			periodBuilder,
			supplementSlotMeta: supplementSlotMeta()
			});
		})()
	);

	const planGridJson = $derived(JSON.stringify(plan));

	/* ─── FILTERED ITEMS FOR PICKER ─── */
	const pickerItems = $derived(() => {
		if (!pickerContext) return [];
		const q = pickerSearch.toLowerCase();
		const supplementsOnly = pickerContext.mealType === 'supplement' || pickerTab === 'supplement';

		if (supplementsOnly) {
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
	function toggleDiagRecBlockHeader(diagId: string) {
		diagRecBlockCollapsed = {
			...diagRecBlockCollapsed,
			[diagId]: !diagRecBlockCollapsed[diagId]
		};
	}

	function toggleDiag(id: string) {
		if (selectedDiags.includes(id)) selectedDiags = selectedDiags.filter((d) => d !== id);
		else selectedDiags = [...selectedDiags, id];
	}

	function resetCreateDiagForm() {
		newDiagName = '';
		newDiagNotes = '';
		createDiagError = '';
		editingDiagKey = null;
	}

	function diagPayloadFieldsForSave(
		existing: (typeof customDiags)[number] | undefined
	): {
		code: string;
		severity: 'mild' | 'moderate' | 'severe';
		diagnosedDate: string;
		status: 'active' | 'resolved' | 'managed';
	} {
		const sev = existing?.severity;
		const severity: 'mild' | 'moderate' | 'severe' =
			sev === 'mild' || sev === 'moderate' || sev === 'severe' ? sev : 'mild';
		const st = existing?.status;
		const status: 'active' | 'resolved' | 'managed' =
			st === 'active' || st === 'resolved' || st === 'managed' ? st : 'active';
		const diagnosedDate =
			existing?.diagnosedDate?.trim() || todayStr();
		return {
			code: (existing?.code ?? '').trim(),
			severity,
			diagnosedDate,
			status
		};
	}

	async function createDiagnosis() {
		createDiagError = '';
		if (!newDiagName.trim() || !newDiagNotes.trim()) {
			createDiagError = 'يرجى إدخال اسم التشخيص والملاحظات';
			return;
		}
		if (isCreatingDiag) return;
		isCreatingDiag = true;
		const diagKey = editingDiagKey ?? `custom_${Date.now()}`;
		const existing = editingDiagKey ? customDiags.find((x) => x.id === editingDiagKey) : undefined;
		const p = diagPayloadFieldsForSave(existing);
		const body = new FormData();
		body.append('diagKey', diagKey);
		body.append('name', newDiagName.trim());
		body.append('code', p.code);
		body.append('severity', p.severity);
		body.append('diagnosedDate', p.diagnosedDate);
		body.append('status', p.status);
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
				code: p.code,
				severity: p.severity,
				diagnosedDate: p.diagnosedDate,
				status: p.status,
				notes: newDiagNotes.trim()
			};
			customDiags = editingDiagKey
				? customDiags.map((d) => (d.id === diagKey ? updatedDiag : d))
				: [updatedDiag, ...customDiags];
			if (!selectedDiags.includes(diagKey)) selectedDiags = [...selectedDiags, diagKey];
			showCreateDiagModal = false;
			resetCreateDiagForm();
		} catch {
			createDiagError = 'تعذر الاتصال بالخادم.';
		} finally {
			isCreatingDiag = false;
		}
	}

	function startEditDiagnosis(diagId: string) {
		const d = customDiags.find((x) => x.id === diagId);
		if (!d) return;
		editingDiagKey = d.id;
		newDiagName = d.label;
		newDiagNotes = d.notes ?? '';
		createDiagError = '';
		showCreateDiagModal = true;
	}

	function diagnosisNoteLines(notes: string | null | undefined): string[] {
		if (!notes) return [];
		return notes
			.split(/\r?\n/)
			.map((line) => line.trim())
			.filter((line) => line.length > 0);
	}

	function pickExclusionFromCatalog(key: string) {
		const item = getExclusionCatalogItem(key);
		if (!item) return;
		const foodId = stableNegativeFoodId(key);
		const chip: ExcludedFoodChip = {
			foodId,
			name: item.labelAr,
			nameAr: item.labelAr,
			source: 'local'
		};
		addExcludedFood(chip);
		showExclusionDrop = false;
		exclusionSearchQuery = '';
	}

	function addExcludedFood(food: ExcludedFoodChip) {
		if (excludedFoods.some((item) => item.foodId === food.foodId)) return;
		excludedFoods = [...excludedFoods, food];
	}

	function removeExcludedFood(foodId: number) {
		excludedFoods = excludedFoods.filter((item) => item.foodId !== foodId);
	}

	function toggleMeal(id: MealTypeId) {
		if (selectedMeals.includes(id)) selectedMeals = selectedMeals.filter((x) => x !== id);
		else selectedMeals = [...selectedMeals, id];
	}

	function toggleTag(tag: string) {
		if (selectedTags.includes(tag)) selectedTags = selectedTags.filter((x) => x !== tag);
		else selectedTags = [...selectedTags, tag];
	}

	function toggleAiDraftDietType(tag: string) {
		if (aiDraftDietTypes.includes(tag))
			aiDraftDietTypes = aiDraftDietTypes.filter((x) => x !== tag);
		else aiDraftDietTypes = [...aiDraftDietTypes, tag];
	}

	function aiPresetIsOn(p: (typeof AI_DIET_MODAL_PRESETS)[number]) {
		const labels = p.dietTypes as readonly string[];
		return labels.length > 0 && labels.every((d) => aiDraftDietTypes.includes(d));
	}

	function toggleAiDietPreset(p: (typeof AI_DIET_MODAL_PRESETS)[number]) {
		const labels = p.dietTypes as readonly string[];
		if (aiPresetIsOn(p)) {
			aiDraftDietTypes = aiDraftDietTypes.filter((x) => !labels.includes(x));
			return;
		}
		const strip = new Set<string>([...((p as { stripOnSelect?: readonly string[] }).stripOnSelect ?? [])]);
		let next = aiDraftDietTypes.filter((x) => !strip.has(x));
		for (const dt of labels) {
			if (!next.includes(dt)) next = [...next, dt];
		}
		aiDraftDietTypes = [...DIET_TYPES].filter((dt) => next.includes(dt));
	}

	function closeAiModal() {
		showAiModal = false;
		showAiDietAdvanced = false;
		// Discard in-modal temporary selections when closing.
		aiDraftDietTypes = [...selectedDietTypes];
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
			const supplement = data.supplements.find((x) => x.id === item.id);
			plan[dateKey][mealType] = {
				supplementId: item.id,
				supplementVolumeMl: supplement?.volumeMl ?? undefined
			};
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
			if (supplementDetailCtx?.dateKey === dateKey && supplementDetailCtx?.mealType === mealType) {
				showSupplementDetail = false;
				supplementDetailCtx = null;
			}
			plan = { ...plan };
		}
	}

	function getSlotInfo(slot: PlanSlot) {
		if (slot.aiMeal) {
			return {
				name: slot.aiMeal.name,
				emoji: '',
				calories: slot.aiMeal.total?.calories ?? 0,
				type: 'ai' as const,
				imageUrl: slot.aiMeal.imageUrl ?? null
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
			const resolved = resolveSupplementSlot(slot);
			if (!resolved) return null;
			return { name: resolved.supplement.name, emoji: '', calories: resolved.effective.calories ?? 0, type: 'supplement' as const };
		}
		if (slot.foodItemId) {
			const f = data.foods.find((x) => x.id === slot.foodItemId);
			if (!f) return null;
			return { name: f.nameAr ?? f.name, emoji: '', calories: f.calories ?? 0, type: 'food' as const };
		}
		return null;
	}

	function openSupplementDetail(dateKey: string, mealType: string) {
		const slot = plan[dateKey]?.[mealType];
		if (!slot?.supplementId) return;
		supplementDetailCtx = { dateKey, mealType };
		showSupplementDetail = true;
	}

	function closeSupplementDetail() {
		showSupplementDetail = false;
		supplementDetailCtx = null;
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

	async function savePlan(payload: {
		builderConfig: string;
		planGrid: string;
		planType: 'daily' | 'weekly';
		recommendation: string;
		startDate: string;
	}) {
		const body = new FormData();
		body.append('builderConfig', payload.builderConfig);
		body.append('planGrid', payload.planGrid);
		body.append('planType', payload.planType);
		body.append('recommendation', payload.recommendation);
		body.append('startDate', payload.startDate);
		const res = await saveMealPlan(body);
		if (!res.ok) throw new Error(`Save failed: ${res.status}`);
	}

	async function clearAllMealsForThisSession() {
		const dateYmd = planType === 'daily' ? effectiveSummaryDate() : null;

		const ok = confirm(
			dateYmd
				? 'سيتم حذف جميع وجبات هذا اليوم فقط (لهذه الجلسة). هل أنت متأكد؟'
				: 'سيتم حذف جميع الوجبات لهذه الجلسة فقط (كل الأيام). هل أنت متأكد؟'
		);
		if (!ok) return;
		try {
			const res = await clearMealPlanMeals(dateYmd ?? undefined);
			if (!res.ok) throw new Error(`Clear failed: ${res.status}`);
			if (dateYmd) {
				if (plan[dateYmd]) {
					delete plan[dateYmd];
					plan = { ...plan };
				}
			} else {
				plan = {};
			}
			selectedSummaryDate = null;
			showMealDetail = false;
			showAiMealDetail = false;
			showSupplementDetail = false;
		} catch {
			alert('تعذر حذف الوجبات الآن. حاول مرة أخرى.');
		}
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
		aiFoodSearchOpen = false;
		aiFoodSearchQuery = '';
		showAiMealEdit = true;
	}

	function openAiMealDetail(dateKey: string, mealType: string, aiMeal: AiMealData) {
		aiMealDetailCtx = { dateKey, mealType, aiMeal };
		showAiMealDetail = true;
	}

	function closeAiMealDetail() {
		showAiMealDetail = false;
		aiMealDetailCtx = null;
	}

	type AiFoodSearchItem = {
		key: string;
		name: string;
		nameAr: string | null;
		calories: number;
		protein: number;
		carbs: number;
		fat: number;
		source: 'local' | 'external-db' | 'api';
	};

	const aiLocalFoodMatches = $derived(() => {
		const q = aiFoodSearchQuery.trim().toLowerCase();
		if (!q) return [];
		return data.foods
			.filter((f) => (f.nameAr ?? '').toLowerCase().includes(q) || f.name.toLowerCase().includes(q))
			.map((f) => ({
				key: `local:${f.id}`,
				name: f.name,
				nameAr: f.nameAr ?? null,
				calories: Number(f.calories ?? 0),
				protein: Number(f.protein ?? 0),
				carbs: Number(f.carbs ?? 0),
				fat: Number(f.fat ?? 0),
				source: 'local' as const
			}));
	});

	const aiFoodSearchResults = $derived<AiFoodSearchItem[]>(() => {
		const merged = new Map<string, AiFoodSearchItem>();
		const seenSig = new Set<string>();
		for (const localItem of aiLocalFoodMatches()) {
			merged.set(localItem.key, localItem);
			seenSig.add((localItem.nameAr ?? localItem.name).trim().toLowerCase());
		}
		for (const remote of aiFoodSearchRemoteResults) {
			const name = remote.nameAr ?? remote.name;
			const sig = name.trim().toLowerCase();
			if (!sig) continue;
			if (seenSig.has(sig)) continue;
			const key = `remote:${sig}`;
			seenSig.add(sig);
			merged.set(key, {
				key,
				name: remote.name,
				nameAr: remote.nameAr ?? null,
				calories: Number(remote.calories ?? 0),
				protein: Number(remote.protein ?? 0),
				carbs: Number(remote.carbs ?? 0),
				fat: Number(remote.fat ?? 0),
				source: remote.id === null ? 'api' : 'external-db'
			});
		}
		return [...merged.values()];
	});

	async function searchAiFoods() {
		clearTimeout(aiFoodSearchTimer);
		aiFoodSearchTimer = setTimeout(async () => {
			const q = aiFoodSearchQuery.trim();
			aiFoodSearchError = '';
			if (q.length < 2) {
				aiFoodSearchRemoteResults = [];
				aiFoodSearchLoading = false;
				aiFoodSearchHasSearched = false;
				return;
			}
			aiFoodSearchLoading = true;
			aiFoodSearchHasSearched = true;
			try {
				// external-search endpoint checks external DB first, then API fallback.
				aiFoodSearchRemoteResults = await searchRecipeFoods(q);
			} catch {
				aiFoodSearchRemoteResults = [];
				aiFoodSearchError = 'تعذر البحث الآن، حاول مرة أخرى.';
			} finally {
				aiFoodSearchLoading = false;
			}
		}, 220);
	}

	function openAiFoodSearch() {
		aiFoodSearchOpen = true;
		aiFoodSearchQuery = '';
		aiFoodSearchRemoteResults = [];
		aiFoodSearchLoading = false;
		aiFoodSearchHasSearched = false;
		aiFoodSearchError = '';
	}

	function addAiIngredientFromFood(food: {
		name: string;
		nameAr: string | null;
		calories: number;
		protein: number;
		carbs: number;
		fat: number;
	}) {
		aiMealEditIngredients = [
			...aiMealEditIngredients,
			{
				name_ar: food.nameAr ?? food.name,
				quantity: 100,
				unit: 'g',
				calories: Number(food.calories ?? 0),
				protein: Number(food.protein ?? 0),
				carbs: Number(food.carbs ?? 0),
				fat: Number(food.fat ?? 0)
			}
		];
		aiFoodSearchOpen = false;
		aiFoodSearchQuery = '';
		aiFoodSearchRemoteResults = [];
		aiFoodSearchLoading = false;
		aiFoodSearchHasSearched = false;
		aiFoodSearchError = '';
	}

	function removeAiIngredient(i: number) {
		aiMealEditIngredients = aiMealEditIngredients.filter((_, idx) => idx !== i);
	}

	/** Ingredient macros are stored as totals for the listed quantity (AI + editor), not per-100g. */
	function sumAiIngredientLineTotals(ings: AiMealData['ingredients']) {
		return ings.reduce(
			(acc, ing) => ({
				calories: acc.calories + (Number(ing.calories) || 0),
				protein: acc.protein + (Number(ing.protein) || 0),
				carbs: acc.carbs + (Number(ing.carbs) || 0),
				fat: acc.fat + (Number(ing.fat) || 0)
			}),
			{ calories: 0, protein: 0, carbs: 0, fat: 0 }
		);
	}

	function formatAiMacroDisplay(n: number): string {
		const r = Math.round((Number(n) || 0) * 10) / 10;
		return Number.isInteger(r) ? String(r) : r.toFixed(1);
	}

	function updateAiIngredientField<K extends keyof AiMealData['ingredients'][number]>(
		index: number,
		key: K,
		value: AiMealData['ingredients'][number][K]
	) {
		aiMealEditIngredients = aiMealEditIngredients.map((ing, i) =>
			i === index ? { ...ing, [key]: value } : ing
		);
	}

	const aiMealEditTotal = $derived(sumAiIngredientLineTotals(aiMealEditIngredients));

	function saveAiMealEdit() {
		if (!aiMealEditCtx) return;
		const { dateKey, mealType } = aiMealEditCtx;
		if (!plan[dateKey]) plan[dateKey] = {};
		plan[dateKey][mealType] = {
			aiMeal: {
				name: aiMealEditName,
				ingredients: aiMealEditIngredients,
				total: aiMealEditTotal,
				steps: aiMealEditSteps
			}
		};
		plan = { ...plan };
		showAiMealEdit = false;
		aiMealEditCtx = null;
		aiFoodSearchOpen = false;
		aiFoodSearchQuery = '';
		aiFoodSearchRemoteResults = [];
		aiFoodSearchLoading = false;
		aiFoodSearchHasSearched = false;
		aiFoodSearchError = '';
	}

	function closeAiMealEditModal() {
		showAiMealEdit = false;
		aiMealEditCtx = null;
		aiFoodSearchOpen = false;
		aiFoodSearchQuery = '';
		aiFoodSearchRemoteResults = [];
		aiFoodSearchLoading = false;
		aiFoodSearchHasSearched = false;
		aiFoodSearchError = '';
	}

	function closeDropdowns(e: MouseEvent) {
		const target = e.target as HTMLElement;
		if (!target.closest('.diag-drop-zone')) showDiagDrop = false;
		if (!target.closest('.exclusion-drop-zone')) {
			showExclusionDrop = false;
			exclusionSearchQuery = '';
		}
	}

	async function onExclusionSearchFocus() {
		showDiagDrop = false;
		if (!showExclusionDrop) {
			showExclusionDrop = true;
			await tick();
		}
	}

	const detailRecipe = $derived(
		detailRecipeId ? data.recipes.find((r) => r.recipe.id === detailRecipeId)?.recipe ?? null : null
	);
	const detailNutrients = $derived(detailRecipe ? parseNutrients(detailRecipe.nutrients) : null);
	let isExporting = $state(false);

	function escHtml(str: string): string {
		return str
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;');
	}

	async function exportToPdf(scope: 'day' | 'week') {
		if (isExporting) return;
		isExporting = true;
		try {
			const start = new Date(weeklyAnchorStart() + 'T00:00:00');
			const allDates = [0, 1, 2, 3, 4, 5, 6].map((i) => toLocalYmd(new Date(start.getTime() + i * 86400000)));
			const allLabels = [0, 1, 2, 3, 4, 5, 6].map((i) => {
				const d = new Date(start.getTime() + i * 86400000);
				return `${DAYS_W[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
			});

			const exportDates = scope === 'week' ? allDates : [dayDates()[0]];
			const exportLabels = scope === 'week' ? allLabels : [allLabels[allDates.indexOf(dayDates()[0])]];

			const usedIds = new Set<string>();
			for (const dk of exportDates) {
				for (const mid of Object.keys(plan[dk] ?? {})) {
					if (slotHasContent(plan[dk][mid])) usedIds.add(mid);
				}
			}
			const orderedMealTypes = MEAL_TYPES.filter((m) => usedIds.has(m.id));

			const days = exportDates.map((dateKey, i) => {
				const daySlots = plan[dateKey] ?? {};
				const meals = orderedMealTypes
					.map(({ id: mid, label: mealLabel }) => {
						const slot = daySlots[mid];
						if (!slot || !slotHasContent(slot)) return null;

						if (slot.aiMeal) {
							return {
								mealLabel: escHtml(mealLabel),
								name: escHtml(slot.aiMeal.name),
								calories: Math.round(slot.aiMeal.total?.calories ?? 0),
								protein: Math.round(slot.aiMeal.total?.protein ?? 0),
								carbs: Math.round(slot.aiMeal.total?.carbs ?? 0),
								fat: Math.round(slot.aiMeal.total?.fat ?? 0),
								steps: slot.aiMeal.steps ? escHtml(slot.aiMeal.steps) : null,
								imageUrl: null as string | null
							};
						}

						if (slot.recipeId) {
							const r = data.recipes.find((x) => x.recipe.id === slot.recipeId);
							if (!r) return null;
							const n = parseNutrients(r.recipe.nutrients);
							return {
								mealLabel: escHtml(mealLabel),
								name: escHtml(r.recipe.nameAr ?? r.recipe.name),
								calories: Math.round(n?.calories ?? 0),
								protein: Math.round(n?.protein ?? 0),
								carbs: Math.round(n?.carbs ?? 0),
								fat: Math.round(n?.fat ?? 0),
								steps: r.recipe.steps ? escHtml(r.recipe.steps) : null,
								imageUrl: r.recipe.imageUrl ? escHtml(r.recipe.imageUrl) : null
							};
						}

						if (slot.supplementId) {
							const s = data.supplements.find((x) => x.id === slot.supplementId);
							if (!s) return null;
							return {
								mealLabel: escHtml(mealLabel),
								name: escHtml(s.name),
								calories: Math.round(s.totalKcal ?? 0),
								protein: Math.round((s as any).protein ?? 0),
								carbs: Math.round((s as any).carbs ?? 0),
								fat: Math.round((s as any).fat ?? 0),
								steps: null as string | null,
								imageUrl: null as string | null
							};
						}

						if (slot.foodItemId) {
							const f = data.foods.find((x) => x.id === slot.foodItemId);
							if (!f) return null;
							return {
								mealLabel: escHtml(mealLabel),
								name: escHtml(f.nameAr ?? f.name),
								calories: Math.round((f as any).calories ?? 0),
								protein: 0,
								carbs: 0,
								fat: 0,
								steps: null as string | null,
								imageUrl: null as string | null
							};
						}

						return null;
					})
					.filter(Boolean) as {
						mealLabel: string;
						name: string;
						calories: number;
						protein: number;
						carbs: number;
						fat: number;
						steps: string | null;
						imageUrl: string | null;
					}[];

				return { label: escHtml(exportLabels[i]), meals };
			});

			const patientName = escHtml(data.patient.name);
			const scopeLabel = scope === 'week' ? 'الخطة الأسبوعية' : 'الخطة اليومية';
			const dateRange = escHtml(
				scope === 'week' ? `${exportLabels[0]} — ${exportLabels[exportLabels.length - 1]}` : exportLabels[0]
			);

			const scopeClass = scope === 'week' ? 'scope-week' : 'scope-day';
			const html = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${scopeLabel}</title>
<link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&display=swap" rel="stylesheet"/>
<style>
body{font-family:'Tajawal',sans-serif;background:#f7f8fa;margin:0;padding:20px;color:#1a1d23}
.hd{background:linear-gradient(135deg,#3cb96b,#2ea55d);color:#fff;border-radius:14px;padding:16px 18px;margin-bottom:12px}
.hd h1{margin:0 0 6px;font-size:22px}
.hd p{margin:0;font-size:12px;opacity:.96}
.day{background:#fff;border-radius:12px;padding:14px 14px;margin-bottom:12px;border:1px solid #e8eaed;break-inside:avoid}
.day h2{margin:0 0 10px;font-size:16px}
.scope-day .day{padding:16px 16px 14px}
.scope-day .day h2{font-size:18px}
.scope-week .day{padding:12px}
.scope-week .day h2{font-size:15px}
.meal-card{background:#fbfcfe;border:1px solid #edf1f4;border-radius:10px;padding:10px;margin-top:8px;break-inside:avoid}
.meal-card:first-of-type{margin-top:0}
.meal-head{display:flex;justify-content:space-between;gap:8px;align-items:flex-start}
.meal-label{font-size:12px;color:#3cb96b;font-weight:800}
.meal-name{font-size:14px;font-weight:800;line-height:1.5}
.meal-image-wrap{margin-top:8px;border:1px solid #e8eaed;border-radius:9px;overflow:hidden;background:#f3f5f8}
.meal-image{display:block;width:100%;max-height:170px;object-fit:cover}
.meal-meta{font-size:12px;color:#6b7280;margin-top:7px}
.steps{margin-top:8px;background:#f4f7fb;border-radius:8px;padding:8px 9px}
.steps-title{font-size:12px;font-weight:800;color:#334155;margin-bottom:3px}
.steps-text{font-size:12.5px;color:#4b5563;line-height:1.65;white-space:pre-wrap}
.empty{font-size:12px;color:#6b7280}
@media print{
	body{padding:0;background:#fff}
	.day{box-shadow:none}
}
</style>
</head>
<body class="${scopeClass}">
<div class="hd"><h1>${patientName}</h1><p>${scopeLabel} · ${dateRange}</p></div>
${days
	.map((d) => `<div class="day"><h2>${d.label}</h2>${
		d.meals.length
			? d.meals
					.map(
						(m) => `<div class="meal-card">
<div class="meal-head"><div class="meal-name">${m.name}</div><div class="meal-label">${m.mealLabel}</div></div>
${m.imageUrl ? `<div class="meal-image-wrap"><img class="meal-image" src="${m.imageUrl}" alt="${m.name}" loading="lazy" referrerpolicy="no-referrer" /></div>` : ''}
<div class="meal-meta">${m.calories} kcal · P ${m.protein}g · C ${m.carbs}g · F ${m.fat}g</div>
${m.steps ? `<div class="steps"><div class="steps-title">طريقة التحضير</div><div class="steps-text">${m.steps}</div></div>` : ''}
</div>`
					)
					.join('')
			: '<div class="empty">لا توجد وجبات</div>'
	}</div>`)
	.join('')}
<script>window.addEventListener('load',()=>setTimeout(()=>window.print(),450));<\/script>
</body>
</html>`;

			const popup = window.open('', '_blank', 'width=900,height=900,scrollbars=yes');
			if (!popup) {
				alert('يرجى السماح بالنوافذ المنبثقة لتصدير الخطة');
				return;
			}
			popup.document.write(html);
			popup.document.close();
			popup.focus();
			setTimeout(() => {
				try {
					popup.print();
				} catch {
					// ignore
				}
			}, 550);
		} finally {
			isExporting = false;
		}
	}

	const supplementDetailSlot = $derived(
		supplementDetailCtx ? plan[supplementDetailCtx.dateKey]?.[supplementDetailCtx.mealType] ?? null : null
	);
	const supplementDetailData = $derived(
		supplementDetailSlot ? resolveSupplementSlot(supplementDetailSlot as PlanSlot) : null
	);
</script>

<svelte:head><title>الخطة الغذائية — {data.patient.name} — نيوتريكير</title></svelte:head>
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div onclick={closeDropdowns}>

<style>
	/* ─── LAYOUT ─── */
	.builder-wrap {
		/* Local design tokens (scoped to this screen) */
		--nc-radius-lg: 16px;
		--nc-radius-md: 12px;
		--nc-radius-sm: 10px;
		--nc-border: #e8eaed;
		--nc-border-soft: #eef1f5;
		--nc-text: #1a1d23;
		--nc-muted: #8b909a;
		--nc-accent: #3cb96b;
		--nc-accent-ink: #1f9e57;
		--nc-accent-2: #2563eb; /* secondary mode accent (weekly) */
		--nc-surface: #ffffff;
		--nc-surface-2: #fbfcfe;
		--nc-shadow: 0 1px 10px rgba(16, 24, 40, 0.06);
		--nc-shadow-hover: 0 8px 24px rgba(16, 24, 40, 0.08);

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
	.form-card {
		background: var(--nc-surface);
		border-radius: var(--nc-radius-lg);
		box-shadow: var(--nc-shadow);
		border: 1px solid var(--nc-border-soft);
		padding: 20px 22px;
		margin-bottom: 14px;
		transition: box-shadow 0.2s, border-color 0.2s, transform 0.2s;
	}
	.form-card:hover { box-shadow: var(--nc-shadow-hover); border-color: #e1e7ef; }
	.form-card--indexed {
		display: grid;
		grid-template-columns: 24px minmax(0, 1fr);
		column-gap: 10px;
		align-items: start;
	}
	.form-card--indexed > .form-card-index {
		grid-column: 1;
		align-self: center;
	}
	.form-card--indexed > :not(.form-card-index) { grid-column: 2; }
	.form-card-index {
		width: 24px;
		height: 24px;
		border-radius: 999px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		font-size: 11.5px;
		font-weight: 800;
		line-height: 1;
		color: #1f2937;
		background: #eef2f7;
		border: 1px solid #d9e1ea;
	}
	.form-card--tight-pb { padding-bottom: 14px; }
	.field-label { display:flex; align-items:center; gap:9px; font-size:13px; font-weight:700; color:#6f7785; margin-bottom:9px; }
	.req-star {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		color: #dc2626;
		font-weight: 900;
		font-size: 13px;
		line-height: 1;
		margin-inline-start: 2px;
		transform: translateY(-0.5px);
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
	.form-required-legend {
		font-size: 11px;
		font-weight: 700;
		color: #8b909a;
		margin: -2px 0 10px;
		line-height: 1.35;
	}
	.field-label-optional {
		font-size: 11px;
		font-weight: 800;
		color: #a0a8b7;
		margin-inline-start: 6px;
		white-space: nowrap;
	}

	.card-hd {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		flex-wrap: wrap;
		margin-bottom: 10px;
	}
	.card-hd--plan-type { flex-wrap: nowrap; }
	.card-hd--plan-type .field-label { flex: 0 0 auto; }
	.card-hd--plan-type .plan-switch {
		flex: 1 1 auto;
		min-width: 0;
	}
	.card-hd--tight { margin-bottom: 12px; }
	.card-hd .field-label { margin-bottom: 0; }
	/* Tighter label spacing for stacked sections (must beat `.card-hd .field-label` when combined) */
	.field-label.field-label--tight { margin-bottom: 4px; }
	.card-hd-start { display:flex; align-items:center; gap:8px; min-width:0; }
	.card-help {
		font-size: 10.5px;
		font-weight: 600;
		color: var(--nc-muted);
		line-height: 1.45;
		margin: 0 0 10px;
	}
	.card-help--mt6 { margin-top: 6px; }
	.drop-zone { position: relative; }

	/* ─── BUTTONS ─── */
	.plan-switch { display:flex; gap:8px; background:#f6f8fb; border:1px solid #e8edf3; border-radius:12px; padding:6px; }
	.plan-btn { flex:1; padding:10px; border-radius:9px; border:1.5px solid transparent; background:transparent; font-size:14px; font-weight:700; color:#7b8493; cursor:pointer; transition:.2s; font-family:'Tajawal',sans-serif; }
	.plan-btn.active { border-color:#3cb96b; background:#fff; color:#1f9e57; box-shadow:0 2px 8px rgba(46,165,93,.16); }
	.plan-btn:hover:not(.active) { border-color:#d7deea; background:#fff; color:#4d5563; }
	.plan-btn--accent.active {
		border-color: rgba(37, 99, 235, 0.35);
		color: var(--nc-accent-2);
		box-shadow: 0 2px 10px rgba(37, 99, 235, 0.14);
	}

	.btn-compact {
		border: 1.5px solid var(--nc-border);
		background: var(--nc-surface);
		color: var(--nc-text);
		border-radius: var(--nc-radius-sm);
		padding: 8px 12px;
		font-size: 12px;
		font-weight: 700;
		cursor: pointer;
		font-family: 'Tajawal', sans-serif;
		transition: border-color 0.15s ease, background 0.15s ease, color 0.15s ease;
		white-space: nowrap;
	}
	.btn-compact:hover {
		border-color: #d7deea;
		background: #f4f6f9;
		color: #374151;
	}
	.btn-compact:focus-visible {
		outline: 2px solid rgba(75, 85, 99, 0.35);
		outline-offset: 2px;
	}

	.btn-ghost {
		border: 1.5px solid var(--nc-border);
		background: #f4f6f9;
		color: var(--nc-muted);
		border-radius: var(--nc-radius-sm);
		padding: 6px 12px;
		font-size: 11px;
		font-weight: 800;
		cursor: pointer;
		font-family: 'Tajawal', sans-serif;
		transition: border-color 0.15s ease, color 0.15s ease, background 0.15s ease, transform 0.12s ease;
	}
	.btn-ghost:hover {
		border-color: #d7deea;
		background: #fff;
		color: #4d5563;
		transform: translateY(-1px);
	}
	.btn-ghost--danger:hover {
		border-color: rgba(239, 68, 68, 0.55);
		color: #ef4444;
		background: #fff5f5;
	}
	.btn-ghost:focus-visible {
		outline: 2px solid rgba(75, 85, 99, 0.35);
		outline-offset: 2px;
	}

	.btn-ai {
		flex: 1;
		padding: 13px 16px;
		border-radius: var(--nc-radius-md);
		border: none;
		color: #fff;
		font-size: 14px;
		font-weight: 700;
		cursor: pointer;
		transition: box-shadow 0.2s ease, transform 0.15s ease, opacity 0.15s ease;
		font-family: 'Tajawal', sans-serif;
		background: linear-gradient(165deg, #34b16f 0%, #2a9d62 45%, #1f7a4a 100%);
		box-shadow: 0 4px 18px rgba(42, 157, 98, 0.28);
	}
	.btn-ai:hover:not(:disabled) {
		transform: translateY(-1px);
		box-shadow: 0 8px 26px rgba(42, 157, 98, 0.34);
	}
	.btn-ai:disabled {
		opacity: 0.6;
		cursor: not-allowed;
		box-shadow: none;
		transform: none;
	}
	.btn-ai:focus-visible {
		outline: 2px solid #166534;
		outline-offset: 2px;
	}

	/* ─── SELECT BOXES ─── */
	.ing-search-wrap {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 6px;
		border: 1.5px solid #e8eaed;
		border-radius: var(--nc-radius-md);
		padding: 8px 12px;
		background: #fff;
		min-height: 44px;
	}
	.ing-search-input {
		flex: 1 1 220px;
		min-width: 180px;
		border: 0;
		outline: none;
		background: transparent;
		font-size: 13px;
		font-family: 'Tajawal', sans-serif;
		color: #111827;
	}
	.ing-search-input::placeholder { color: #9ca3af; }
	.ing-dropdown {
		position: absolute;
		top: calc(100% + 4px);
		right: 0;
		left: 0;
		background: #fff;
		border: 1.5px solid #e2e8f0;
		border-radius: 10px;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
		z-index: 220;
		overflow-y: auto;
		max-height: 260px;
	}
	.ing-dropdown-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		padding: 9px 14px;
		background: none;
		border: none;
		cursor: pointer;
		font-family: 'Tajawal', sans-serif;
		transition: background .12s;
		text-align: right;
	}
	.ing-dropdown-row:hover { background: #f0fdf4; }
	.ing-dropdown-name { font-size: 13px; font-weight: 500; color: #1e293b; }
	.ing-dropdown-cal { font-size: 11px; color: #94a3b8; }
	.ing-dropdown-empty { padding: 10px 14px; font-size: 12px; color: #64748b; text-align: right; }

	.exclusion-catalog-block {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	/* Search lives in the trigger card; dropdown is list-only */
	.exclusion-combo-card {
		border: 1.5px solid #e8eaed;
		border-radius: var(--nc-radius-md);
		background: #fff;
		overflow: hidden;
		transition: border-color 0.15s, box-shadow 0.15s;
	}
	.exclusion-combo-card:hover {
		border-color: #3cb96b;
		box-shadow: 0 0 0 3px rgba(60, 185, 107, 0.1);
	}
	.exclusion-combo-search.ing-search-wrap {
		border: none;
		background: #f8fafc;
	}
	.exclusion-combo-search.exclusion-drop-search {
		flex-shrink: 0;
		margin: 0;
		border-radius: 0;
		border-bottom: 1px solid #e8eaed;
	}
	.exclusion-combo-search.exclusion-drop-search:focus-within {
		border-color: transparent;
		box-shadow: none;
	}
	.exclusion-combo-card:has(.exclusion-combo-search:focus-within) {
		border-color: #3cb96b;
		box-shadow: 0 0 0 3px rgba(60, 185, 107, 0.1);
	}
	.exclusion-chips-bar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
		padding: 8px 12px;
		border-top: 1px solid #e8eaed;
		background: #fff;
	}
	.exclusion-combo-card .ing-search-input {
		min-width: 0;
	}
	.exclusion-dropdown {
		max-height: min(58vh, 380px);
		display: flex;
		flex-direction: column;
		padding: 0;
		overflow: hidden;
	}
	.exclusion-drop-scroll {
		overflow-y: auto;
		flex: 1;
		min-height: 0;
		-webkit-overflow-scrolling: touch;
	}
	.exclusion-drop-item:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}
	.exclusion-drop-empty {
		padding: 12px 14px;
	}

	.sel-box {
		border: 1.5px solid #e8eaed;
		border-radius: var(--nc-radius-md);
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
	.sel-box--exc {
		background: #fff;
		padding-inline-end: 12px;
	}
	.sel-box--exc.sel-box--filled {
		border-color: #e8eaed;
		box-shadow: none;
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
	.chip-label-text { font: inherit; color: inherit; font-weight: 600; }
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
	/* ─── INPUTS ─── */
	.cal-input { flex:1; min-width:0; border:1.5px solid #e8eaed; border-radius:var(--nc-radius-md); padding:9px 12px; font-size:13px; outline:none; transition:border-color .15s; color:#1a1d23; font-family:'Tajawal',sans-serif; }
	.cal-input:focus { border-color:#3cb96b; }
	.calories-row { display:flex; gap:8px; align-items:stretch; flex-wrap:wrap; }
	.kcal-suffix {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0 12px;
		background: #f4f6f9;
		border: 1.5px solid #e8eaed;
		border-radius: var(--nc-radius-md);
		font-size: 13px;
		font-weight: 600;
		color: #8b909a;
		white-space: nowrap;
		flex-shrink: 0;
	}
	.macro-header-row { display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; font-size:12px; font-weight:700; color: var(--nc-muted); margin-bottom: 14px; }
	.macro-header-row > span:last-child { flex-shrink:0; max-width:100%; }
	.macro-sum-pill {
		font-size: 11px;
		padding: 4px 10px;
		border-radius: 999px;
		font-weight: 900;
		transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease;
		border: 1px solid transparent;
	}
	.macro-sum-pill.ok { background: #edf9f2; color: #1f9e57; border-color: #c5edd8; }
	.macro-sum-pill.bad { background: #fff1f2; color: #dc2626; border-color: #fecdd3; }
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
	.macro-pill { flex:1; border-radius:12px; padding:12px 10px; display:flex; flex-direction:column; align-items:center; gap:4px; border: 1px solid rgba(232, 234, 237, 0.95); }
	.macro-pill-pct { font-size:22px; font-weight:800; line-height:1; }
	.macro-pill--c { background: linear-gradient(180deg, #f7fbff 0%, #eef4ff 100%); }
	.macro-pill--p { background: linear-gradient(180deg, #fffafa 0%, #fff0f0 100%); }
	.macro-pill--f { background: linear-gradient(180deg, #fffdf7 0%, #fffbeb 100%); }
	.macro-pill-lbl { font-size: 11px; font-weight: 800; color: var(--nc-muted); }
	.macro-pill-sub { font-size: 10px; color: #b0b5c0; font-weight: 700; }
	.slider { flex:1; -webkit-appearance:none; height:5px; border-radius:3px; outline:none; cursor:pointer; }
	.slider::-webkit-slider-thumb { -webkit-appearance:none; width:18px; height:18px; border-radius:50%; cursor:pointer; border:2px solid #fff; box-shadow:0 1px 4px rgba(0,0,0,.2); }

	/* ─── MEALS ─── */
	.meal-chip { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:12px 14px; border:1.5px solid #e8eaed; border-radius:var(--nc-radius-md); cursor:pointer; transition:all .15s; user-select:none; background:#fff; font-family:'Tajawal',sans-serif; font-size:13px; font-weight:600; color:#6b7280; min-height:48px; }
	.meal-chip:hover { border-color:#c5edd8; background:#fafffe; }
	.meal-chip.on { border-color:#3cb96b; background:#edf9f2; color:#1f9e57; font-weight:700; }
	.meal-chip.in-view-period:not(.on) { box-shadow: inset 3px 0 0 0 #7dd3a0; background:#fafffe; }
	.meal-chip.in-view-period.on { box-shadow: inset 3px 0 0 0 #22c55e; }
	.meal-chip-label { flex: 1; min-width: 0; text-align: right; }

	/* ─── TAGS ─── */
	.tag-btn { border:1.5px solid #e8eaed; border-radius:20px; padding:8px 16px; font-size:12.5px; font-weight:600; color:#6b7280; cursor:pointer; transition:.15s; user-select:none; background:#fff; font-family:'Tajawal',sans-serif; min-height:40px; }
	.tag-btn:hover { border-color:#3cb96b; color:#3cb96b; background:#edf9f2; }
	.tag-btn.on { border-color:#3cb96b; background:#edf9f2; color:#1f9e57; font-weight:700; }

	/* ─── GENERATE ─── */
	.btn-generate { width:100%; padding:14px; border-radius:10px; border:none; background:#3cb96b; color:#fff; font-size:15px; font-weight:700; cursor:pointer; transition:.15s; letter-spacing:.2px; font-family:'Tajawal',sans-serif; }
	.btn-generate:hover { background:#2ea55d; }
	.btn-generate:active { transform:scale(.98); }

	/* ─── RIGHT PANEL ─── */
	.chart-card {
		background: var(--nc-surface);
		border-radius: var(--nc-radius-lg);
		box-shadow: var(--nc-shadow);
		padding: 18px;
		border: 1px solid var(--nc-border-soft);
		position: static;
		height: auto !important;
		max-height: none !important;
		overflow: visible !important;
		transition: box-shadow 0.2s ease, border-color 0.2s ease, transform 0.2s ease;
	}
	.chart-card:hover {
		box-shadow: var(--nc-shadow-hover);
		border-color: #e1e7ef;
	}
	.chart-card-title {
		font-size: 13px;
		font-weight: 900;
		color: var(--nc-text);
		margin: 0 0 14px;
		letter-spacing: -0.01em;
	}
	.chart-card-action-row {
		display: flex;
		gap: 8px;
		align-items: stretch;
		margin-top: 10px;
		flex-wrap: nowrap;
	}
	/* Shared row actions — matches btn-compact / topbar-save-btn platform language */
	.chart-card-action-btn {
		touch-action: manipulation;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 4px;
		font-family: 'Tajawal', sans-serif;
		font-weight: 700;
		cursor: pointer;
		min-width: 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		border-radius: var(--nc-radius-sm);
		transition:
			border-color 0.15s ease,
			background 0.15s ease,
			color 0.15s ease,
			transform 0.12s ease,
			box-shadow 0.15s ease,
			opacity 0.15s ease;
	}
	.chart-card-action-row > .chart-card-action-btn {
		flex: 1 1 0;
		min-height: 40px;
		padding: 8px 6px;
		font-size: 12px;
		line-height: 1.15;
	}
	.chart-card-action-btn:focus-visible {
		outline: 2px solid rgba(75, 85, 99, 0.35);
		outline-offset: 2px;
	}
	.chart-card-action-row > .topbar-publish-btn {
		flex-shrink: 1;
		border: 1.5px solid #c5edd8;
		background: var(--nc-surface);
		color: var(--nc-accent-ink);
	}
	.chart-card-action-row > .topbar-publish-btn:hover:not(:disabled) {
		border-color: var(--nc-accent);
		background: #f4fbf7;
		color: #166534;
		transform: translateY(-1px);
	}
	.chart-card-action-row > .topbar-publish-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
		transform: none;
	}
	.chart-card-action-row > .topbar-publish-btn.publish-active {
		background: #edf9f2;
		border-color: #9bd5b2;
		color: #166534;
	}
	.chart-card-action-row > .chart-card-export-btn {
		border: none;
		background: linear-gradient(160deg, #42c073, #29a25a);
		color: #fff;
		box-shadow: 0 4px 14px rgba(41, 162, 90, 0.28);
	}
	.chart-card-action-row > .chart-card-export-btn:hover:not(:disabled) {
		background: linear-gradient(160deg, #36b467, #218c4d);
		transform: translateY(-1px);
		box-shadow: 0 6px 18px rgba(33, 140, 77, 0.32);
	}
	.chart-card-action-row > .chart-card-export-btn:focus-visible {
		outline: 2px solid #166534;
		outline-offset: 2px;
	}
	.chart-card-action-row > .chart-card-export-btn:disabled {
		opacity: 0.55;
		cursor: not-allowed;
		transform: none;
		box-shadow: none;
	}
	.chart-card-action-row > .share-trigger-btn {
		border: 1.5px solid var(--nc-border);
		background: var(--nc-surface);
		color: var(--nc-text);
	}
	.chart-card-action-row > .share-trigger-btn:hover:not(:disabled) {
		border-color: #d7deea;
		background: #f4f6f9;
		color: #374151;
		transform: translateY(-1px);
	}
	.chart-card-action-row > .share-trigger-btn:disabled {
		opacity: 0.65;
		cursor: not-allowed;
		transform: none;
	}
	.chart-card-action-label {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.chart-card-action-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.25rem;
		height: 1.25rem;
		flex-shrink: 0;
		color: inherit;
	}
	.chart-card-action-icon svg {
		width: 100%;
		height: 100%;
		display: block;
	}
	.chart-card-action-spinner {
		width: 1.125rem;
		height: 1.125rem;
		border: 2px solid currentColor;
		border-right-color: transparent;
		border-radius: 50%;
		animation: spin 0.65s linear infinite;
		opacity: 0.85;
		box-sizing: border-box;
	}
	.chart-card-export-btn .chart-card-action-spinner {
		border-color: rgba(255, 255, 255, 0.45);
		border-bottom-color: transparent;
	}
	.chart-card-publish-error {
		font-size: 11px;
		color: #dc2626;
		font-weight: 600;
		margin-top: 8px;
		line-height: 1.35;
	}
	.share-overlay {
		position: fixed;
		inset: 0;
		background: rgba(15, 23, 42, 0.52);
		z-index: 9000;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 16px;
	}
	.share-modal {
		background: #fff;
		border-radius: 16px;
		padding: 22px 20px 18px;
		width: min(430px, 92vw);
		direction: rtl;
		font-family: 'Tajawal', sans-serif;
		box-shadow: 0 16px 52px rgba(15, 23, 42, 0.24);
		border: 1px solid #e5e7eb;
	}
	.share-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 10px;
		margin-bottom: 16px;
	}
	.share-title {
		font-size: 16px;
		font-weight: 900;
		color: #1f2937;
	}
	.share-subtitle {
		margin-top: 2px;
		font-size: 12px;
		color: #64748b;
	}
	.share-close-btn {
		background: #f8fafc;
		border: 1px solid #e2e8f0;
		cursor: pointer;
		color: #64748b;
		font-size: 20px;
		line-height: 1;
		padding: 2px 8px;
		border-radius: 8px;
	}
	.share-close-btn:hover {
		background: #f1f5f9;
		color: #334155;
	}
	.share-state-box {
		margin-bottom: 14px;
		border-radius: 10px;
		padding: 10px 12px;
		line-height: 1.55;
		display: flex;
		align-items: center;
		gap: 9px;
	}
	.share-state-box--loading {
		background: #f8fafc;
		border: 1px solid #e2e8f0;
		color: #475569;
	}
	.share-state-box--success {
		background: #ecfdf3;
		border: 1px solid #bbf7d0;
		color: #166534;
		display: block;
	}
	.share-state-box--error {
		background: #fef2f2;
		border: 1px solid #fecaca;
		color: #b91c1c;
		display: block;
	}
	.share-state-title {
		font-size: 13px;
		font-weight: 800;
	}
	.share-state-note {
		font-size: 12px;
		opacity: 0.9;
	}
	.share-url-row {
		display: flex;
		gap: 8px;
		align-items: stretch;
		margin-bottom: 14px;
	}
	.share-url-input {
		flex: 1;
		padding: 10px 11px;
		border-radius: 10px;
		border: 1.5px solid #d9dbe0;
		font-size: 11px;
		color: #374151;
		background: #f9fafb;
		font-family: 'Tajawal', sans-serif;
		outline: none;
		direction: ltr;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.share-copy-btn {
		padding: 9px 14px;
		border-radius: 10px;
		border: 1.5px solid #d9dbe0;
		background: #fff;
		color: #374151;
		font-size: 12px;
		font-weight: 800;
		cursor: pointer;
		font-family: 'Tajawal', sans-serif;
		transition: all .18s ease;
		white-space: nowrap;
	}
	.share-copy-btn:hover {
		border-color: #9bd5b2;
		background: #f4fbf7;
		color: #166534;
	}
	.share-copy-btn.is-copied {
		border-color: #3cb96b;
		background: #ecfdf3;
		color: #166534;
	}
	.share-actions {
		display: flex;
		gap: 8px;
	}
	.share-primary-btn,
	.share-secondary-btn {
		flex: 1;
		padding: 10px;
		border-radius: 10px;
		font-size: 13px;
		font-weight: 800;
		cursor: pointer;
		font-family: 'Tajawal', sans-serif;
		transition: all .18s ease;
	}
	.share-primary-btn {
		border: none;
		background: #3cb96b;
		color: #fff;
	}
	.share-primary-btn:hover {
		background: #2ea55d;
	}
	.share-secondary-btn {
		border: 1.5px solid #d9dbe0;
		background: #fff;
		color: #374151;
	}
	.share-secondary-btn:hover {
		background: #f8fafc;
		border-color: #cbd5e1;
	}
	.divider { height:1px; background:#e8eaed; margin:12px 0; }

	/* ─── PLAN GRID ─── */
	.plan-table { border-collapse:separate; border-spacing:8px; width:100%; table-layout:fixed; }
	.plan-table-weekly {
		/* Wider floor so each day column stays readable when scrolling */
		min-width: 1120px;
	}
	.plan-table th { font-size:11px; font-weight:700; color:#8b909a; text-align:center; padding:10px 4px 4px; letter-spacing:.5px; text-transform:uppercase; }
	.summary-click-hint {
		margin: 0 0 6px;
		font-size: 11px;
		font-weight: 600;
		color: #64748b;
		text-align: center;
	}
	.summary-day-th {
		position: relative;
		text-decoration: underline;
		text-decoration-style: dotted;
		text-underline-offset: 3px;
		transition: color .15s ease, background-color .15s ease;
	}
	.summary-day-th:hover {
		color: #16a34a;
		background: #edf9f2;
	}
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
	.meal-cell {
		border: 2px dashed #d9dce3;
		border-radius: 10px;
		min-height: 136px;
		cursor: pointer;
		vertical-align: top;
		transition: all 0.2s;
		position: relative;
	}
	.meal-cell:hover { border-color:#3cb96b; background:#f0faf4; }
	.meal-card {
		border-radius: 8px;
		overflow: hidden;
		background: #fff;
		border: 2px solid transparent;
		height: 100px;
		box-shadow: 0 1px 6px rgba(0, 0, 0, 0.08);
		transition: 0.2s;
		cursor: pointer;
		display: flex;
		flex-direction: column;
	}
	.meal-card:hover { box-shadow:0 4px 16px rgba(0,0,0,.13); }
	.meal-card-hero {
		width: 100%;
		flex: 1 1 25%;
		min-height: 0;
		position: relative;
		overflow: hidden;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 13px;
		font-weight: 700;
		flex-shrink: 0;
		background: #3cb96b;
		color: #fff;
	}
	.meal-card-hero--image {
		background: #e8edf3;
		color: #1a1d23;
	}
	.meal-card-body {
		flex: 1 1 0;
		min-height: 0;
		padding: 5px 7px 6px;
		background: #fff;
		display: flex;
		flex-direction: column;
		justify-content: center;
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
	.week-nav-arrow { display:flex; align-items:center; justify-content:center; width:36px; height:36px; border-radius:999px; border:1.5px solid #e8eaed; background:#fff; color:#8b909a; cursor:pointer; transition:.15s; flex-shrink:0; font-size:17px; font-weight:800; line-height:1; font-family: 'Tajawal', ui-sans-serif, system-ui, sans-serif; }
	.week-nav-arrow:hover { border-color:#3cb96b; color:#3cb96b; background:#edf9f2; }
	.week-nav-arrow:disabled { opacity:0.35; cursor:not-allowed; border-color:#e8eaed; color:#c0c4cc; background:#f8f9fa; }
	.week-nav-arrow:disabled:hover { border-color:#e8eaed; color:#c0c4cc; background:#f8f9fa; }
	.week-nav-center { display:flex; align-items:center; gap:8px; padding:7px 18px; border-radius:var(--nc-radius-md); border:1.5px solid #e8eaed; background:#fff; font-family:'Tajawal',sans-serif; font-size:13px; font-weight:600; color:#1a1d23; transition:.15s; }
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
	.diag-recs-card {
		margin-top: 12px;
		padding: 14px 16px;
		border-radius: var(--nc-radius-lg);
		border: 1px solid var(--nc-border-soft);
		background: var(--nc-surface);
		box-shadow: var(--nc-shadow);
	}
	.diag-recs-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 10px;
		margin-bottom: 12px;
	}
	.diag-recs-title {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		min-width: 0;
	}
	.diag-recs-kicker {
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.04em;
		color: var(--nc-muted);
		text-transform: uppercase;
	}
	.diag-recs-badge {
		flex: 0 0 auto;
		font-size: 11px;
		font-weight: 700;
		color: var(--nc-muted);
		background: #f4f6f9;
		border: 1px solid var(--nc-border);
		border-radius: 999px;
		padding: 5px 10px;
		white-space: nowrap;
	}
	.diag-rec-block {
		border: 1px solid var(--nc-border);
		border-radius: var(--nc-radius-md);
		background: var(--nc-surface-2);
		margin-bottom: 10px;
		overflow: hidden;
	}
	.diag-rec-block:last-child {
		margin-bottom: 0;
	}
	.diag-rec-block-hd {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		padding: 10px 12px;
		border-bottom: 1px solid var(--nc-border-soft);
		background: var(--nc-surface);
		cursor: pointer;
		user-select: none;
		transition: background 0.12s ease;
	}
	.diag-rec-block-hd:hover {
		background: var(--nc-surface-2);
	}
	.diag-rec-block-hd--collapsed {
		border-bottom: none;
		border-radius: 0 0 var(--nc-radius-md) var(--nc-radius-md);
	}
	.diag-rec-block-title {
		font-size: 13px;
		font-weight: 700;
		color: var(--nc-text);
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.diag-rec-block-body {
		padding: 10px 12px 12px;
	}
	.diag-rec-line {
		display: flex;
		gap: 8px;
		font-size: 12.5px;
		color: #374151;
		margin-bottom: 6px;
		line-height: 1.6;
	}
	.diag-rec-line:last-child { margin-bottom: 0; }
	.diag-rec-bullet {
		color: var(--nc-accent);
		font-weight: 800;
		flex-shrink: 0;
		margin-top: 1px;
	}
	.diag-empty {
		font-size: 12px;
		color: #8b909a;
		padding: 2px 0 2px;
	}

	/* ─── MICRO BARS ─── */
	.micro-item { display:flex; align-items:center; gap:7px; font-size:11px; margin-bottom:7px; }
	.micro-name { width:76px; flex-shrink:0; color:#1a1d23; font-weight:500; font-size:10.5px; }
	.micro-track { flex:1 1 0; min-width:0; min-height:5px; height:5px; background:#e8eaed; border-radius:3px; overflow:hidden; }
	.chart-meal-ring { display:block; margin:0 auto; filter:drop-shadow(0 2px 5px rgba(16,24,40,.07)); }
	.chart-meal-ring-wrap {
		text-align: center;
		min-width: 74px;
		max-width: 90px;
		padding: 2px 4px;
	}
	.chart-meal-ring-pct {
		font-size: 11px;
		font-weight: 800;
		color: #1a1d23;
		margin-top: 2px;
		font-variant-numeric: tabular-nums;
	}
	.chart-meal-ring-label {
		font-size: 10px;
		color: #64748b;
		margin-top: 3px;
		font-weight: 600;
		line-height: 1.3;
		white-space: normal;
		word-break: break-word;
	}
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
	@keyframes overPulse { 0%,100% { opacity:.55; } 50% { opacity:.18; } }

	/* ─── AI PROGRESS ─── */
	.ai-progress-indeterminate {
		height: 100%;
		width: 40%;
		background: linear-gradient(90deg, var(--nc-accent), #2ea55d);
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
		background: rgba(60, 185, 107, 0.35);
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
		0%,100% { background: rgba(60, 185, 107, 0.22); }
		50%      { background: var(--nc-accent); }
	}

	.empty-meals-hint {
		text-align: center;
		padding: 32px 16px;
		color: #b0b5c0;
		font-size: 13px;
		font-weight: 600;
		border: 2px dashed var(--nc-border);
		border-radius: var(--nc-radius-md);
		background: var(--nc-surface-2);
	}
	.empty-meals-icon {
		width: 44px;
		height: 44px;
		margin: 0 auto 12px;
		border-radius: 50%;
		border: 2px dashed rgba(60, 185, 107, 0.35);
		background: rgba(60, 185, 107, 0.06);
	}

	/* ─── AI GENERATE MODAL (platform-aligned) ─── */
	.ai-gen-modal.modal {
		max-width: 520px;
		padding: 22px 24px 24px;
		border: 1px solid var(--nc-border-soft);
		box-shadow: var(--nc-shadow-hover);
		overflow-x: hidden;
		overflow-y: auto;
		overscroll-behavior: contain;
	}
	.ai-gen-title {
		font-family: 'El Messiri', 'Tajawal', serif;
		font-size: 1.05rem;
		font-weight: 700;
		margin: 0 0 6px;
		color: var(--nc-text);
	}
	.ai-gen-lede {
		font-size: 12.5px;
		color: var(--nc-muted);
		margin: 0 0 14px;
		line-height: 1.65;
	}
	.ai-gen-badge {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 7px 14px;
		border-radius: 999px;
		margin-bottom: 14px;
		font-size: 12px;
		font-weight: 700;
		border: 1.5px solid transparent;
	}
	.ai-gen-badge--week {
		background: rgba(37, 99, 235, 0.08);
		border-color: rgba(37, 99, 235, 0.22);
		color: #1d4ed8;
	}
	.ai-gen-badge--day {
		background: rgba(60, 185, 107, 0.1);
		border-color: rgba(60, 185, 107, 0.28);
		color: var(--nc-accent-ink);
	}
	.ai-gen-summary {
		background: var(--nc-surface-2);
		border: 1px solid var(--nc-border-soft);
		border-radius: var(--nc-radius-md);
		padding: 12px 14px;
		margin-bottom: 14px;
	}
	.ai-gen-summary-kicker {
		font-size: 10.5px;
		font-weight: 800;
		color: var(--nc-muted);
		margin-bottom: 8px;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.ai-gen-summary-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 6px;
		font-size: 12px;
		color: #4b5563;
	}
	.ai-gen-summary-grid > .full {
		grid-column: 1 / -1;
	}
	.ai-gen-meal-pill {
		display: inline-block;
		background: rgba(60, 185, 107, 0.12);
		color: var(--nc-accent-ink);
		border: 1px solid rgba(60, 185, 107, 0.25);
		border-radius: 8px;
		padding: 2px 8px;
		font-size: 11px;
		font-weight: 700;
		margin: 2px;
	}
	.ai-gen-section-label {
		font-size: 10.5px;
		font-weight: 800;
		color: var(--nc-muted);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		margin-bottom: 6px;
	}
	.ai-gen-diet-row {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-bottom: 10px;
	}
	.ai-gen-advanced-toggle {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		margin: 0 0 12px;
		padding: 0;
		border: none;
		background: none;
		font-family: 'Tajawal', sans-serif;
		font-size: 12px;
		font-weight: 700;
		color: var(--nc-accent-ink);
		cursor: pointer;
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.ai-gen-advanced-toggle:hover {
		color: #176f40;
	}
	.ai-gen-advanced-toggle:focus-visible {
		outline: 2px solid var(--nc-accent);
		outline-offset: 2px;
		border-radius: 4px;
	}
	.ai-gen-textarea {
		display: block;
		width: 100%;
		border: 1.5px solid #cfd6df;
		border-radius: var(--nc-radius-sm);
		padding: 10px 13px;
		font-size: 13px;
		font-family: 'Tajawal', sans-serif;
		resize: vertical;
		min-height: 72px;
		outline: none;
		color: var(--nc-text);
		margin-bottom: 10px;
		box-sizing: border-box;
		background: #fcfdfd;
		box-shadow: inset 0 1px 1px rgba(16, 24, 40, 0.04);
		line-height: 1.65;
		direction: rtl;
		text-align: right;
		transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
	}
	.ai-gen-textarea::placeholder {
		color: #97a1ad;
	}
	.ai-gen-textarea:focus {
		border-color: rgba(60, 185, 107, 0.55);
		box-shadow: 0 0 0 3px rgba(60, 185, 107, 0.12);
		background: var(--nc-surface);
	}
	.ai-gen-foot {
		display: flex;
		gap: 8px;
		margin-top: 12px;
		padding-top: 8px;
		border-top: 1px solid var(--nc-border-soft);
	}
	.ai-gen-foot .btn-close {
		flex: 1;
	}
	.ai-gen-foot .btn-generate {
		flex: 2;
		padding: 12px;
		border-radius: var(--nc-radius-sm);
	}
	.ai-gen-progress-label {
		font-size: 11px;
		font-weight: 600;
		color: var(--nc-accent-ink);
		margin-bottom: 6px;
	}
	.ai-gen-progress-track {
		height: 6px;
		background: rgba(60, 185, 107, 0.15);
		border-radius: 99px;
		overflow: hidden;
	}

	/* ─── TOPBAR (desktop: back | identity(name+extras) | save — mobile: back+save row, identity full width) ─── */
	.topbar {
		background: linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(251, 254, 252, 0.98) 100%);
		border-bottom: 1px solid #e6ede8;
		backdrop-filter: blur(12px);
		box-shadow: 0 1px 0 rgba(255, 255, 255, 0.9) inset, 0 12px 32px -20px rgba(15, 23, 42, 0.22);
		padding: 10px 28px;
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		grid-template-areas: 'back extras';
		align-items: center;
		column-gap: 8px;
		row-gap: 8px;
		min-height: 56px;
		height: auto;
		flex-shrink: 0;
		position: sticky;
		top: 0;
		z-index: 100;
	}
	.topbar:not(:has(.topbar-extras)) {
		grid-template-columns: auto;
		grid-template-areas: 'back';
	}
	.topbar-identity {
		grid-area: identity;
		display: flex;
		align-items: center;
		gap: 10px;
		min-width: 0;
	}
	.topbar-identity::before {
		content: '>';
		display: inline-flex;
		align-items: center;
		justify-content: center;
		color: #8a96a3;
		font-size: 14px;
		font-weight: 700;
		line-height: 1;
		margin-inline: 2px;
	}
	.topbar-identity-meta {
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: 0;
		min-height: 37px;
		min-width: 88px;
		padding: 0 12px;
		border-radius: 12px;
		border: 1px solid #e2e9f0;
		background: #fff;
	}
	.topbar-back-link {
		grid-area: back;
		justify-self: start;
		color:#53616f;
		text-decoration:none;
		font-size:12.5px;
		font-weight:700;
		display:flex;
		align-items:center;
		gap:6px;
		padding:8px 12px;
		border-radius:12px;
		transition:all .15s;
		border:1px solid #e2e9f0;
		background:#fff;
	}
	.topbar-back-link:hover {
		color:#176f40;
		background:#eff8f2;
		border-color:#c3e2d1;
		transform: translateY(-1px);
	}
	.topbar-patient-name {
		flex: 1 1 auto;
		min-width: 0;
		font-size: 13px;
		font-weight: 700;
		color: #2b3a49;
		letter-spacing: -0.025em;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		line-height: 1;
		text-align: center;
	}
	.topbar-extras {
		grid-area: extras;
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
		justify-content: flex-end;
		flex: 0 1 auto;
		min-width: 0;
		justify-self: stretch;
	}
	.topbar-save-btn {
		touch-action: manipulation;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		padding: 10px 18px;
		border-radius: 11px;
		border: none;
		background: linear-gradient(160deg, #42c073, #29a25a);
		color: #fff;
		font-size: 13px;
		font-weight: 700;
		cursor: pointer;
		font-family: 'Tajawal', sans-serif;
		transition: transform 0.15s ease, background 0.15s ease, opacity 0.15s ease, box-shadow 0.15s ease;
		box-shadow: 0 8px 18px rgba(41, 162, 90, 0.25);
		white-space: nowrap;
	}
	.topbar-save-btn:hover:not(:disabled) {
		background: linear-gradient(160deg, #36b467, #218c4d);
		transform: translateY(-1px);
		box-shadow: 0 10px 20px rgba(33, 140, 77, 0.3);
	}
	.topbar-save-btn:focus-visible {
		outline: 2px solid #166534;
		outline-offset: 2px;
	}
	.topbar-save-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	/* Publish control (also used in chart-card row with .chart-card-action-btn) */
	.topbar-publish-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		padding: 10px 16px;
		border-radius: var(--nc-radius-sm);
		border: 1.5px solid #c5edd8;
		background: var(--nc-surface);
		color: var(--nc-accent-ink);
		font-size: 13px;
		font-weight: 700;
		cursor: pointer;
		font-family: 'Tajawal', sans-serif;
		transition:
			border-color 0.15s ease,
			background 0.15s ease,
			color 0.15s ease,
			transform 0.12s ease,
			opacity 0.15s ease;
		white-space: nowrap;
		min-width: 0;
	}
	.topbar-publish-btn:hover:not(:disabled) {
		background: #f4fbf7;
		border-color: var(--nc-accent);
		color: #166534;
		transform: translateY(-1px);
	}
	.topbar-publish-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
		transform: none;
	}
	.topbar-publish-btn.publish-active {
		background: #edf9f2;
		color: #166534;
		border-color: #9bd5b2;
	}
	.topbar-publish-btn:focus-visible {
		outline: 2px solid rgba(22, 101, 52, 0.35);
		outline-offset: 2px;
	}
	@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

	/* ─── VALIDATION BANNER ─── */
	@keyframes slideDown { from { opacity:0; transform:translateY(-8px); } to { opacity:1; transform:translateY(0); } }

	/* ─── AI MEAL EDIT MODAL ─── */
	.ai-meal-modal {
		max-width: min(940px, 96vw) !important;
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
		gap: 6px;
		min-width: 0;
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
		margin-bottom: 8px;
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
		margin: 0;
		padding: 0;
		-webkit-overflow-scrolling: touch;
		border-radius: 12px;
	}
	.ai-ing-table {
		min-width: 580px;
		display: flex;
		flex-direction: column;
		gap: 0;
	}
	.ai-ing-head,
	.ai-ing-row {
		display: grid;
		grid-template-columns: minmax(160px, 2fr) 72px 80px 78px 78px 78px 78px 36px;
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
	.ai-ing-th.qty,
	.ai-ing-th.unit,
	.ai-ing-th.cal,
	.ai-ing-th.prot,
	.ai-ing-th.carb,
	.ai-ing-th.fat {
		white-space: nowrap;
	}
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
	.ai-ing-inp.num {
		text-align: center;
		font-variant-numeric: tabular-nums;
	}
	.ai-ing-inp.unit {
		text-align: center;
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
		.form-card--indexed { grid-template-columns: 20px minmax(0, 1fr); column-gap: 8px; }
		.form-card--indexed > .form-card-index { align-self: center; }
		.form-card-index { width: 20px; height: 20px; font-size: 10px; }
		.diag-recs-head { align-items: center; }
		.diag-recs-badge { font-size: 10.5px; padding: 4px 9px; }
		.plan-grid-card { padding: 14px 12px; margin-top: 10px; }
		.chart-card { padding: 14px 12px; border-radius: 14px; }
		.modal { max-width:100%; width:100%; height:100dvh; border-radius:16px 16px 0 0; max-height:100dvh; margin:0; align-self:flex-end; }
		.overlay { align-items:flex-end; }
		.ai-gen-modal.modal {
			padding: 16px 14px calc(18px + env(safe-area-inset-bottom, 0px));
		}
		.ai-gen-textarea {
			min-height: 96px;
		}
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
			font-size: 11px;
		}
		.meal-cell .meal-card {
			height: 76px;
			min-height: 0;
			display: flex;
			flex-direction: column;
		}
		.meal-card-body {
			flex: 1 1 0;
			min-height: 0;
			padding: 4px 5px 5px;
			background: #fff;
			display: flex;
			flex-direction: column;
			justify-content: center;
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
			grid-template-columns: 1fr;
			grid-template-areas:
				'extras'
				'back';
			padding: 10px max(12px, env(safe-area-inset-left, 0px)) 12px max(12px, env(safe-area-inset-right, 0px));
			min-height: 0;
			column-gap: 6px;
			row-gap: 10px;
			align-items: stretch;
			position: static;
			border-radius: 14px;
		}
		.topbar:not(:has(.topbar-extras)) {
			grid-template-columns: 1fr;
			grid-template-areas: 'back';
		}
		.topbar-identity {
			flex-direction: column;
			align-items: stretch;
			gap: 6px;
		}
		.topbar-identity::before {
			display: none;
		}
		.topbar-identity-meta {
			min-height: 44px;
			padding: 0 12px;
			border-radius: 12px;
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
			width: fit-content;
		}
		.topbar-patient-name {
			font-size: 13px;
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
			flex: 1 1 0;
			min-width: 0;
			min-height: 38px;
			padding: 0 9px;
			font-size: 11.5px;
			line-height: 1.1;
			text-align: center;
			justify-content: center;
			border-radius: 10px;
			box-shadow: 0 2px 10px rgba(60, 185, 107, 0.28);
		}
		.chart-card-action-row > .chart-card-action-btn {
			min-height: 38px;
			font-size: 11px;
			padding: 6px 4px;
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
			grid-template-columns: minmax(130px, 1.5fr) 62px 68px 68px 68px 68px 68px 32px;
			gap: 5px;
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
			padding: 0 8px;
			font-size: 11px;
			gap: 4px;
		}
		.topbar-save-btn {
			min-height: 36px;
			padding: 0 8px;
			font-size: 11px;
			text-align: center;
			justify-content: center;
		}
		.chart-card-action-row > .chart-card-action-btn {
			min-height: 36px;
			padding: 5px 3px;
			font-size: 10.5px;
		}
	}
</style>

<!-- ─── TOPBAR ─── -->
<div class="topbar">
	<a href="/dietitian/meal-plan" class="topbar-back-link" aria-label="العودة إلى العملاء">
		<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
		العملاء
	</a>
	{#if planValidation.status !== 'pass' || saveStatus !== 'idle' || saveError}
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
					{:else if saveStatus === 'saved'}
						<span class="save-dot save-dot-saved"></span>
						تم الحفظ
					{/if}
				</div>
			{/if}
			{#if saveError}
				<div style="display:inline-flex; align-items:center; gap:6px; font-size:11px; font-weight:700; padding:4px 10px; border-radius:20px; background:#fef2f2; color:#dc2626;">
					<span style="width:7px; height:7px; border-radius:50%; background:#dc2626;"></span>
					{saveError}
				</div>
			{/if}
		</div>
	{/if}
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
		<div class="form-card form-card--tight-pb">
			<div class="card-hd card-hd--plan-type">
				<div class="field-label">إعدادات الخطة</div>
				<div class="plan-switch" role="group" aria-label="نوع عرض الخطة">
					<button
						type="button"
						class="plan-btn"
						class:active={planType === 'daily'}
						onclick={() => requestNavigation('daily', viewWeekStart)}
					>
						يومية
					</button>
					<button
						type="button"
						class="plan-btn plan-btn--accent"
						class:active={planType === 'weekly'}
						onclick={() => requestNavigation('weekly', viewWeekStart)}
					>
						أسبوعية
					</button>
				</div>
				<button
					type="button"
					class="btn-ghost btn-ghost--danger"
					title="حذف جميع الوجبات لهذه الجلسة فقط"
					onclick={clearAllMealsForThisSession}
				>
					حذف الوجبات
				</button>
			</div>
		</div>

		<!-- 2. Diagnosis -->
		<div class="form-card form-card--indexed">
			<span class="form-card-index" aria-hidden="true">1</span>
			<div class="card-hd">
				<div class="field-label">
					التشخيص
					<span class="field-label-optional">(اختياري)</span>
				</div>
				<button
					type="button"
					class="btn-compact"
					onclick={() => { resetCreateDiagForm(); showCreateDiagModal = true; }}
				>
					+ إضافة تشخيص
				</button>
			</div>
			<div class="drop-zone diag-drop-zone">
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="sel-box sel-box--diag"
					onclick={() => {
						showExclusionDrop = false;
						showDiagDrop = !showDiagDrop;
					}}
				>
					{#if selectedDiags.length === 0}
						<span class="diag-placeholder">يمكن تركه فارغاً — اختر التشخيص إن وُجد…</span>
					{/if}
					{#each selectedDiags as diagId}
						{@const d = diagnosisLookup().get(diagId)}
						{#if d}
							<span class="chip">
								<span class="chip-label-text">{d.label}</span>
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
					<div class="diag-recs-head">
						<div class="diag-recs-title">
							<span class="diag-recs-kicker">التفاصيل والتوصيات</span>
						</div>
						<div class="diag-recs-badge">{selectedDiags.length} تشخيص</div>
					</div>
					{#each selectedDiags as diagId}
						{@const d = diagnosisLookup().get(diagId)}
						{#if d}
							<div class="diag-rec-block">
								<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
								<div
									class="diag-rec-block-hd"
									class:diag-rec-block-hd--collapsed={!!diagRecBlockCollapsed[diagId]}
									role="button"
									tabindex="0"
									aria-expanded={!diagRecBlockCollapsed[diagId]}
									onclick={(e) => {
										if ((e.target as HTMLElement).closest('button')) return;
										toggleDiagRecBlockHeader(diagId);
									}}
									onkeydown={(e) => {
										if (e.key !== 'Enter' && e.key !== ' ') return;
										e.preventDefault();
										if ((e.target as HTMLElement).closest('button')) return;
										toggleDiagRecBlockHeader(diagId);
									}}
								>
									<span class="diag-rec-block-title">{d.label}</span>
									{#if customDiags.some((x) => x.id === d.id)}
										<button
											type="button"
											class="cell-btn cell-btn-edit"
											onclick={(ev) => {
												ev.stopPropagation();
												startEditDiagnosis(d.id);
											}}
										>تعديل</button>
									{/if}
								</div>
								{#if !diagRecBlockCollapsed[diagId]}
								<div class="diag-rec-block-body">
									{#if 'severity' in d}
										{@const noteLines = diagnosisNoteLines(d.notes)}
										{#if noteLines.length > 0}
											{#each noteLines as line}
												<div class="diag-rec-line">
													<span class="diag-rec-bullet" aria-hidden="true">•</span>
													<span>{line}</span>
												</div>
											{/each}
										{:else}
											<div class="diag-empty">لا توجد ملاحظات.</div>
										{/if}
									{:else if d.recs?.length}
										{#each d.recs as rec}
											<div class="diag-rec-line">
												<span class="diag-rec-bullet" aria-hidden="true">•</span>
												<span>{rec}</span>
											</div>
										{/each}
									{:else}
										<div class="diag-empty">لا توجد تفاصيل إضافية.</div>
									{/if}
								</div>
								{/if}
							</div>
						{/if}
					{/each}
				</div>
			{/if}
		</div>

		<!-- 3. Calories -->
		<div class="form-card form-card--indexed">
			<span class="form-card-index" aria-hidden="true">2</span>
			<div class="field-label">
				احتياج السعرات
				<span class="req-star" aria-hidden="true">*</span>
				<span class="sr-only">مطلوب</span>
			</div>
			<div class="calories-row">
				<input type="number" class="cal-input" placeholder="مثال: 1800" bind:value={targetCalories} min="0" max="10000" inputmode="numeric" />
				<span class="kcal-suffix">kcal/d</span>
			</div>
			{#if targetCalories > 0}
				<div class="card-help card-help--mt6">
					{targetCalories < 1200 ? '⚠️ أقل من الحد الأدنى الآمن (1200 سعرة)' : targetCalories > 5000 ? '⚠️ مرتفع جداً — تأكد من صحة القيمة' : `سيتم توزيع ${targetCalories} سعرة على الوجبات المحددة`}
				</div>
			{/if}
		</div>

		<!-- 4. Excluded Foods -->
		<div class="form-card form-card--indexed">
			<span class="form-card-index" aria-hidden="true">3</span>
			<div class="field-label">
				الأطعمة المستثناة
				<span class="field-label-optional">(اختياري)</span>
			</div>
			<div class="exclusion-catalog-block">
				<div class="drop-zone exclusion-drop-zone">
					<div class="exclusion-combo-card">
						<div class="ing-search-wrap exclusion-drop-search exclusion-combo-search" onclick={(e) => e.stopPropagation()}>
							<svg width="14" height="14" fill="none" stroke="#94a3b8" viewBox="0 0 24 24" aria-hidden="true">
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0"
								/>
							</svg>
							<input
								bind:this={exclusionSearchInputEl}
								type="search"
								class="ing-search-input"
								placeholder="ابحث بالاسم…"
								bind:value={exclusionSearchQuery}
								autocomplete="off"
								aria-label="بحث في الأطعمة المستثناة"
								onfocus={onExclusionSearchFocus}
							/>
						</div>
						{#if excludedFoods.length > 0}
							<div class="exclusion-chips-bar" onclick={(e) => e.stopPropagation()}>
								{#each excludedFoods as item}
									<span class="chip">
										<span class="chip-label-text">{item.nameAr ?? item.name}</span>
										<button
											type="button"
											class="chip-x"
											onclick={(e) => {
												e.stopPropagation();
												removeExcludedFood(item.foodId);
											}}
										>
											×
										</button>
									</span>
								{/each}
							</div>
						{/if}
					</div>
					{#if showExclusionDrop}
						<div class="dropdown exclusion-dropdown" role="listbox" aria-label="قائمة الاستبعاد">
							<div class="exclusion-drop-scroll">
								{#if exclusionCatalogEmpty}
									<div class="ing-dropdown-empty exclusion-drop-empty">لا توجد نتائج مطابقة.</div>
								{:else}
									{#each exclusionCatalogFlat as row}
										<button
											type="button"
											class="drop-item exclusion-drop-item"
											disabled={excludedFoods.some((f) => f.foodId === stableNegativeFoodId(row.key))}
											onclick={() => pickExclusionFromCatalog(row.key)}
										>
											<span>{row.labelAr}</span>
											{#if excludedFoods.some((f) => f.foodId === stableNegativeFoodId(row.key))}
												<span class="drop-item-check">مضاف</span>
											{/if}
										</button>
									{/each}
								{/if}
							</div>
						</div>
					{/if}
				</div>
			</div>
		</div>

		<!-- 5. Macros -->
		<div class="form-card form-card--indexed">
			<span class="form-card-index" aria-hidden="true">4</span>
			<div class="macro-header-row">
				<span>
					توزيع المغذيات الكبرى
					<span class="req-star" aria-hidden="true">*</span>
					<span class="sr-only">مطلوب</span>
				</span>
				<span
					class="macro-sum-pill"
					class:ok={macros.c + macros.p + macros.f === 100}
					class:bad={macros.c + macros.p + macros.f !== 100}
				>
				المجموع: {macros.c + macros.p + macros.f}%
				{#if macros.c + macros.p + macros.f !== 100}
					(يجب 100%)
				{/if}
			</span>
			</div>

			<div class="macro-pill-row">
				<div class="macro-pill macro-pill--c">
					<div class="macro-pill-pct" style="color:#4e9af1;">{macros.c}%</div>
					<div class="macro-pill-lbl">كارب</div>
					<div class="macro-pill-sub">{mg.carbG ? mg.carbG + 'g' : '–'}</div>
				</div>
				<div class="macro-pill macro-pill--p">
					<div class="macro-pill-pct" style="color:#ef4444;">{macros.p}%</div>
					<div class="macro-pill-lbl">بروتين</div>
					<div class="macro-pill-sub">{mg.protG ? mg.protG + 'g' : '–'}</div>
				</div>
				<div class="macro-pill macro-pill--f">
					<div class="macro-pill-pct" style="color:#f59e0b;">{macros.f}%</div>
					<div class="macro-pill-lbl">دهون</div>
					<div class="macro-pill-sub">{mg.fatG ? mg.fatG + 'g' : '–'}</div>
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
		<div class="form-card form-card--indexed">
			<span class="form-card-index" aria-hidden="true">5</span>
			<div class="field-label field-label--tight">
				تخصيص الخطة
				<span class="req-star" aria-hidden="true">*</span>
				<span class="sr-only">مطلوب</span>
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
						<span class="meal-chip-label">{m.label}</span>
					</button>
				{/each}
			</div>
		</div>

		<!-- Plan Grid -->
		<div class="form-card form-card--indexed plan-grid-card">
			<span class="form-card-index" aria-hidden="true">6</span>
			<div class="card-hd card-hd--tight">
				<div class="card-hd-start">
					<div class="field-label">الخطة الغذائية</div>
					{#if todayDayIdx() >= 0}
						<span class="week-current-badge">{planType === 'weekly' ? 'هذا الأسبوع' : 'اليوم'}</span>
					{/if}
				</div>
			</div>

			<!-- Day / Week Navigator -->
			<div class="week-nav">
				<button
					type="button"
					class="week-nav-arrow"
				onclick={() => goNav(-1)}
				disabled={navPrevDisabled()}
					title={planType === 'weekly' ? 'الأسبوع السابق' : 'اليوم السابق'}
					aria-label={planType === 'weekly' ? 'الأسبوع السابق' : 'اليوم السابق'}
				>
					&lt;
				</button>
				<div class="week-nav-center" aria-live="polite" aria-label="نطاق التاريخ الحالي">
					<span>{navRangeLabel()}</span>
				</div>
				<button
					type="button"
					class="week-nav-arrow"
				onclick={() => goNav(1)}
				disabled={navNextDisabled()}
					title={planType === 'weekly' ? 'الأسبوع القادم' : 'اليوم القادم'}
					aria-label={planType === 'weekly' ? 'الأسبوع القادم' : 'اليوم القادم'}
				>
					&gt;
				</button>
			</div>

			{#if displayMealTypes().length === 0}
				<div class="empty-meals-hint">
					<div class="empty-meals-icon" aria-hidden="true"></div>
					اختر نوع الوجبات من القائمة أعلاه لبدء بناء الخطة
				</div>
			{:else}
			<div class="plan-scroll">
				<div class="summary-click-hint">اضغط على اسم اليوم لعرض الملخص</div>
				<table class="plan-table" class:plan-table-weekly={planType === 'weekly'}>
					<thead>
						<tr>
							<th class="plan-corner-th" style="width:80px;"></th>
							{#each dayLabels() as d, i}
								{@const dateKey = dayDates()[i]}
								<!-- svelte-ignore a11y_click_events_have_key_events -->
								<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
								<th
									class="summary-day-th"
									class:today-col={todayDayIdx() === i}
									class:selected-summary-col={effectiveSummaryDate() === dateKey}
									style="cursor:pointer;"
									onclick={() => {
										selectedSummaryDate = dateKey;
										chartCardEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
									}}
									title="عرض ملخص {d}"
								>{d}</th>
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
												else if (slot?.supplementId) openSupplementDetail(dateKey, mealType);
												else if (slot?.aiMeal) openAiMealDetail(dateKey, mealType, slot.aiMeal);
											}}>
												<div class="meal-card-hero" class:meal-card-hero--image={!!info.imageUrl}>
													{#if info.imageUrl}
														<img src={info.imageUrl} alt="" style="position:absolute; inset:0; width:100%; height:100%; object-fit:cover;" />
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
										<td class="meal-cell" class:today-col={todayDayIdx() === i} class:selected-summary-col={effectiveSummaryDate() === dateKey} onclick={() => openPicker(mealType, dateKey)}>
											<div class="meal-slot-placeholder">
												<div style="font-size:24px; color:#d0d4db;">+</div>
												<div style="font-size:10px; color:#b0b5c0;">
													{mealType === 'supplement' ? 'أضف مكملات' : 'أضف وجبة'}
												</div>
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
				type="button"
				class="btn-ai"
				disabled={!canGenerateAi()}
				onclick={() => {
					aiExtraNote = '';
					aiError = '';
					aiDraftDietTypes = [...selectedDietTypes];
					showAiDietAdvanced = false;
					showAiModal = true;
				}}
			>
				{#if !canGenerateAi()}
					{aiMissingRequirements()[0]}
				{:else}
					إنشاء بالذكاء الاصطناعي
				{/if}
			</button>
		</div>
		{#if !canGenerateAi()}
			<div class="card-help card-help--mt6">
				أكمل الحقول الأساسية أولاً: {aiMissingRequirements().join(' • ')}
			</div>
		{/if}
	</div>

	<!-- ─── RIGHT SUMMARY PANEL ─── -->
	<div class="right-panel">
		<div class="chart-card" bind:this={chartCardEl}>
			<div class="chart-card-title">
				ملخص الخطة الغذائية
				{#if planType === 'weekly' && effectiveSummaryDate()}
					{@const selIdx = dayDates().indexOf(effectiveSummaryDate()!)}
					<span style="font-size:10px; font-weight:600; color:#8b909a; margin-right:6px;">— {selIdx >= 0 ? dayLabels()[selIdx] : ''}</span>
				{/if}
			</div>
		<!-- Calorie Card -->
		<div style="background:{summaryChartContract.calories.overAmount > 0 ? 'linear-gradient(135deg,#e55e3a 0%,#c9441f 100%)' : 'linear-gradient(135deg,#3cb96b 0%,#2ea55d 100%)'}; border-radius:10px; padding:14px 16px; color:#fff; margin-bottom:10px; transition:background .4s ease;">
			<div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:10px;">
				<span style="font-size:11px; font-weight:600; opacity:.85;">السعرات الحرارية</span>
				<span style="font-size:16px; font-weight:800;">{summaryChartContract.calories.target} سعرة</span>
			</div>
			{#if summaryUsingImplicitGoal}
				<div style="font-size:9.5px; opacity:0.82; margin:-4px 0 8px; line-height:1.35;">
					لم يُحفظ هدف سعرات في الخطة — يُعرض هدف تقديري يومي من مجموع الوجبات الحالي
				</div>
			{/if}
			<!-- Progress bar: base fill (capped 100%) + over-target accent if exceeded -->
			<div style="position:relative; height:7px; background:rgba(255,255,255,.3); border-radius:4px; overflow:hidden; margin-bottom:9px;">
				<div style="height:100%; background:#fff; border-radius:4px; transition:width .4s ease; width:{summaryChartContract.calories.percent}%;"></div>
				{#if summaryChartContract.calories.overAmount > 0}
					<div style="position:absolute; inset:0; background:rgba(255,255,255,.55); border-radius:4px; animation:overPulse 1.4s ease-in-out infinite;"></div>
				{/if}
			</div>
			<div class="cal-target-stats">
				<div class="stat-start" style="display:flex; flex-direction:column; gap:1px;">
					<span style="font-size:13px; font-weight:800;">{summaryChartContract.calories.consumed}</span>
					<span>المعطى</span>
				</div>
				<div class="stat-mid" style="display:flex; flex-direction:column; gap:1px;">
					<span style="font-size:13px; font-weight:800;">{summaryChartContract.calories.displayPercent}%</span>
					<span>{summaryChartContract.calories.overAmount > 0 ? 'تجاوز الهدف' : 'من الهدف'}</span>
				</div>
				<div class="stat-end" style="display:flex; flex-direction:column; gap:1px;">
					{#if summaryChartContract.calories.overAmount > 0}
						<span style="font-size:12px; font-weight:800;">+{summaryChartContract.calories.overAmount}</span>
						<span style="font-size:9px; opacity:.9;">زيادة (+{summaryChartContract.calories.overPercent}%)</span>
					{:else}
						<span style="font-size:13px; font-weight:800;">{summaryChartContract.calories.remaining}</span>
						<span>متبقي</span>
					{/if}
				</div>
			</div>
		</div>

		<!-- Macro Grams -->
		<div class="chart-macro-row">
			<div style="flex:1; border-radius:9px; padding:10px 6px 8px; text-align:center; border:1.5px solid {summaryChartContract.macros.carbs.overAmount > 0 ? '#fca5a5' : '#c5d9fb'}; background:{summaryChartContract.macros.carbs.overAmount > 0 ? '#fff5f5' : '#eef4ff'}; transition:border-color .3s,background .3s;">
				<div style="font-size:17px; font-weight:800; color:{summaryChartContract.macros.carbs.overAmount > 0 ? '#dc2626' : '#4e9af1'}; margin-bottom:1px; transition:color .3s;">{summaryChartContract.macros.carbs.target}g</div>
				<div style="font-size:10px; color:#8b909a; font-weight:600; margin-bottom:3px;">كارب</div>
				<div style="font-size:9.5px; color:#8b909a; margin-bottom:4px;">{summaryChartContract.macros.carbs.target} / {summaryChartContract.macros.carbs.consumed}g</div>
				<div style="height:4px; background:#e8eaed; border-radius:2px; overflow:hidden; margin-bottom:{summaryChartContract.macros.carbs.overAmount > 0 ? 3 : 0}px;">
					<div style="height:100%; border-radius:2px; background:{summaryChartContract.macros.carbs.overAmount > 0 ? '#ef4444' : '#4e9af1'}; transition:width .4s,background .3s; width:{summaryChartContract.macros.carbs.percent}%;"></div>
				</div>
				{#if summaryChartContract.macros.carbs.overAmount > 0}
					<div style="font-size:9px; font-weight:700; color:#dc2626; margin-top:3px;">+{summaryChartContract.macros.carbs.overPercent}% تجاوز</div>
				{/if}
			</div>
			<div style="flex:1; border-radius:9px; padding:10px 6px 8px; text-align:center; border:1.5px solid {summaryChartContract.macros.protein.overAmount > 0 ? '#fca5a5' : '#fbbcbc'}; background:{summaryChartContract.macros.protein.overAmount > 0 ? '#fff5f5' : '#fff0f0'}; transition:border-color .3s,background .3s;">
				<div style="font-size:17px; font-weight:800; color:#ef4444; margin-bottom:1px;">{summaryChartContract.macros.protein.target}g</div>
				<div style="font-size:10px; color:#8b909a; font-weight:600; margin-bottom:3px;">بروتين</div>
				<div style="font-size:9.5px; color:#8b909a; margin-bottom:4px;">{summaryChartContract.macros.protein.target} / {summaryChartContract.macros.protein.consumed}g</div>
				<div style="height:4px; background:#e8eaed; border-radius:2px; overflow:hidden; margin-bottom:{summaryChartContract.macros.protein.overAmount > 0 ? 3 : 0}px;">
					<div style="height:100%; border-radius:2px; background:{summaryChartContract.macros.protein.overAmount > 0 ? '#b91c1c' : '#ef4444'}; transition:width .4s,background .3s; width:{summaryChartContract.macros.protein.percent}%;"></div>
				</div>
				{#if summaryChartContract.macros.protein.overAmount > 0}
					<div style="font-size:9px; font-weight:700; color:#dc2626; margin-top:3px;">+{summaryChartContract.macros.protein.overPercent}% تجاوز</div>
				{/if}
			</div>
			<div style="flex:1; border-radius:9px; padding:10px 6px 8px; text-align:center; border:1.5px solid {summaryChartContract.macros.fat.overAmount > 0 ? '#fca5a5' : '#fde68a'}; background:{summaryChartContract.macros.fat.overAmount > 0 ? '#fff5f5' : '#fffbf0'}; transition:border-color .3s,background .3s;">
				<div style="font-size:17px; font-weight:800; color:{summaryChartContract.macros.fat.overAmount > 0 ? '#dc2626' : '#f59e0b'}; margin-bottom:1px; transition:color .3s;">{summaryChartContract.macros.fat.target}g</div>
				<div style="font-size:10px; color:#8b909a; font-weight:600; margin-bottom:3px;">دهون</div>
				<div style="font-size:9.5px; color:#8b909a; margin-bottom:4px;">{summaryChartContract.macros.fat.target} / {summaryChartContract.macros.fat.consumed}g</div>
				<div style="height:4px; background:#e8eaed; border-radius:2px; overflow:hidden; margin-bottom:{summaryChartContract.macros.fat.overAmount > 0 ? 3 : 0}px;">
					<div style="height:100%; border-radius:2px; background:{summaryChartContract.macros.fat.overAmount > 0 ? '#ef4444' : '#f59e0b'}; transition:width .4s,background .3s; width:{summaryChartContract.macros.fat.percent}%;"></div>
				</div>
				{#if summaryChartContract.macros.fat.overAmount > 0}
					<div style="font-size:9px; font-weight:700; color:#dc2626; margin-top:3px;">+{summaryChartContract.macros.fat.overPercent}% تجاوز</div>
				{/if}
			</div>
		</div>

			<div class="divider"></div>

			<!-- Meal Donuts (only types with calories in the viewed day/week) -->
			<div style="margin-bottom:12px;">
				<div style="font-size:11px; font-weight:700; color:#8b909a; text-transform:uppercase; letter-spacing:.4px; margin-bottom:9px;">الوجبات</div>
				{#if displayMealTypes().length === 0}
					<div style="text-align:center; color:#8b909a; font-size:11px; padding:6px 0;">لا توجد وجبات محددة بعد</div>
				{:else}
					<div style="display:flex; flex-wrap:wrap; gap:8px;">
						{#each summaryMealProgressTypes as mealType, mi}
							{@const mealData = summaryChartContract.mealDistribution.find((m) => m.mealType === mealType)}
							{@const mealProgress = summaryMealProgress().get(mealType)}
							{@const mealPct = mealProgress?.percent ?? 0}
							{@const ringR = 17}
							{@const ringC = 2 * Math.PI * ringR}
							{@const ringOff = ringC * (1 - Math.min(100, mealPct) / 100)}
							{@const ringHue = (135 + mi * 42) % 360}
							{@const mealCalories = mealProgress?.calories ?? 0}
							<div class="chart-meal-ring-wrap">
								<svg
									class="chart-meal-ring"
									viewBox="0 0 44 44"
									width="52"
									height="52"
									role="img"
									aria-label={`${mealData?.name ?? mealLabelMap()[mealType] ?? 'وجبة'} · ${Math.round(mealCalories)} سعرة (${mealPct}%)`}
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
								<div class="chart-meal-ring-pct">{mealPct}%</div>
								<div class="chart-meal-ring-label">{mealData?.name ?? mealLabelMap()[mealType] ?? mealType}</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>

			{#if selectedMeals.includes('supplement')}
				<div class="divider"></div>

				<!-- Micronutrients (only when المكملات is included in the plan types) -->
				<div style="margin-bottom:12px;">
					<div style="font-size:11px; font-weight:700; color:#8b909a; text-transform:uppercase; letter-spacing:.4px; margin-bottom:9px;">المغذيات الصغرى للمكملات</div>
					{#each summaryMicroData.slice(0, 5) as micro}
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
						{#each summaryMicroData.slice(5) as micro}
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
			{/if}

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
					{:else}
						{#each displayMealTypes() as mealType}
							{@const mt = summaryDayCalc.mealTotals[mealType]}
							<tr>
								<td>{mealLabelMap()[mealType] ?? mealType}</td>
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
							<td>{Math.round(summaryDayCalc.totals.calories)}</td>
							<td>{Math.round(summaryDayCalc.totals.carbs)}g</td>
							<td>{Math.round(summaryDayCalc.totals.protein)}g</td>
							<td>{Math.round(summaryDayCalc.totals.fat)}g</td>
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

			<div class="chart-card-action-row">
				<button
					type="button"
					class="chart-card-action-btn topbar-publish-btn"
					class:publish-active={isPublished}
					onclick={doPublish}
					disabled={publishStatus === 'publishing'}
					title={publishStatus === 'publishing'
						? 'جاري النشر…'
						: isPublished || publishStatus === 'published'
							? 'الخطة منشورة للمريض'
							: 'نشر الخطة للمريض'}
					aria-label={publishStatus === 'publishing'
						? 'جاري النشر'
						: publishStatus === 'published' || isPublished
							? 'الخطة منشورة للمريض'
							: 'نشر الخطة للمريض'}
				>
					{#if publishStatus === 'publishing'}
						<span class="chart-card-action-spinner" aria-hidden="true"></span>
					{:else if publishStatus === 'published' || isPublished}
						<span class="chart-card-action-icon" aria-hidden="true">
							<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
								<circle cx="12" cy="12" r="9" />
								<path stroke-linecap="round" stroke-linejoin="round" d="M8.25 12.25 10.75 14.75 15.75 9.25" />
							</svg>
						</span>
					{:else}
						<span class="chart-card-action-icon" aria-hidden="true">
							<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
								/>
							</svg>
						</span>
					{/if}
				</button>
				<button
					type="button"
					class="chart-card-action-btn chart-card-export-btn"
					onclick={() => exportToPdf(planType === 'daily' ? 'day' : 'week')}
					disabled={isExporting}
					title={planType === 'daily' ? 'تصدير اليوم PDF' : 'تصدير الأسبوع PDF'}
					aria-label={planType === 'daily' ? 'تصدير اليوم PDF' : 'تصدير الأسبوع PDF'}
				>
					{#if isExporting}
						<span class="chart-card-action-spinner" aria-hidden="true"></span>
					{:else}
						<span class="chart-card-action-icon" aria-hidden="true">
							<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2z"
								/>
							</svg>
						</span>
					{/if}
				</button>
				<button
					type="button"
					onclick={() => shareCurrentMealPlan()}
					disabled={shareStatus === 'sharing'}
					class="chart-card-action-btn share-trigger-btn"
					title={shareStatus === 'sharing' ? 'جارٍ إنشاء الرابط…' : 'مشاركة رابط الخطة'}
					aria-label={shareStatus === 'sharing' ? 'جارٍ إنشاء الرابط' : 'مشاركة رابط الخطة'}
				>
					{#if shareStatus === 'sharing'}
						<span class="chart-card-action-spinner" aria-hidden="true"></span>
					{:else}
						<span class="chart-card-action-icon" aria-hidden="true">
							<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244"
								/>
							</svg>
						</span>
					{/if}
				</button>
			</div>
			{#if publishStatus === 'error'}
				<div class="chart-card-publish-error">{publishError}</div>
			{/if}
		</div>
	</div>
</div>
</div>

<!-- ─── MODALS (outside closeDropdowns wrapper so overlays/buttons are not affected) ─── -->

{#if showNavGuard}
	<div class="overlay">
		<div class="modal" style="max-width: 460px; padding: 18px;">
			<h3 style="margin: 0 0 8px; font-size: 17px; font-weight: 800; color: #111827;">لديك تعديلات غير محفوظة</h3>
			<p style="margin: 0 0 14px; font-size: 13px; color: #6b7280; line-height: 1.7;">
				تم تعديل وجبات هذه الفترة. اختر ما تريد فعله قبل الانتقال.
			</p>
			<div style="display: grid; gap: 8px;">
				<button type="button" class="topbar-save-btn" style="width: 100%;" onclick={() => confirmNavSave()}>
					حفظ ثم الانتقال
				</button>
				<button type="button" class="btn-ghost btn-ghost--danger" style="width: 100%; min-height: 42px;" onclick={() => confirmNavDiscard()}>
					تجاهل التعديلات والانتقال
				</button>
				<button type="button" class="btn-ghost" style="width: 100%; min-height: 42px;" onclick={() => cancelNavChange()}>
					إلغاء
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- Recipe/Food/Supplement Picker -->
{#if showRecipePicker}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="overlay" onclick={(e) => e.target === e.currentTarget && (showRecipePicker = false)}>
		<div class="modal">
			<div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:4px;">
				<h2 style="font-size:16px; font-weight:700; margin:0;">
					{pickerContext!.mealType === 'supplement' ? 'إضافة / استبدال مكمل' : 'إضافة / استبدال وجبة'}
				</h2>
				<button onclick={() => (showRecipePicker = false)} style="background:none; border:none; font-size:20px; cursor:pointer; color:#8b909a; padding:4px; line-height:1;">×</button>
			</div>
			<p style="font-size:12px; color:#8b909a; margin:0 0 12px;">
				{MEAL_TYPES.find((m) => m.id === pickerContext!.mealType)?.label}
				{#if planType === 'weekly'} · {dayLabels()[dayDates().indexOf(pickerContext!.dateKey)]}{/if}
			</p>
			{#if pickerContext!.mealType !== 'supplement'}
				<div class="picker-tabs">
					<button class="picker-tab active" onclick={() => { pickerTab = 'recipe'; pickerSearch = ''; }}>وصفات ({data.recipes.length})</button>
				</div>
			{/if}

			{#if pickerContext!.mealType === 'supplement' || pickerTab === 'supplement'}
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

			<input type="text" bind:value={pickerSearch} placeholder={pickerContext!.mealType === 'supplement' ? 'ابحث في المكملات…' : 'ابحث في القائمة…'} style="width:100%; border:1.5px solid #e8eaed; border-radius:9px; padding:9px 12px; font-size:13px; outline:none; margin-bottom:10px; font-family:'Tajawal',sans-serif; box-sizing:border-box;" />
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
						<div style="font-size:17px; font-weight:700; color:#4e9af1;">{Math.round(detailNutrients.carbs ?? 0)}g</div>
						<div style="font-size:10px; color:#8b909a; margin-top:2px;">كارب</div>
					</div>
					<div style="flex:1; background:#f4f6f9; border-radius:9px; padding:10px 8px; text-align:center;">
						<div style="font-size:17px; font-weight:700; color:#ef4444;">{Math.round(detailNutrients.protein ?? 0)}g</div>
						<div style="font-size:10px; color:#8b909a; margin-top:2px;">بروتين</div>
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
						{@const dp = ing.protein != null ? Math.round(ing.protein * 10) / 10 : null}
						{@const dc = ing.carbs != null ? Math.round(ing.carbs * 10) / 10 : null}
						{@const df = ing.fat != null ? Math.round(ing.fat * 10) / 10 : null}
						<div style="padding:8px 0; border-bottom:1px solid #e8eaed;">
							<div style="display:flex; justify-content:flex-start; align-items:baseline; flex-wrap:wrap; gap:6px; font-size:12.5px;">
								<span style="color:#1a1d23; font-weight:500;">{ing.name}</span>
								<span style="color:#8b909a; font-size:11px; white-space:nowrap;">{ing.quantity} {ing.unit}</span>
							</div>
							{#if ing.calories != null && dp != null && dc != null && df != null}
								<div style="display:grid; grid-template-columns:repeat(4,1fr); gap:4px; margin-top:8px; padding-top:8px; border-top:1px solid #e8eaed; text-align:center;">
									<div><div style="font-size:13px; font-weight:800; color:#16a34a;">{Math.round(ing.calories)}</div><div style="font-size:9px; color:#94a3b8;">سعرة</div></div>
									<div><div style="font-size:13px; font-weight:800; color:#4e9af1;">{Number.isInteger(dc) ? dc : dc.toFixed(1)}غ</div><div style="font-size:9px; color:#94a3b8;">كارب</div></div>
									<div><div style="font-size:13px; font-weight:800; color:#ef4444;">{Number.isInteger(dp) ? dp : dp.toFixed(1)}غ</div><div style="font-size:9px; color:#94a3b8;">بروتين</div></div>
									<div><div style="font-size:13px; font-weight:800; color:#f59e0b;">{Number.isInteger(df) ? df : df.toFixed(1)}غ</div><div style="font-size:9px; color:#94a3b8;">دهون</div></div>
								</div>
							{/if}
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

<!-- Supplement Detail -->
{#if showSupplementDetail && supplementDetailCtx && supplementDetailData}
	{@const supCtx = supplementDetailCtx}
	{@const supData = supplementDetailData}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="overlay" onclick={(e) => e.target === e.currentTarget && closeSupplementDetail()}>
		<div class="modal" style="max-width:560px; padding:18px 18px 16px;">
			<div style="display:flex; align-items:flex-start; justify-content:space-between; gap:10px; margin-bottom:8px;">
				<div>
					<div style="font-size:11px; font-weight:700; color:#8b909a; margin-bottom:3px;">تفاصيل المكمل</div>
					<h2 style="font-size:17px; font-weight:700; margin:0;">{supData.supplement.name}</h2>
				</div>
				<button
					type="button"
					aria-label="إغلاق"
					title="إغلاق"
					onclick={closeSupplementDetail}
					style="width:30px; height:30px; border:1.5px solid #e8eaed; border-radius:8px; background:#fff; color:#8b909a; cursor:pointer; font-size:18px; line-height:1; display:flex; align-items:center; justify-content:center;"
				>×</button>
			</div>
			<p style="font-size:12.5px; color:#8b909a; margin:0 0 12px;">
				{MEAL_TYPES.find((m) => m.id === supCtx.mealType)?.label}
				{#if planType === 'weekly'} · {dayLabels()[dayDates().indexOf(supCtx.dateKey)]}{/if}
			</p>
			<div style="display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin-bottom:14px;">
				<div style="background:#f8fafc; border:1px solid #e8eaed; border-radius:9px; padding:10px; text-align:center;">
					<div style="font-size:16px; font-weight:800; color:#16a34a;">{Math.round(supData.effective.calories)}</div>
					<div style="font-size:10px; color:#8b909a;">kcal</div>
				</div>
				<div style="background:#fef2f2; border:1px solid #fecaca; border-radius:9px; padding:10px; text-align:center;">
					<div style="font-size:16px; font-weight:800; color:#ef4444;">{Math.round(supData.effective.protein * 10) / 10}g</div>
					<div style="font-size:10px; color:#8b909a;">بروتين</div>
				</div>
				<div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:9px; padding:10px; text-align:center;">
					<div style="font-size:16px; font-weight:800; color:#2563eb;">{Math.round(supData.effective.carbs * 10) / 10}g</div>
					<div style="font-size:10px; color:#8b909a;">كارب</div>
				</div>
				<div style="background:#fffbeb; border:1px solid #fde68a; border-radius:9px; padding:10px; text-align:center;">
					<div style="font-size:16px; font-weight:800; color:#d97706;">{Math.round(supData.effective.fat * 10) / 10}g</div>
					<div style="font-size:10px; color:#8b909a;">دهون</div>
				</div>
			</div>
			<div style="border:1px solid #e8eaed; border-radius:10px; padding:10px; margin-bottom:12px; background:#fbfcfe;">
				<div style="font-size:11px; font-weight:700; color:#8b909a; margin-bottom:8px;">بيانات المكمل</div>
				<div style="font-size:12px; color:#4b5563; line-height:1.7; margin-bottom:8px;">
					<div>الحجم: {Math.round(supData.slotVolume ?? supData.supplement.volumeMl ?? 0)} mL {#if supData.supplement.kcalPerMl}• {supData.supplement.kcalPerMl} kcal/mL{/if}</div>
				</div>
				<div style="border:1px solid #d1fae5; border-radius:8px; padding:8px; background:#f0fdf4;">
					<div style="font-size:10px; font-weight:700; color:#065f46; margin-bottom:4px;">القيم الغذائية</div>
					<div style="font-size:12px; color:#14532d; line-height:1.6;">
						<div>{Math.round(supData.effective.calories)} kcal</div>
						<div>P {Math.round(supData.effective.protein * 10) / 10}g • C {Math.round(supData.effective.carbs * 10) / 10}g • F {Math.round(supData.effective.fat * 10) / 10}g</div>
					</div>
				</div>
			</div>
			<button type="button" class="btn-save" style="width:100%;" onclick={closeSupplementDetail}>إغلاق</button>
		</div>
	</div>
{/if}

<!-- AI Meal Detail -->
{#if showAiMealDetail && aiMealDetailCtx}
	{@const aiDetail = aiMealDetailCtx.aiMeal}
	{@const aiDetailTotal = aiDetail.total ?? { calories: 0, protein: 0, carbs: 0, fat: 0 }}
	{@const aiDetailSum = aiDetail.ingredients?.length ? sumAiIngredientLineTotals(aiDetail.ingredients) : null}
	{@const aiDetailDisp = aiDetailSum
		? {
				calories: Math.round(aiDetailSum.calories),
				protein: Math.round(aiDetailSum.protein * 10) / 10,
				carbs: Math.round(aiDetailSum.carbs * 10) / 10,
				fat: Math.round(aiDetailSum.fat * 10) / 10
			}
		: {
				calories: Math.round(aiDetailTotal.calories ?? 0),
				protein: Math.round((aiDetailTotal.protein ?? 0) * 10) / 10,
				carbs: Math.round((aiDetailTotal.carbs ?? 0) * 10) / 10,
				fat: Math.round((aiDetailTotal.fat ?? 0) * 10) / 10
			}}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="overlay" onclick={(e) => e.target === e.currentTarget && closeAiMealDetail()}>
		<div class="modal" style="max-width:560px;">
			<h2 style="font-size:17px; font-weight:700; margin:0 0 4px;">{aiDetail.name || 'وجبة ذكية'}</h2>
			<p style="font-size:12.5px; color:#8b909a; margin:0 0 6px;">
				{MEAL_TYPES.find((m) => m.id === aiMealDetailCtx.mealType)?.label}
				{#if planType === 'weekly'} · {dayLabels()[dayDates().indexOf(aiMealDetailCtx.dateKey)]}{/if}
			</p>
			{#if aiDetail.imageUrl && String(aiDetail.imageUrl).trim()}
				<div style="margin:0 0 14px; border-radius:10px; overflow:hidden; border:1px solid #e8eaed;">
					<img src={String(aiDetail.imageUrl).trim()} alt="" loading="lazy" referrerpolicy="no-referrer" style="width:100%; height:160px; object-fit:cover; display:block;" />
				</div>
			{/if}
			<div style="display:flex; gap:8px; margin-bottom:18px; margin-top:10px;">
				<div style="flex:1; background:linear-gradient(135deg,#edf9f2,#d4f0e0); border-radius:9px; padding:10px 8px; text-align:center;">
					<div style="font-size:18px; font-weight:800; color:#16a34a;">{aiDetailDisp.calories}</div>
					<div style="font-size:10px; color:#6b7280; margin-top:2px;">سعرة</div>
				</div>
				<div style="flex:1; background:#f4f6f9; border-radius:9px; padding:10px 8px; text-align:center;">
					<div style="font-size:17px; font-weight:700; color:#4e9af1;">{formatAiMacroDisplay(aiDetailDisp.carbs)}غ</div>
					<div style="font-size:10px; color:#8b909a; margin-top:2px;">كارب</div>
				</div>
				<div style="flex:1; background:#f4f6f9; border-radius:9px; padding:10px 8px; text-align:center;">
					<div style="font-size:17px; font-weight:700; color:#ef4444;">{formatAiMacroDisplay(aiDetailDisp.protein)}غ</div>
					<div style="font-size:10px; color:#8b909a; margin-top:2px;">بروتين</div>
				</div>
				<div style="flex:1; background:#f4f6f9; border-radius:9px; padding:10px 8px; text-align:center;">
					<div style="font-size:17px; font-weight:700; color:#f59e0b;">{formatAiMacroDisplay(aiDetailDisp.fat)}غ</div>
					<div style="font-size:10px; color:#8b909a; margin-top:2px;">دهون</div>
				</div>
			</div>
			{#if aiDetail.ingredients?.length}
				<div style="font-size:12px; font-weight:700; color:#8b909a; text-transform:uppercase; letter-spacing:.4px; margin-bottom:6px;">المكونات ({aiDetail.ingredients.length})</div>
				<div style="background:#f4f6f9; border-radius:8px; padding:8px 12px; margin-bottom:16px;">
					{#each aiDetail.ingredients as ing}
						<div style="padding:8px 0; border-bottom:1px solid #e8eaed;">
							<div style="display:flex; justify-content:flex-start; align-items:baseline; flex-wrap:wrap; gap:6px; font-size:12.5px;">
								<span style="color:#1a1d23; font-weight:500;">{ing.name_ar}</span>
								<span style="color:#8b909a; font-size:11px; white-space:nowrap;">{ing.quantity} {ing.unit}</span>
							</div>
							<div style="display:grid; grid-template-columns:repeat(4,1fr); gap:4px; margin-top:8px; padding-top:8px; border-top:1px solid #e8eaed; text-align:center;">
								<div><div style="font-size:13px; font-weight:800; color:#16a34a;">{Math.round(ing.calories ?? 0)}</div><div style="font-size:9px; color:#94a3b8;">سعرة</div></div>
								<div><div style="font-size:13px; font-weight:800; color:#4e9af1;">{formatAiMacroDisplay(ing.carbs ?? 0)}غ</div><div style="font-size:9px; color:#94a3b8;">كارب</div></div>
								<div><div style="font-size:13px; font-weight:800; color:#ef4444;">{formatAiMacroDisplay(ing.protein ?? 0)}غ</div><div style="font-size:9px; color:#94a3b8;">بروتين</div></div>
								<div><div style="font-size:13px; font-weight:800; color:#f59e0b;">{formatAiMacroDisplay(ing.fat ?? 0)}غ</div><div style="font-size:9px; color:#94a3b8;">دهون</div></div>
							</div>
						</div>
					{/each}
				</div>
			{/if}
			{#if aiDetail.steps}
				<div style="font-size:12px; font-weight:700; color:#8b909a; text-transform:uppercase; letter-spacing:.4px; margin-bottom:6px;">طريقة التحضير</div>
				<div style="font-size:12.5px; color:#4b5563; line-height:1.65; background:#f4f6f9; border-radius:8px; padding:10px 12px; margin-bottom:16px; white-space:pre-wrap;">{aiDetail.steps}</div>
			{/if}
			<div style="display:flex; gap:8px;">
				<button class="btn-close" onclick={closeAiMealDetail} style="width:100%;">إغلاق</button>
				<button
					type="button"
					class="btn-generate"
					style="width:100%;"
					onclick={() => {
						const ctx = aiMealDetailCtx;
						if (!ctx) return;
						closeAiMealDetail();
						openAiMealEdit(ctx.dateKey, ctx.mealType, ctx.aiMeal);
					}}
				>
					تعديل
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- AI Meal Edit Modal -->
{#if showAiMealEdit && aiMealEditCtx}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="overlay" onclick={(e) => { if (e.target === e.currentTarget) closeAiMealEditModal(); }}>
		<div class="modal ai-meal-modal" dir="rtl">
			<header class="ai-meal-modal-hd">
				<div class="ai-meal-modal-hd-inner">
					<h2 class="ai-meal-modal-title">تعديل الوجبة</h2>
				</div>
				<button
					type="button"
					class="ai-meal-modal-x"
					aria-label="إغلاق"
					title="إغلاق"
					onclick={closeAiMealEditModal}
				>
					<svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
				</button>
			</header>

			<div class="ai-meal-body">
				<div style="margin-bottom: 2px;">
					<label for="ai-meal-edit-name" class="ai-meal-label">اسم الوجبة</label>
					<input
						id="ai-meal-edit-name"
						bind:value={aiMealEditName}
						type="text"
						class="ai-meal-name-inp"
						placeholder="اسم الوجبة بالعربي"
					/>
				</div>

				{#each [aiMealEditTotal] as tot}
					<div style="display:flex; gap:8px; margin-bottom:4px; margin-top:4px;" aria-label="إجمالي القيم الغذائية للوجبة">
						<div style="flex:1; background:linear-gradient(135deg,#edf9f2,#d4f0e0); border-radius:9px; padding:10px 8px; text-align:center;">
							<div style="font-size:18px; font-weight:800; color:#16a34a;">{Math.round(tot.calories)}</div>
							<div style="font-size:10px; color:#6b7280; margin-top:2px;">سعرة</div>
						</div>
						<div style="flex:1; background:#f4f6f9; border-radius:9px; padding:10px 8px; text-align:center;">
							<div style="font-size:17px; font-weight:700; color:#ef4444;">{formatAiMacroDisplay(tot.protein)}غ</div>
							<div style="font-size:10px; color:#8b909a; margin-top:2px;">بروتين</div>
						</div>
						<div style="flex:1; background:#f4f6f9; border-radius:9px; padding:10px 8px; text-align:center;">
							<div style="font-size:17px; font-weight:700; color:#4e9af1;">{formatAiMacroDisplay(tot.carbs)}غ</div>
							<div style="font-size:10px; color:#8b909a; margin-top:2px;">كربوهيدرات</div>
						</div>
						<div style="flex:1; background:#f4f6f9; border-radius:9px; padding:10px 8px; text-align:center;">
							<div style="font-size:17px; font-weight:700; color:#f59e0b;">{formatAiMacroDisplay(tot.fat)}غ</div>
							<div style="font-size:10px; color:#8b909a; margin-top:2px;">دهون</div>
						</div>
					</div>
				{/each}

				<div>
					<div class="ai-ing-section-hd">
						<span class="ai-ing-section-title" style="font-size:12px; font-weight:700; color:#8b909a; text-transform:uppercase; letter-spacing:.4px;">المكونات ({aiMealEditIngredients.length})</span>
						<button type="button" class="ai-ing-add" onclick={openAiFoodSearch}>+ إضافة من قاعدة الأطعمة</button>
					</div>
					{#if aiFoodSearchOpen}
						<div style="position:relative;">
							<div class="ing-search-wrap">
								<svg width="14" height="14" fill="none" stroke="#94a3b8" viewBox="0 0 24 24" style="flex-shrink:0"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0" /></svg>
								<input
									type="text"
									class="ing-search-input"
									bind:value={aiFoodSearchQuery}
									oninput={searchAiFoods}
									placeholder="ابحث عن مكوّن من قاعدة الأطعمة…"
								/>
								{#if aiFoodSearchLoading}
									<span class="spinner spinner-dark" style="width:14px;height:14px;flex-shrink:0;"></span>
								{/if}
							</div>
							{#if aiFoodSearchError}
								<div class="ing-dropdown">
									<div class="ing-dropdown-empty">{aiFoodSearchError}</div>
								</div>
							{:else if aiFoodSearchQuery.trim().length >= 2}
								<div class="ing-dropdown">
									{#each aiFoodSearchResults() as food}
										<button type="button" class="ing-dropdown-row" onclick={() => addAiIngredientFromFood(food)}>
											<span class="ing-dropdown-name">{food.nameAr ?? food.name}</span>
											<span style="font-size:11px; color:#64748b;">{Math.round(Number(food.calories ?? 0))} kcal/100g</span>
										</button>
									{:else}
										<div class="ing-dropdown-empty">
											{aiFoodSearchHasSearched ? 'لا توجد نتائج مطابقة.' : 'لا توجد نتائج متاحة حالياً.'}
										</div>
									{/each}
								</div>
							{/if}
						</div>
					{/if}

					{#if aiMealEditIngredients.length > 0}
						<div class="ai-ing-scroll">
							<div class="ai-ing-table">
								<div class="ai-ing-head" role="row">
									<span class="ai-ing-th name">المكون</span>
									<span class="ai-ing-th qty">الكمية</span>
									<span class="ai-ing-th unit">الوحدة</span>
									<span class="ai-ing-th cal">السعرات</span>
									<span class="ai-ing-th prot">بروتين (غ)</span>
									<span class="ai-ing-th carb">كارب (غ)</span>
									<span class="ai-ing-th fat">دهون (غ)</span>
									<span class="ai-ing-th del" aria-hidden="true">&#8203;</span>
								</div>
								{#each aiMealEditIngredients as ing, i}
									<div class="ai-ing-row" role="row">
										<input
											value={ing.name_ar}
											oninput={(e) => updateAiIngredientField(i, 'name_ar', (e.currentTarget as HTMLInputElement).value)}
											class="ai-ing-inp name"
											type="text"
											placeholder="اسم المكون"
											aria-label="اسم المكون"
										/>
										<input
											value={ing.quantity}
											oninput={(e) => updateAiIngredientField(i, 'quantity', Number((e.currentTarget as HTMLInputElement).value) || 0)}
											class="ai-ing-inp num"
											type="number"
											min="0"
											step="1"
											inputmode="numeric"
											placeholder="0"
											aria-label="الكمية"
										/>
										<input
											value={ing.unit}
											oninput={(e) => updateAiIngredientField(i, 'unit', (e.currentTarget as HTMLInputElement).value)}
											class="ai-ing-inp unit"
											type="text"
											placeholder="g"
											aria-label="الوحدة"
										/>
										<input
											value={ing.calories}
											oninput={(e) => updateAiIngredientField(i, 'calories', Number((e.currentTarget as HTMLInputElement).value) || 0)}
											class="ai-ing-inp num"
											type="number"
											min="0"
											step="1"
											inputmode="decimal"
											placeholder="0"
											aria-label="السعرات"
										/>
										<input
											value={ing.protein}
											oninput={(e) => updateAiIngredientField(i, 'protein', Number((e.currentTarget as HTMLInputElement).value) || 0)}
											class="ai-ing-inp num"
											type="number"
											min="0"
											step="0.1"
											inputmode="decimal"
											placeholder="0"
											aria-label="البروتين"
										/>
										<input
											value={ing.carbs}
											oninput={(e) => updateAiIngredientField(i, 'carbs', Number((e.currentTarget as HTMLInputElement).value) || 0)}
											class="ai-ing-inp num"
											type="number"
											min="0"
											step="0.1"
											inputmode="decimal"
											placeholder="0"
											aria-label="الكربوهيدرات"
										/>
										<input
											value={ing.fat}
											oninput={(e) => updateAiIngredientField(i, 'fat', Number((e.currentTarget as HTMLInputElement).value) || 0)}
											class="ai-ing-inp num"
											type="number"
											min="0"
											step="0.1"
											inputmode="decimal"
											placeholder="0"
											aria-label="الدهون"
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
							لا توجد مكونات. اضغط «+ إضافة من قاعدة الأطعمة» لإضافة مكون إلى الوجبة.
						</div>
					{/if}
				</div>

				<div>
					<label for="ai-meal-edit-steps" class="ai-meal-label" style="font-size:12px; font-weight:700; color:#8b909a; text-transform:uppercase; letter-spacing:.4px;">طريقة التحضير</label>
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
					onclick={closeAiMealEditModal}
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
	<div class="overlay" onclick={(e) => e.target === e.currentTarget && !aiGenerating && closeAiModal()}>
		<div class="modal ai-gen-modal">
			<h2 class="ai-gen-title">إنشاء خطة بالذكاء الاصطناعي</h2>
			<p class="ai-gen-lede">
				سيتم استخدام بيانات المريض تلقائياً (التشخيص إن وُجد، والأطعمة المستثناة، والسعرات، والمغذيات الكبرى) لإنشاء خطة مخصصة.
			</p>

			<!-- Mode badge — locked to current planType, not user-selectable here -->
			<div
				class="ai-gen-badge"
				class:ai-gen-badge--week={planType === 'weekly'}
				class:ai-gen-badge--day={planType !== 'weekly'}
			>
				{planType === 'weekly' ? 'إنشاء لأسبوع كامل (7 أيام)' : 'إنشاء ليوم واحد'}
			</div>

			<div class="ai-gen-summary">
				<div class="ai-gen-summary-kicker">ملخص الإعدادات المستخدمة</div>
				<div class="ai-gen-summary-grid">
					<div>السعرات: <strong>{targetCalories} kcal</strong></div>
					<div>كارب {macros.c}% | بروتين {macros.p}% | دهون {macros.f}%</div>
					{#if selectedMeals.filter((m) => m !== 'supplement').length}
						<div class="full">
							الوجبات:
							{#each selectedMeals.filter((m) => m !== 'supplement') as mId}
								<span class="ai-gen-meal-pill">
									{MEAL_TYPES.find((m) => m.id === mId)?.label ?? mId}
								</span>
							{/each}
						</div>
					{/if}
					{#if excludedFoods.length}
						<div class="full">مستثناة: {excludedFoods.map((food) => food.nameAr ?? food.name).join('، ')}</div>
					{/if}
					{#if selectedDiags.length}
						<div class="full">تشخيصات: {selectedDiags.length}</div>
					{/if}
				</div>
			</div>

			<div class="ai-gen-section-label">تعليمات إضافية (اختياري)</div>
			<textarea
				class="ai-gen-textarea"
				bind:value={aiExtraNote}
				placeholder="مثال: يفضل المريض الأكلات السعودية، لا يحب السمك…"
			></textarea>

			{#if aiError}
				<div style="font-size:12px; color:#dc2626; margin:8px 0; padding:8px; background:#fef2f2; border-radius:8px;">{aiError}</div>
			{/if}

			{#if aiGenerating && aiProgressTotal > 1}
				<!-- Indeterminate progress bar — all days fire in parallel, no real per-day signal -->
				<div style="margin-bottom:12px;">
					<div class="ai-gen-progress-label">جاري إنشاء {aiProgressTotal} أيام بالتوازي…</div>
					<div class="ai-gen-progress-track">
						<div class="ai-progress-indeterminate"></div>
					</div>
					<div style="display:flex; gap:4px; margin-top:8px; justify-content:center;">
						{#each Array.from({ length: aiProgressTotal }) as _}
							<div class="ai-day-dot"></div>
						{/each}
					</div>
				</div>
			{/if}

			<div class="ai-gen-foot">
				<button type="button" class="btn-close" onclick={closeAiModal} disabled={aiGenerating}>إلغاء</button>
				<button
					type="button"
					class="btn-generate"
					disabled={aiGenerating || !canGenerateAi()}
					onclick={startAiGenerate}
				>
					{aiGenerating ? 'جاري الإنشاء…' : 'إنشاء الخطة'}
				</button>
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
			<h2 style="font-size:17px; font-weight:700; margin:0 0 4px;">{editingDiagKey ? 'تعديل التشخيص' : 'إضافة تشخيص جديد'}</h2>
			<p style="font-size:12.5px; color:#8b909a; margin:0 0 16px;">سيتم حفظه في السجل الطبي للمريض ويمكن اختياره مباشرةً في الخطة.</p>

			<div style="display:flex; flex-direction:column; gap:14px; margin-bottom:10px;">
				<div>
					<div style="font-size:11px; font-weight:700; color:#8b909a; margin-bottom:5px;">اسم التشخيص *</div>
					<input bind:value={newDiagName} placeholder="مثال: السكري النوع الثاني" class="cal-input" style="width:100%; box-sizing:border-box;" />
				</div>
				<div>
					<div style="font-size:11px; font-weight:700; color:#8b909a; margin-bottom:5px;">الملاحظات *</div>
					<textarea bind:value={newDiagNotes} placeholder="أضف ملاحظات التشخيص..." class="cal-input" style="width:100%; min-height:82px; resize:vertical; box-sizing:border-box;"></textarea>
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

<!-- ─── SHARE LINK MODAL ─── -->
{#if shareModalOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div
		onclick={closeShareModal}
		class="share-overlay"
	>
		<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
		<div
			onclick={(e) => e.stopPropagation()}
			class="share-modal"
		>
			<div class="share-head">
				<div>
					<div class="share-title">مشاركة الخطة الغذائية</div>
				</div>
				<button
					type="button"
					onclick={closeShareModal}
					class="share-close-btn"
					aria-label="إغلاق"
				>×</button>
			</div>

			{#if shareStatus === 'sharing'}
				<div class="share-state-box share-state-box--loading">
					<span class="spinner spinner-dark" style="width:16px;height:16px;flex-shrink:0;"></span>
					<div>
						<div class="share-state-title">جارٍ إنشاء الرابط…</div>
						<div class="share-state-note">الرجاء الانتظار لحظات</div>
					</div>
				</div>

		{:else if shareStatus === 'shared' && lastSharedUrl}
			{@const shareDayIdx = dayDates().indexOf(effectiveSummaryDate() ?? '')}
			<div class="share-state-box share-state-box--success">
				<div class="share-state-title">
					✅ تم إنشاء رابط اليوم
					{#if shareDayIdx >= 0}
						<strong>({dayLabels()[shareDayIdx]})</strong>
					{/if}
				</div>
				<div class="share-state-note">ينتهي خلال 7 أيام</div>
			</div>

				<div class="share-url-row">
					<input
						type="text"
						readonly
						value={lastSharedUrl}
						onclick={(e) => (e.currentTarget as HTMLInputElement).select()}
						class="share-url-input"
					/>
					<button
						type="button"
						onclick={copyShareUrl}
						class="share-copy-btn"
						class:is-copied={shareModalCopied}
					>
						{shareModalCopied ? '✓ تم النسخ' : 'نسخ'}
					</button>
				</div>

				<div class="share-actions">
					<button
						type="button"
						onclick={() => shareCurrentMealPlan()}
						class="share-secondary-btn"
						disabled={shareStatus === 'sharing'}
					>
						تحديث الرابط
					</button>
					<button
						type="button"
						onclick={closeShareModal}
						class="share-primary-btn"
					>
						إغلاق
					</button>
				</div>

			{:else if shareStatus === 'error'}
				<div class="share-state-box share-state-box--error">
					<div class="share-state-title">⚠️ تعذر إنشاء رابط المشاركة</div>
					<div class="share-state-note">{shareError || 'حاول مرة أخرى بعد قليل.'}</div>
				</div>

				<div class="share-actions">
					<button
						type="button"
						onclick={closeShareModal}
						class="share-secondary-btn"
					>
						إغلاق
					</button>
					<button
						type="button"
						onclick={() => shareCurrentMealPlan()}
						class="share-primary-btn"
					>
						إعادة المحاولة
					</button>
				</div>
			{/if}
		</div>
	</div>
{/if}
