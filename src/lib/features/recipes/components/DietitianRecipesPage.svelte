<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidate } from '$app/navigation';
	import {
		generateRecipeWithAi,
		searchRecipeFoods
	} from '$lib/features/recipes/services/recipes-api';
	import type { PageData, ActionData } from '../../../../routes/dietitian/recipes/$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let showCreateModal = $state(false);
	let showAIModal = $state(false);
	let viewRecipe = $state<(typeof data.recipes)[0] | null>(null);
	let aiLoading = $state(false);
	let aiError = $state('');
	let sourceTab = $state<'all' | 'internal' | 'ai'>('all');
	let createLoading = $state(false);
	let search = $state('');
	let editingRecipe = $state<(typeof data.recipes)[0] | null>(null);
	let editLoading = $state(false);

	// Create modal — ingredient search
	type CreateIng = {
		foodId: number;
		name: string;
		nameAr: string | null;
		quantity: number;
		unit: string;
		calories: number;
		protein: number;
		carbs: number;
		fat: number;
		fiber: number;
		portionSize: number;
	};
	let createIngredients = $state<CreateIng[]>([]);
	let createIngSearch = $state('');
	let createIngResults = $state<CreateIng[]>([]);
	let createIngLoading = $state(false);
	let createIngTimer: ReturnType<typeof setTimeout>;

	async function searchCreateIng() {
		clearTimeout(createIngTimer);
		createIngTimer = setTimeout(async () => {
			if (createIngSearch.length < 2) {
				createIngResults = [];
				return;
			}
			createIngLoading = true;
			try {
				const raw = await searchRecipeFoods(createIngSearch);
				createIngResults = raw.map((f) => ({
					foodId: f.id,
					name: f.name,
					nameAr: f.nameAr,
					quantity: 100,
					unit: f.unit || 'g',
					calories: f.calories,
					protein: f.protein,
					carbs: f.carbs,
					fat: f.fat,
					fiber: f.fiber,
					portionSize: f.portionSize || 100
				}));
			} finally {
				createIngLoading = false;
			}
		}, 320);
	}

	function addCreateIng(ing: CreateIng) {
		createIngredients = [...createIngredients, { ...ing }];
		createIngSearch = '';
		createIngResults = [];
	}

	function removeCreateIng(i: number) {
		createIngredients = createIngredients.filter((_, idx) => idx !== i);
	}

	let createRecipeImagePreview = $state<string | null>(null);
	let createRecipeImageInput: HTMLInputElement | undefined = $state();
	let editRecipeImagePreview = $state<string | null>(null);
	let editRecipeImageInput: HTMLInputElement | undefined = $state();

	function handleCreateRecipeImage(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = (ev) => {
			createRecipeImagePreview = ev.target?.result as string;
		};
		reader.readAsDataURL(file);
	}

	function handleEditRecipeImage(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = (ev) => {
			editRecipeImagePreview = ev.target?.result as string;
		};
		reader.readAsDataURL(file);
	}

	function resetCreate() {
		createIngredients = [];
		createIngSearch = '';
		createIngResults = [];
		createRecipeImagePreview = null;
		if (createRecipeImageInput) createRecipeImageInput.value = '';
	}

	const createTotals = $derived(() => {
		let cal = 0,
			pro = 0,
			carb = 0,
			fat = 0;
		for (const ing of createIngredients) {
			const f = ing.quantity / (ing.portionSize || 100);
			cal += ing.calories * f;
			pro += ing.protein * f;
			carb += ing.carbs * f;
			fat += ing.fat * f;
		}
		return {
			cal: Math.round(cal),
			pro: Math.round(pro),
			carb: Math.round(carb),
			fat: Math.round(fat)
		};
	});

	type EditRecipeLine =
		| { tag: 'food'; ing: CreateIng }
		| { tag: 'custom'; customText: string; quantity: number; unit: string };

	function parseYieldFromSteps(steps: string | null | undefined): { yield: string; body: string } {
		const s = steps?.trim() ?? '';
		if (!s) return { yield: '', body: '' };
		if (s.startsWith('الناتج:')) {
			const nl = s.indexOf('\n\n');
			if (nl !== -1) {
				return {
					yield: s
						.slice(0, nl)
						.replace(/^الناتج:\s*/, '')
						.trim(),
					body: s.slice(nl + 2)
				};
			}
			return { yield: s.replace(/^الناتج:\s*/, '').trim(), body: '' };
		}
		return { yield: '', body: s };
	}

	function buildEditLinesFromRecipe(
		ingredients: (typeof data.recipes)[0]['ingredients']
	): EditRecipeLine[] {
		const out: EditRecipeLine[] = [];
		for (const i of ingredients) {
			if (i.ingredient.foodItemId && i.food) {
				out.push({
					tag: 'food',
					ing: {
						foodId: i.ingredient.foodItemId,
						name: i.food.name,
						nameAr: i.food.nameAr,
						quantity: i.ingredient.quantity,
						unit: i.ingredient.unit,
						calories: i.food.calories,
						protein: i.food.protein,
						carbs: i.food.carbs,
						fat: i.food.fat,
						fiber: i.food.fiber ?? 0,
						portionSize: i.food.portionSize || 100
					}
				});
			} else if (i.ingredient.customText?.trim()) {
				out.push({
					tag: 'custom',
					customText: i.ingredient.customText.trim(),
					quantity: i.ingredient.quantity,
					unit: i.ingredient.unit
				});
			}
		}
		return out;
	}

	let editRecipeLines = $state<EditRecipeLine[]>([]);
	let editFormNameAr = $state('');
	let editFormName = $state('');
	let editFormPortions = $state(1);
	let editYield = $state('');
	let editStepsBody = $state('');
	let editIngSearch = $state('');
	let editIngResults = $state<CreateIng[]>([]);
	let editIngLoading = $state(false);
	let editIngTimer: ReturnType<typeof setTimeout>;

	async function searchEditIng() {
		clearTimeout(editIngTimer);
		editIngTimer = setTimeout(async () => {
			if (editIngSearch.length < 2) {
				editIngResults = [];
				return;
			}
			editIngLoading = true;
			try {
				const raw = await searchRecipeFoods(editIngSearch);
				editIngResults = raw.map((f) => ({
					foodId: f.id,
					name: f.name,
					nameAr: f.nameAr,
					quantity: 100,
					unit: f.unit || 'g',
					calories: f.calories,
					protein: f.protein,
					carbs: f.carbs,
					fat: f.fat,
					fiber: f.fiber,
					portionSize: f.portionSize || 100
				}));
			} finally {
				editIngLoading = false;
			}
		}, 320);
	}

	function addEditIng(ing: CreateIng) {
		editRecipeLines = [...editRecipeLines, { tag: 'food', ing: { ...ing } }];
		editIngSearch = '';
		editIngResults = [];
	}

	function removeEditLine(i: number) {
		editRecipeLines = editRecipeLines.filter((_, idx) => idx !== i);
	}

	function editLinesToPayload(lines: EditRecipeLine[]) {
		return lines.map((line) => {
			if (line.tag === 'food') {
				const ing = line.ing;
				return {
					foodId: ing.foodId,
					quantity: ing.quantity,
					unit: ing.unit,
					calories: ing.calories,
					protein: ing.protein,
					carbs: ing.carbs,
					fat: ing.fat,
					fiber: ing.fiber,
					portionSize: ing.portionSize
				};
			}
			return {
				customText: line.customText,
				quantity: line.quantity,
				unit: line.unit
			};
		});
	}

	const editIngredientsJson = $derived(JSON.stringify(editLinesToPayload(editRecipeLines)));

	$effect(() => {
		const er = editingRecipe;
		if (er) {
			editRecipeImagePreview = null;
			if (editRecipeImageInput) editRecipeImageInput.value = '';
			editFormNameAr = er.recipe.nameAr ?? '';
			editFormName = er.recipe.name ?? '';
			editFormPortions = er.recipe.portions ?? 1;
			const parsed = parseYieldFromSteps(er.recipe.steps);
			editYield = parsed.yield;
			editStepsBody = parsed.body;
			editRecipeLines = buildEditLinesFromRecipe(er.ingredients);
			editIngSearch = '';
			editIngResults = [];
		}
	});

	const editTotals = $derived(() => {
		let cal = 0,
			pro = 0,
			carb = 0,
			fat = 0;
		for (const line of editRecipeLines) {
			if (line.tag !== 'food') continue;
			const ing = line.ing;
			const f = ing.quantity / (ing.portionSize || 100);
			cal += ing.calories * f;
			pro += ing.protein * f;
			carb += ing.carbs * f;
			fat += ing.fat * f;
		}
		return {
			cal: Math.round(cal),
			pro: Math.round(pro),
			carb: Math.round(carb),
			fat: Math.round(fat)
		};
	});

	// AI Modal state
	let aiDescription = $state('');
	let aiCaloriesPerServing = $state('');
	let aiPortions = $state('2');
	let aiMacroPreset = $state<'balanced' | 'highProtein' | 'lowCarb' | 'custom'>('balanced');
	let aiCarbsPct = $state(50);
	let aiProteinPct = $state(30);
	let aiFatPct = $state(20);

	const macroPresets = {
		balanced: { carbs: 50, protein: 30, fat: 20, label: 'متوازن' },
		highProtein: { carbs: 30, protein: 40, fat: 30, label: 'بروتين عالي' },
		lowCarb: { carbs: 20, protein: 40, fat: 40, label: 'كربوهيدرات منخفضة' },
		custom: { carbs: 50, protein: 30, fat: 20, label: 'مخصص' }
	};

	function selectMacroPreset(preset: 'balanced' | 'highProtein' | 'lowCarb' | 'custom') {
		aiMacroPreset = preset;
		if (preset !== 'custom') {
			const p = macroPresets[preset];
			aiCarbsPct = p.carbs;
			aiProteinPct = p.protein;
			aiFatPct = p.fat;
		}
	}

	function resetAIModal() {
		aiDescription = '';
		aiCaloriesPerServing = '';
		aiPortions = '2';
		aiMacroPreset = 'balanced';
		aiCarbsPct = 50;
		aiProteinPct = 30;
		aiFatPct = 20;
		aiError = '';
	}

	const filtered = $derived(
		data.recipes.filter((r) => {
			if (sourceTab === 'internal' && r.recipe.source !== 'internal') return false;
			if (sourceTab === 'ai' && r.recipe.source !== 'ai') return false;
			if (search.trim()) {
				const q = search.toLowerCase();
				const name = (r.recipe.nameAr ?? r.recipe.name).toLowerCase();
				const nameEn = r.recipe.name.toLowerCase();
				return name.includes(q) || nameEn.includes(q);
			}
			return true;
		})
	);

	const aiCount = $derived(data.recipes.filter((r) => r.recipe.source === 'ai').length);
	const manualCount = $derived(data.recipes.filter((r) => r.recipe.source === 'internal').length);

	function parseNutrients(raw: string | null | undefined) {
		if (!raw) return null;
		try {
			return JSON.parse(raw);
		} catch {
			return null;
		}
	}

	function fmtMacro(v: number | undefined | null): string {
		return String(Math.round(v ?? 0));
	}
</script>

<svelte:head><title>الوصفات — نيوتريكير</title></svelte:head>

<div class="page" dir="rtl">
	<!-- Header -->
	<div class="header">
		<div class="header-copy">
			<h1 class="title">الوصفات</h1>
			<p class="subtitle">
				<span class="subtitle-stat">{data.recipes.length}</span>
				وصفة جاهزة للخطط والوجبات
			</p>
		</div>
		<div class="header-actions">
			<button
				class="btn btn-ai"
				onclick={() => {
					resetAIModal();
					showAIModal = true;
				}}
			>
				<svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24"
					><path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
					/></svg
				>
				توليد بالذكاء الاصطناعي
			</button>
			<button
				class="btn btn-primary"
				onclick={() => {
					resetCreate();
					showCreateModal = true;
				}}
			>
				<svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24"
					><path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M12 4v16m8-8H4"
					/></svg
				>
				وصفة جديدة
			</button>
		</div>
	</div>

	<!-- Tabs + Search row -->
	<div class="toolbar">
		<div class="tabs">
			<button class="tab" class:active={sourceTab === 'all'} onclick={() => (sourceTab = 'all')}>
				الكل <span class="tab-count">{data.recipes.length}</span>
			</button>
			<button
				class="tab"
				class:active={sourceTab === 'internal'}
				onclick={() => (sourceTab = 'internal')}
			>
				يدوية <span class="tab-count">{manualCount}</span>
			</button>
			<button class="tab" class:active={sourceTab === 'ai'} onclick={() => (sourceTab = 'ai')}>
				ذكاء اصطناعي <span class="tab-count">{aiCount}</span>
			</button>
		</div>
		<div class="search-wrapper">
			<svg class="search-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"
				><path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0"
				/></svg
			>
			<input
				type="text"
				bind:value={search}
				placeholder="ابحث في الوصفات..."
				class="search-input"
			/>
		</div>
	</div>

	{#if form?.error}
		<div class="alert-error">{form.error}</div>
	{/if}

	{#if filtered.length === 0}
		<div class="empty">
			<div class="empty-icon">
				<svg
					width="32"
					height="32"
					fill="none"
					stroke="#3cb96b"
					stroke-width="1.5"
					viewBox="0 0 24 24"
					><path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
					/></svg
				>
			</div>
			{#if search}
				<h3>لا توجد نتائج</h3>
				<p>لم نجد وصفات مطابقة لـ "{search}"</p>
			{:else}
				<h3>لا توجد وصفات بعد</h3>
				<p>أنشئ وصفتك الأولى يدوياً أو استخدم الذكاء الاصطناعي</p>
			{/if}
		</div>
	{:else}
		<div class="grid">
			{#each filtered as item}
				{@const r = item.recipe}
				{@const nutrients = parseNutrients(r.nutrients)}
				{@const isAI = r.source === 'ai'}
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div class="card" onclick={() => (viewRecipe = item)}>
					<!-- Image area -->
					<div class="card-image" class:ai={isAI} class:has-photo={!!r.imageUrl}>
						{#if r.imageUrl}
							<img class="card-cover-img" src={r.imageUrl} alt="" />
						{:else}
							<svg
								class="card-img-icon"
								width="32"
								height="32"
								fill="none"
								stroke="currentColor"
								stroke-width="1.2"
								viewBox="0 0 24 24"
							>
								<path
									d="M12 3C7 3 3 7 3 12s4 9 9 9 9-4 9-9-4-9-9-9z"
									opacity=".15"
									fill="currentColor"
								/>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M7 11c0-2.8 2.2-5 5-5s5 2.2 5 5M8.5 16.5l1-3h5l1 3M12 6v2m-4 3h8"
								/>
							</svg>
						{/if}
						<span class="card-tag" class:tag-ai={isAI}>{isAI ? 'ذكاء اصطناعي' : 'يدوية'}</span>
					</div>

					<!-- Body -->
					<div class="card-body">
						<p class="card-title">{r.nameAr ?? r.name}</p>
						{#if r.nameAr}<p class="card-subtitle">{r.name}</p>{/if}

						{#if r.portions}
							<span class="serving-badge">{r.portions} حصة</span>
						{/if}

						{#if nutrients}
							<div class="macro-row">
								<div class="macro-cell cal-cell">
									<div class="macro-lbl">سعرة</div>
									<div class="macro-val" style="color:#f97316">{fmtMacro(nutrients.calories)}</div>
								</div>
								<div class="macro-cell">
									<div class="macro-lbl">بروتين</div>
									<div class="macro-val" style="color:#3b82f6">{fmtMacro(nutrients.protein)}غ</div>
								</div>
								<div class="macro-cell">
									<div class="macro-lbl">كارب</div>
									<div class="macro-val" style="color:#22c55e">{fmtMacro(nutrients.carbs)}غ</div>
								</div>
								<div class="macro-cell">
									<div class="macro-lbl">دهون</div>
									<div class="macro-val" style="color:#ef4444">{fmtMacro(nutrients.fat)}غ</div>
								</div>
							</div>
						{/if}

						<div class="card-meta">
							{#if item.ingredients.length > 0}<span class="meta-chip"
									>{item.ingredients.length} مكون</span
								>{/if}
						</div>
					</div>

					<!-- Footer -->
					<div class="card-footer" onclick={(e: MouseEvent) => e.stopPropagation()}>
						<button class="btn-view" onclick={() => (viewRecipe = item)}>
							<svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"
								><path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
								/><path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
								/></svg
							>
							عرض التفاصيل
						</button>
						<div class="footer-actions">
							<button
								class="btn-icon"
								title="تعديل"
								onclick={(e: MouseEvent) => {
									e.stopPropagation();
									editingRecipe = item;
								}}
							>
								<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"
									><path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
									/></svg
								>
							</button>
							<form method="POST" action="?/deleteRecipe" use:enhance class="delete-recipe-form">
								<input type="hidden" name="recipeId" value={r.id} />
								<button
									type="submit"
									class="btn-icon btn-icon-danger"
									title="حذف"
									aria-label="حذف الوصفة"
									onclick={(e: MouseEvent) => e.stopPropagation()}
								>
									<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"
										><path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
										/></svg
									>
								</button>
							</form>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<!-- ─── View Recipe Modal ─── -->
{#if viewRecipe}
	{@const r = viewRecipe.recipe}
	{@const nutrients = parseNutrients(r.nutrients)}
	{@const portions = r.portions || 1}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="overlay" onclick={(e) => e.target === e.currentTarget && (viewRecipe = null)}>
		<div class="modal modal-lg modal-view-recipe" dir="rtl">
			<div class="modal-header">
				<div>
					<h2>{r.nameAr ?? r.name}</h2>
					{#if r.nameAr}<p class="modal-subtitle">{r.name}</p>{/if}
				</div>
				<button
					type="button"
					class="modal-close"
					aria-label="إغلاق"
					title="إغلاق"
					onclick={() => (viewRecipe = null)}
				>
					<svg
						width="14"
						height="14"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
						aria-hidden="true"
						><path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2.5"
							d="M6 18L18 6M6 6l12 12"
						/></svg
					>
				</button>
			</div>

			<div class="modal-body">
				{#if r.imageUrl}
					<div class="view-recipe-hero">
						<img src={r.imageUrl} alt="" />
					</div>
				{/if}
				<!-- Meta chips -->
				<div class="view-meta">
					{#if r.portions}<span class="meta-chip">{r.portions} حصة</span>{/if}
					<span class="meta-chip" class:meta-ai={r.source === 'ai'}>
						{r.source === 'ai' ? 'ذكاء اصطناعي' : 'يدوية'}
					</span>
				</div>

				<!-- Nutrients -->
				{#if nutrients}
					<div class="nutrients-card">
						<div class="nutrients-title">القيم الغذائية الإجمالية</div>
						<div class="nutrients-grid">
							<div class="nutrient-item">
								<div class="nutrient-val" style="color:#f97316">{fmtMacro(nutrients.calories)}</div>
								<div class="nutrient-lbl">سعرة</div>
							</div>
							<div class="nutrient-item">
								<div class="nutrient-val" style="color:#3b82f6">{fmtMacro(nutrients.protein)}غ</div>
								<div class="nutrient-lbl">بروتين</div>
							</div>
							<div class="nutrient-item">
								<div class="nutrient-val" style="color:#22c55e">{fmtMacro(nutrients.carbs)}غ</div>
								<div class="nutrient-lbl">كربوهيدرات</div>
							</div>
							<div class="nutrient-item">
								<div class="nutrient-val" style="color:#ef4444">{fmtMacro(nutrients.fat)}غ</div>
								<div class="nutrient-lbl">دهون</div>
							</div>
							{#if nutrients.fiber}<div class="nutrient-item">
									<div class="nutrient-val" style="color:#d97706">{fmtMacro(nutrients.fiber)}غ</div>
									<div class="nutrient-lbl">ألياف</div>
								</div>{/if}
						</div>
						{#if portions > 1}
							<div class="nutrients-per-serving">
								<div class="nutrients-per-title">لكل حصة ({portions} حصص)</div>
								<div class="nutrients-grid nutrients-grid-sm">
									<div>
										<span style="color:#f97316"
											>{fmtMacro((nutrients.calories ?? 0) / portions)}</span
										> سعرة
									</div>
									<div>
										<span style="color:#3b82f6"
											>{fmtMacro((nutrients.protein ?? 0) / portions)}</span
										>غ بروتين
									</div>
									<div>
										<span style="color:#22c55e">{fmtMacro((nutrients.carbs ?? 0) / portions)}</span
										>غ كارب
									</div>
									<div>
										<span style="color:#ef4444">{fmtMacro((nutrients.fat ?? 0) / portions)}</span>غ
										دهون
									</div>
								</div>
							</div>
						{/if}
					</div>
				{/if}

				<!-- Ingredients -->
				{#if viewRecipe.ingredients.length > 0}
					<div>
						<div class="section-title">المكونات ({viewRecipe.ingredients.length})</div>
						<div class="ingredients-list">
							{#each viewRecipe.ingredients as { ingredient, food }}
								<div class="ingredient-row">
									<span class="ingredient-name"
										>{food?.nameAr ?? food?.name ?? ingredient.customText ?? '—'}</span
									>
									<span class="ingredient-qty">{ingredient.quantity} {ingredient.unit}</span>
								</div>
							{/each}
						</div>
					</div>
				{/if}

				<!-- Steps -->
				{#if r.steps}
					<div>
						<div class="section-title">خطوات التحضير</div>
						<div class="steps-box">{r.steps}</div>
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}

<!-- ─── Create Modal ─── -->
{#if showCreateModal}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="overlay" onclick={(e) => e.target === e.currentTarget && (showCreateModal = false)}>
		<div class="modal modal-recipe-form recipe-page-modal" dir="rtl">
			<div class="modal-header">
				<div class="modal-header-text">
					<h2>وصفة جديدة</h2>
					<p class="modal-subtitle">أضف المكونات من أطعمتك وخطوات التحضير</p>
				</div>
				<button
					type="button"
					class="modal-close"
					aria-label="إغلاق"
					title="إغلاق"
					onclick={() => (showCreateModal = false)}
				>
					<svg
						width="14"
						height="14"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
						aria-hidden="true"
						><path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2.5"
							d="M6 18L18 6M6 6l12 12"
						/></svg
					>
				</button>
			</div>
			<form
				method="POST"
				action="?/createRecipe"
				enctype="multipart/form-data"
				use:enhance={() => {
					createLoading = true;
					return async ({ update }) => {
						await update();
						createLoading = false;
						showCreateModal = false;
						resetCreate();
					};
				}}
			>
				<input type="hidden" name="ingredients" value={JSON.stringify(createIngredients)} />
				<div class="modal-body">
					<div class="recipe-photo-block">
						<div class="recipe-photo-row">
							<!-- svelte-ignore a11y_click_events_have_key_events -->
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<button
								type="button"
								class="recipe-photo-thumb"
								onclick={() => createRecipeImageInput?.click()}
							>
								{#if createRecipeImagePreview}
									<img src={createRecipeImagePreview} alt="" />
								{:else}
									<svg
										width="24"
										height="24"
										fill="none"
										stroke="#d1d5db"
										stroke-width="1.5"
										viewBox="0 0 24 24"
										><path
											stroke-linecap="round"
											stroke-linejoin="round"
											d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
										/></svg
									>
								{/if}
							</button>
							<div class="recipe-photo-meta">
								<p class="recipe-photo-heading">صورة الوصفة</p>
								<p class="recipe-photo-hint-line">
									اختياري · PNG أو JPG أو WEBP أو GIF · حتى 5 ميغابايت
								</p>
								<div class="recipe-photo-actions">
									<button
										type="button"
										class="recipe-photo-upload-link"
										onclick={() => createRecipeImageInput?.click()}
									>
										{createRecipeImagePreview ? 'تغيير الصورة' : 'رفع صورة'}
									</button>
									{#if createRecipeImagePreview}
										<button
											type="button"
											class="recipe-photo-clear"
											onclick={(e) => {
												e.stopPropagation();
												createRecipeImagePreview = null;
												if (createRecipeImageInput) createRecipeImageInput.value = '';
											}}>إزالة الصورة</button
										>
									{/if}
								</div>
								<input
									bind:this={createRecipeImageInput}
									type="file"
									name="image"
									accept="image/jpeg,image/png,image/webp,image/gif"
									class="hidden-file-input"
									onchange={handleCreateRecipeImage}
								/>
							</div>
						</div>
					</div>

					<div class="section-label">معلومات الوصفة</div>
					<div class="field-row">
						<div class="field">
							<label for="nameAr">الاسم بالعربي <span class="required">*</span></label>
							<input
								id="nameAr"
								name="nameAr"
								type="text"
								required
								class="input"
								placeholder="مثال: شوربة العدس"
							/>
						</div>
						<div class="field">
							<label for="name"
								>الاسم بالإنجليزي <span class="optional-label">(اختياري)</span></label
							>
							<input
								id="name"
								name="name"
								type="text"
								class="input"
								placeholder="Lentil Soup"
								dir="ltr"
							/>
						</div>
					</div>
					<div class="field field-portions">
						<label for="portions">عدد الحصص</label>
						<input
							id="portions"
							name="portions"
							type="number"
							value="1"
							min="1"
							class="input input-portions"
							dir="ltr"
							inputmode="numeric"
						/>
					</div>
					<div class="field">
						<label for="yield">الناتج <span class="optional-label">(اختياري)</span></label>
						<input
							id="yield"
							name="yield"
							type="text"
							class="input"
							placeholder="مثال: 4 أكواب، 12 قطعة..."
						/>
					</div>

					<div class="section-label">المكونات</div>
					<!-- Ingredient search -->
					<div style="position:relative;">
						<div class="ing-search-wrap">
							<svg
								width="14"
								height="14"
								fill="none"
								stroke="#94a3b8"
								viewBox="0 0 24 24"
								style="flex-shrink:0"
								><path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0"
								/></svg
							>
							<input
								type="text"
								bind:value={createIngSearch}
								oninput={searchCreateIng}
								placeholder="ابحث في أطعمتك…"
								class="ing-search-input"
							/>
							{#if createIngLoading}
								<span class="spinner spinner-dark" style="width:14px;height:14px;flex-shrink:0;"
								></span>
							{/if}
						</div>
						{#if createIngResults.length > 0}
							<div class="ing-dropdown">
								{#each createIngResults.slice(0, 8) as ing}
									<button type="button" class="ing-dropdown-row" onclick={() => addCreateIng(ing)}>
										<span class="ing-dropdown-name">{ing.nameAr ?? ing.name}</span>
										<span class="ing-dropdown-cal">{ing.calories} kcal/100{ing.unit}</span>
									</button>
								{/each}
							</div>
						{/if}
					</div>

					<!-- Selected ingredients -->
					{#if createIngredients.length > 0}
						<div class="ing-list">
							{#each createIngredients as ing, i}
								{@const f = ing.quantity / (ing.portionSize || 100)}
								<div class="ing-row">
									<div class="ing-row-head">
										<span class="ing-name">{ing.nameAr ?? ing.name}</span>
										<button
											type="button"
											class="ing-remove"
											aria-label="حذف المكون"
											title="حذف المكون"
											onclick={() => removeCreateIng(i)}
										>
											<svg
												width="12"
												height="12"
												fill="none"
												stroke="currentColor"
												viewBox="0 0 24 24"
												aria-hidden="true"
												><path
													stroke-linecap="round"
													stroke-linejoin="round"
													stroke-width="2.5"
													d="M6 18L18 6M6 6l12 12"
												/></svg
											>
										</button>
									</div>
									<div class="ing-row-meta">
										<div class="ing-qty-wrap">
											<input
												type="number"
												bind:value={ing.quantity}
												min="0"
												step="any"
												class="ing-qty-input"
												dir="ltr"
												inputmode="decimal"
											/>
											<span class="ing-unit">{ing.unit}</span>
										</div>
										<div class="ing-macros">
											<span class="ing-macro-pill ing-macro-cal ing-macro-pill-stack">
												<span class="ing-macro-pill-val">{Math.round(ing.calories * f)}</span>
												<span class="ing-macro-pill-lbl">سعرة حرارية</span>
											</span>
											<span class="ing-macro-pill ing-macro-prot ing-macro-pill-stack">
												<span class="ing-macro-pill-val"
													>{Math.round(ing.protein * f)}<span class="ing-macro-pill-unit">
														غ</span
													></span
												>
												<span class="ing-macro-pill-lbl">بروتين</span>
											</span>
											<span class="ing-macro-pill ing-macro-carb ing-macro-pill-stack">
												<span class="ing-macro-pill-val"
													>{Math.round(ing.carbs * f)}<span class="ing-macro-pill-unit">
														غ</span
													></span
												>
												<span class="ing-macro-pill-lbl">كربوهيدرات</span>
											</span>
											<span class="ing-macro-pill ing-macro-fat ing-macro-pill-stack">
												<span class="ing-macro-pill-val"
													>{Math.round(ing.fat * f)}<span class="ing-macro-pill-unit">
														غ</span
													></span
												>
												<span class="ing-macro-pill-lbl">دهون</span>
											</span>
										</div>
									</div>
								</div>
							{/each}
							{#if true}
								{@const t = createTotals()}
								<div class="ing-totals">
									<span class="ing-totals-title">المجموع</span>
									<div class="ing-totals-pills">
										<span class="ing-macro-pill ing-macro-cal ing-macro-pill-stack">
											<span class="ing-macro-pill-val">{t.cal}</span>
											<span class="ing-macro-pill-lbl">سعرة حرارية</span>
										</span>
										<span class="ing-macro-pill ing-macro-prot ing-macro-pill-stack">
											<span class="ing-macro-pill-val"
												>{t.pro}<span class="ing-macro-pill-unit"> غ</span></span
											>
											<span class="ing-macro-pill-lbl">بروتين</span>
										</span>
										<span class="ing-macro-pill ing-macro-carb ing-macro-pill-stack">
											<span class="ing-macro-pill-val"
												>{t.carb}<span class="ing-macro-pill-unit"> غ</span></span
											>
											<span class="ing-macro-pill-lbl">كربوهيدرات</span>
										</span>
										<span class="ing-macro-pill ing-macro-fat ing-macro-pill-stack">
											<span class="ing-macro-pill-val"
												>{t.fat}<span class="ing-macro-pill-unit"> غ</span></span
											>
											<span class="ing-macro-pill-lbl">دهون</span>
										</span>
									</div>
								</div>
							{/if}
						</div>
					{:else}
						<div class="ing-empty">لا توجد مكونات بعد. ابحث في أطعمتك.</div>
					{/if}

					<div class="section-label">خطوات التحضير</div>
					<div class="field">
						<label for="steps">الخطوات <span class="required">*</span></label><textarea
							id="steps"
							name="steps"
							rows="4"
							class="input"
							placeholder="اكتب خطوات تحضير الوصفة..."
							required
						></textarea>
					</div>
				</div>
				<div class="modal-footer">
					<button type="button" class="btn btn-ghost" onclick={() => (showCreateModal = false)}
						>إلغاء</button
					>
					<button type="submit" class="btn btn-primary" disabled={createLoading}>
						{#if createLoading}<span class="spinner"></span>جاري الحفظ...{:else}حفظ الوصفة{/if}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<!-- ─── AI Modal ─── -->
{#if showAIModal}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="overlay" onclick={(e) => e.target === e.currentTarget && (showAIModal = false)}>
		<div class="modal modal-ai" dir="rtl">
			<div class="modal-header">
				<div style="display:flex; align-items:center; gap:12px;">
					<div class="ai-icon-wrap">
						<svg width="20" height="20" fill="none" viewBox="0 0 24 24">
							<path
								d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"
								fill="#7c5cbf"
							/>
						</svg>
					</div>
					<div>
						<h2>إنشاء وصفة بالذكاء</h2>
						<p class="modal-subtitle">سيتم إنشاء المكونات والخطوات والقيم الغذائية تلقائياً</p>
					</div>
				</div>
				<button
					type="button"
					class="modal-close"
					aria-label="إغلاق"
					title="إغلاق"
					onclick={() => (showAIModal = false)}
				>
					<svg
						width="14"
						height="14"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
						aria-hidden="true"
						><path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2.5"
							d="M6 18L18 6M6 6l12 12"
						/></svg
					>
				</button>
			</div>
			<div class="modal-body">
				{#if aiError}<div class="alert-error" style="margin:0;">{aiError}</div>{/if}

				<!-- Description -->
				<div class="field">
					<label for="aiDesc">ماذا تريد أن تطبخ؟ <span class="required">*</span></label>
					<textarea
						id="aiDesc"
						bind:value={aiDescription}
						class="input"
						rows="2"
						placeholder="مثال: كبسة دجاج صحية، سلطة سيزر بالبروتين العالي، وجبة مناسبة لمرضى السكري..."
					></textarea>
				</div>

				<!-- Portions first, then kcal (RTL reading order); numbers stay LTR inside inputs -->
				<div class="field-row field-row-ai-numeric">
					<div class="field">
						<label for="aiPort">عدد الحصص</label>
						<input
							id="aiPort"
							bind:value={aiPortions}
							type="number"
							min="1"
							class="input input-ai-number"
							inputmode="numeric"
						/>
					</div>
					<div class="field">
						<label for="aiCals">السعرات/حصة <span class="optional-label">(اختياري)</span></label>
						<input
							id="aiCals"
							bind:value={aiCaloriesPerServing}
							type="number"
							min="100"
							class="input input-ai-number"
							placeholder="مثال: 500"
							inputmode="numeric"
						/>
					</div>
				</div>

				<!-- Macro presets -->
				<div class="field">
					<span id="ai-macro-presets-label" class="field-group-heading">نسبة المغذيات الكبرى</span>
					<div class="preset-tabs" role="group" aria-labelledby="ai-macro-presets-label">
						<button
							type="button"
							class="preset-tab"
							class:active={aiMacroPreset === 'balanced'}
							onclick={() => selectMacroPreset('balanced')}>متوازن</button
						>
						<button
							type="button"
							class="preset-tab"
							class:active={aiMacroPreset === 'highProtein'}
							onclick={() => selectMacroPreset('highProtein')}>بروتين عالي</button
						>
						<button
							type="button"
							class="preset-tab"
							class:active={aiMacroPreset === 'lowCarb'}
							onclick={() => selectMacroPreset('lowCarb')}>كربوهيدرات منخفضة</button
						>
						<button
							type="button"
							class="preset-tab"
							class:active={aiMacroPreset === 'custom'}
							onclick={() => selectMacroPreset('custom')}>مخصص</button
						>
					</div>
					{#if aiMacroPreset === 'custom'}
						<div class="macro-inputs macro-inputs-ai">
							<div class="macro-input-cell">
								<label for="aiCarbs">% الكربوهيدرات</label>
								<input
									id="aiCarbs"
									type="number"
									bind:value={aiCarbsPct}
									min="0"
									max="100"
									class="input input-sm input-ai-number"
									inputmode="numeric"
								/>
							</div>
							<div class="macro-input-cell">
								<label for="aiProt">% البروتين</label>
								<input
									id="aiProt"
									type="number"
									bind:value={aiProteinPct}
									min="0"
									max="100"
									class="input input-sm input-ai-number"
									inputmode="numeric"
								/>
							</div>
							<div class="macro-input-cell">
								<label for="aiFats">% الدهون</label>
								<input
									id="aiFats"
									type="number"
									bind:value={aiFatPct}
									min="0"
									max="100"
									class="input input-sm input-ai-number"
									inputmode="numeric"
								/>
							</div>
						</div>
					{:else}
						<div class="macro-preview">
							<span>كارب {aiCarbsPct}%</span>
							<span>بروتين {aiProteinPct}%</span>
							<span>دهون {aiFatPct}%</span>
						</div>
					{/if}
				</div>
			</div>
			<div class="modal-footer">
				<button class="btn btn-ghost" onclick={() => (showAIModal = false)} disabled={aiLoading}
					>إلغاء</button
				>
				<button
					class="btn btn-ai"
					disabled={aiLoading || !aiDescription.trim()}
					onclick={async () => {
						if (!aiDescription.trim()) return;
						aiLoading = true;
						aiError = '';
						try {
							const body: Record<string, unknown> = { name: aiDescription };
							const cals = parseInt(aiCaloriesPerServing);
							if (cals > 0) body.targetCalories = cals;
							const port = parseInt(aiPortions);
							if (port > 0) body.portions = port;
							body.macroRatios = { carbs: aiCarbsPct, protein: aiProteinPct, fat: aiFatPct };
							const res = await generateRecipeWithAi(body);
							if (!res.ok) throw new Error(await res.text());
							showAIModal = false;
							resetAIModal();
							await invalidate('app:recipes');
						} catch (e: unknown) {
							aiError = e instanceof Error ? e.message : 'حدث خطأ غير متوقع';
						} finally {
							aiLoading = false;
						}
					}}
				>
					{#if aiLoading}<span class="spinner"></span>جاري التوليد...{:else}
						<svg width="15" height="15" fill="none" viewBox="0 0 24 24"
							><path
								d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"
								fill="currentColor"
							/></svg
						>
						توليد الوصفة
					{/if}
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- ─── Edit Modal ─── -->
{#if editingRecipe}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="overlay" onclick={(e) => e.target === e.currentTarget && (editingRecipe = null)}>
		<div class="modal modal-recipe-form recipe-page-modal" dir="rtl">
			<div class="modal-header">
				<div class="modal-header-text">
					<h2>تعديل الوصفة</h2>
					<p class="modal-subtitle">نفس حقول «وصفة جديدة» مع عرض القيم الحالية للتعديل</p>
				</div>
				<button
					type="button"
					class="modal-close"
					aria-label="إغلاق"
					title="إغلاق"
					onclick={() => (editingRecipe = null)}
				>
					<svg
						width="14"
						height="14"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
						aria-hidden="true"
						><path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2.5"
							d="M6 18L18 6M6 6l12 12"
						/></svg
					>
				</button>
			</div>
			<form
				method="POST"
				action="?/editRecipe"
				enctype="multipart/form-data"
				use:enhance={() => {
					editLoading = true;
					return async ({ update }) => {
						await update();
						editLoading = false;
						editingRecipe = null;
					};
				}}
			>
				<input type="hidden" name="id" value={editingRecipe.recipe.id} />
				<input type="hidden" name="ingredients" value={editIngredientsJson} />
				<div class="modal-body">
					<div class="recipe-photo-block">
						<div class="recipe-photo-row">
							<!-- svelte-ignore a11y_click_events_have_key_events -->
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<button
								type="button"
								class="recipe-photo-thumb"
								onclick={() => editRecipeImageInput?.click()}
							>
								{#if editRecipeImagePreview}
									<img src={editRecipeImagePreview} alt="" />
								{:else if editingRecipe.recipe.imageUrl}
									<img src={editingRecipe.recipe.imageUrl} alt="" />
								{:else}
									<svg
										width="24"
										height="24"
										fill="none"
										stroke="#d1d5db"
										stroke-width="1.5"
										viewBox="0 0 24 24"
										><path
											stroke-linecap="round"
											stroke-linejoin="round"
											d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
										/></svg
									>
								{/if}
							</button>
							<div class="recipe-photo-meta">
								<p class="recipe-photo-heading">صورة الوصفة</p>
								<p class="recipe-photo-hint-line">
									اختياري · PNG أو JPG أو WEBP أو GIF · حتى 5 ميغابايت
								</p>
								<div class="recipe-photo-actions">
									<button
										type="button"
										class="recipe-photo-upload-link"
										onclick={() => editRecipeImageInput?.click()}
									>
										{editRecipeImagePreview || editingRecipe.recipe.imageUrl
											? 'تغيير الصورة'
											: 'رفع صورة'}
									</button>
									{#if editRecipeImagePreview}
										<button
											type="button"
											class="recipe-photo-clear"
											onclick={(e) => {
												e.stopPropagation();
												editRecipeImagePreview = null;
												if (editRecipeImageInput) editRecipeImageInput.value = '';
											}}>إلغاء الصورة الجديدة</button
										>
									{/if}
								</div>
								<input
									bind:this={editRecipeImageInput}
									type="file"
									name="image"
									accept="image/jpeg,image/png,image/webp,image/gif"
									class="hidden-file-input"
									onchange={handleEditRecipeImage}
								/>
							</div>
						</div>
					</div>

					<div class="section-label">معلومات الوصفة</div>
					<div class="field-row">
						<div class="field">
							<label for="edit-nameAr">الاسم بالعربي <span class="required">*</span></label>
							<input
								id="edit-nameAr"
								name="nameAr"
								type="text"
								required
								class="input"
								bind:value={editFormNameAr}
								placeholder="مثال: شوربة العدس"
							/>
						</div>
						<div class="field">
							<label for="edit-name"
								>الاسم بالإنجليزي <span class="optional-label">(اختياري)</span></label
							>
							<input
								id="edit-name"
								name="name"
								type="text"
								class="input"
								bind:value={editFormName}
								placeholder="Lentil Soup"
								dir="ltr"
							/>
						</div>
					</div>
					<div class="field field-portions">
						<label for="edit-portions">عدد الحصص</label>
						<input
							id="edit-portions"
							name="portions"
							type="number"
							bind:value={editFormPortions}
							min="1"
							class="input input-portions"
							dir="ltr"
							inputmode="numeric"
						/>
					</div>
					<div class="field">
						<label for="edit-yield">الناتج <span class="optional-label">(اختياري)</span></label>
						<input
							id="edit-yield"
							name="yield"
							type="text"
							class="input"
							bind:value={editYield}
							placeholder="مثال: 4 أكواب، 12 قطعة..."
						/>
					</div>

					<div class="section-label">المكونات</div>
					<div style="position:relative;">
						<div class="ing-search-wrap">
							<svg
								width="14"
								height="14"
								fill="none"
								stroke="#94a3b8"
								viewBox="0 0 24 24"
								style="flex-shrink:0"
								><path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0"
								/></svg
							>
							<input
								type="text"
								bind:value={editIngSearch}
								oninput={searchEditIng}
								placeholder="ابحث في أطعمتك…"
								class="ing-search-input"
							/>
							{#if editIngLoading}
								<span class="spinner spinner-dark" style="width:14px;height:14px;flex-shrink:0;"
								></span>
							{/if}
						</div>
						{#if editIngResults.length > 0}
							<div class="ing-dropdown">
								{#each editIngResults.slice(0, 8) as ing}
									<button type="button" class="ing-dropdown-row" onclick={() => addEditIng(ing)}>
										<span class="ing-dropdown-name">{ing.nameAr ?? ing.name}</span>
										<span class="ing-dropdown-cal">{ing.calories} kcal/100{ing.unit}</span>
									</button>
								{/each}
							</div>
						{/if}
					</div>

					{#if editRecipeLines.length > 0}
						<div class="ing-list">
							{#each editRecipeLines as line, i}
								{#if line.tag === 'food'}
									{@const ing = line.ing}
									{@const f = ing.quantity / (ing.portionSize || 100)}
									<div class="ing-row">
										<div class="ing-row-head">
											<span class="ing-name">{ing.nameAr ?? ing.name}</span>
											<button
												type="button"
												class="ing-remove"
												aria-label="حذف المكون"
												title="حذف المكون"
												onclick={() => removeEditLine(i)}
											>
												<svg
													width="12"
													height="12"
													fill="none"
													stroke="currentColor"
													viewBox="0 0 24 24"
													aria-hidden="true"
													><path
														stroke-linecap="round"
														stroke-linejoin="round"
														stroke-width="2.5"
														d="M6 18L18 6M6 6l12 12"
													/></svg
												>
											</button>
										</div>
										<div class="ing-row-meta">
											<div class="ing-qty-wrap">
												<input
													type="number"
													bind:value={ing.quantity}
													min="0"
													step="any"
													class="ing-qty-input"
													dir="ltr"
													inputmode="decimal"
												/>
												<span class="ing-unit">{ing.unit}</span>
											</div>
											<div class="ing-macros">
												<span class="ing-macro-pill ing-macro-cal ing-macro-pill-stack">
													<span class="ing-macro-pill-val">{Math.round(ing.calories * f)}</span>
													<span class="ing-macro-pill-lbl">سعرة حرارية</span>
												</span>
												<span class="ing-macro-pill ing-macro-prot ing-macro-pill-stack">
													<span class="ing-macro-pill-val"
														>{Math.round(ing.protein * f)}<span class="ing-macro-pill-unit">
															غ</span
														></span
													>
													<span class="ing-macro-pill-lbl">بروتين</span>
												</span>
												<span class="ing-macro-pill ing-macro-carb ing-macro-pill-stack">
													<span class="ing-macro-pill-val"
														>{Math.round(ing.carbs * f)}<span class="ing-macro-pill-unit">
															غ</span
														></span
													>
													<span class="ing-macro-pill-lbl">كربوهيدرات</span>
												</span>
												<span class="ing-macro-pill ing-macro-fat ing-macro-pill-stack">
													<span class="ing-macro-pill-val"
														>{Math.round(ing.fat * f)}<span class="ing-macro-pill-unit">
															غ</span
														></span
													>
													<span class="ing-macro-pill-lbl">دهون</span>
												</span>
											</div>
										</div>
									</div>
								{:else}
									<div class="ing-row">
										<div class="ing-row-head">
											<span class="ing-name">{line.customText}</span>
											<span class="optional-label" style="font-size:11px;">نص مخصص</span>
											<button
												type="button"
												class="ing-remove"
												aria-label="حذف المكون"
												title="حذف المكون"
												onclick={() => removeEditLine(i)}
											>
												<svg
													width="12"
													height="12"
													fill="none"
													stroke="currentColor"
													viewBox="0 0 24 24"
													aria-hidden="true"
													><path
														stroke-linecap="round"
														stroke-linejoin="round"
														stroke-width="2.5"
														d="M6 18L18 6M6 6l12 12"
													/></svg
												>
											</button>
										</div>
										<div class="ing-row-meta">
											<div class="ing-qty-wrap">
												<input
													type="number"
													bind:value={line.quantity}
													min="0"
													step="any"
													class="ing-qty-input"
													dir="ltr"
													inputmode="decimal"
												/>
												<span class="ing-unit">{line.unit}</span>
											</div>
										</div>
									</div>
								{/if}
							{/each}
							{#if true}
								{@const t = editTotals()}
								<div class="ing-totals">
									<span class="ing-totals-title">المجموع</span>
									<div class="ing-totals-pills">
										<span class="ing-macro-pill ing-macro-cal ing-macro-pill-stack">
											<span class="ing-macro-pill-val">{t.cal}</span>
											<span class="ing-macro-pill-lbl">سعرة حرارية</span>
										</span>
										<span class="ing-macro-pill ing-macro-prot ing-macro-pill-stack">
											<span class="ing-macro-pill-val"
												>{t.pro}<span class="ing-macro-pill-unit"> غ</span></span
											>
											<span class="ing-macro-pill-lbl">بروتين</span>
										</span>
										<span class="ing-macro-pill ing-macro-carb ing-macro-pill-stack">
											<span class="ing-macro-pill-val"
												>{t.carb}<span class="ing-macro-pill-unit"> غ</span></span
											>
											<span class="ing-macro-pill-lbl">كربوهيدرات</span>
										</span>
										<span class="ing-macro-pill ing-macro-fat ing-macro-pill-stack">
											<span class="ing-macro-pill-val"
												>{t.fat}<span class="ing-macro-pill-unit"> غ</span></span
											>
											<span class="ing-macro-pill-lbl">دهون</span>
										</span>
									</div>
								</div>
							{/if}
						</div>
					{:else}
						<div class="ing-empty">لا توجد مكونات بعد. ابحث في أطعمتك.</div>
					{/if}

					<div class="section-label">خطوات التحضير</div>
					<div class="field">
						<label for="edit-steps">الخطوات <span class="required">*</span></label>
						<textarea
							id="edit-steps"
							name="steps"
							rows="4"
							required
							class="input"
							bind:value={editStepsBody}
							placeholder="اكتب خطوات تحضير الوصفة..."
						></textarea>
					</div>
				</div>
				<div class="modal-footer">
					<button type="button" class="btn btn-ghost" onclick={() => (editingRecipe = null)}
						>إلغاء</button
					>
					<button type="submit" class="btn btn-primary" disabled={editLoading}>
						{#if editLoading}<span class="spinner"></span>جاري الحفظ...{:else}حفظ الوصفة{/if}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<style>
	.page {
		--rp-ink: #121816;
		--rp-muted: #5c6560;
		--rp-line: #e2e8e4;
		--rp-surface: #ffffff;
		--rp-accent: #2a9d62;
		--rp-accent-deep: #1f7a4a;
		--rp-warm: #faf9f6;
		--font-display: 'El Messiri', 'Tajawal', serif;

		padding: 28px 32px 40px;
		max-width: 1120px;
		margin: 0 auto;
		font-family: 'Tajawal', sans-serif;
		animation: page-in 0.55s cubic-bezier(0.22, 1, 0.36, 1) both;
	}

	@keyframes page-in {
		from {
			opacity: 0;
			transform: translateY(8px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	/* Header */
	.header {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		margin-bottom: 28px;
		flex-wrap: wrap;
		gap: 20px;
	}
	.header-copy {
		max-width: min(100%, 420px);
	}
	.title {
		font-family: var(--font-display);
		font-size: clamp(1.65rem, 4vw, 2rem);
		font-weight: 700;
		color: var(--rp-ink);
		margin: 0 0 8px;
		line-height: 1.15;
		letter-spacing: -0.02em;
	}
	.subtitle {
		font-size: 13.5px;
		color: var(--rp-muted);
		margin: 0;
		line-height: 1.5;
	}
	.subtitle-stat {
		font-weight: 800;
		color: var(--rp-accent);
		margin-inline-end: 6px;
	}
	.header-actions {
		display: flex;
		gap: 10px;
		flex-wrap: wrap;
	}

	/* Toolbar */
	.toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		margin-bottom: 26px;
		flex-wrap: wrap;
		padding: 14px 16px;
		background: var(--rp-surface);
		border: 1px solid var(--rp-line);
		border-radius: 16px;
		box-shadow: 0 4px 24px rgba(18, 24, 22, 0.04);
	}
	.tabs {
		display: flex;
		gap: 5px;
		background: var(--rp-warm);
		padding: 5px;
		border-radius: 14px;
		border: 1px solid rgba(226, 232, 228, 0.9);
	}
	.tab {
		padding: 8px 16px;
		border-radius: 11px;
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
		border: none;
		background: transparent;
		color: var(--rp-muted);
		font-family: 'Tajawal', sans-serif;
		display: flex;
		align-items: center;
		gap: 6px;
		transition:
			color 0.2s ease,
			background 0.2s ease,
			box-shadow 0.2s ease,
			transform 0.15s ease;
	}
	.tab:hover {
		color: var(--rp-ink);
		background: rgba(255, 255, 255, 0.7);
	}
	.tab:active {
		transform: scale(0.98);
	}
	.tab:focus-visible {
		outline: 2px solid var(--rp-accent);
		outline-offset: 2px;
	}
	.tab.active {
		background: var(--rp-surface);
		color: var(--rp-ink);
		font-weight: 700;
		box-shadow: 0 2px 12px rgba(18, 24, 22, 0.08);
	}
	.tab-count {
		font-size: 11px;
		background: rgba(18, 24, 22, 0.06);
		color: var(--rp-muted);
		padding: 2px 8px;
		border-radius: 999px;
		font-weight: 700;
	}
	.tab.active .tab-count {
		background: rgba(42, 157, 98, 0.15);
		color: var(--rp-accent-deep);
	}

	.search-wrapper {
		position: relative;
		width: min(100%, 280px);
	}
	.search-icon {
		position: absolute;
		right: 14px;
		top: 50%;
		transform: translateY(-50%);
		width: 16px;
		height: 16px;
		color: #94a3b0;
		pointer-events: none;
	}
	.search-input {
		width: 100%;
		border: 1.5px solid var(--rp-line);
		border-radius: 12px;
		padding: 10px 40px 10px 14px;
		font-size: 13.5px;
		font-family: 'Tajawal', sans-serif;
		outline: none;
		transition:
			border 0.2s ease,
			box-shadow 0.2s ease;
		background: var(--rp-warm);
		color: var(--rp-ink);
	}
	.search-input::placeholder {
		color: #9aa39e;
	}
	.search-input:hover {
		border-color: #c5cdc7;
	}
	.search-input:focus {
		border-color: var(--rp-accent);
		box-shadow: 0 0 0 4px rgba(42, 157, 98, 0.12);
		background: var(--rp-surface);
	}

	/* Buttons */
	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		border: none;
		border-radius: 12px;
		padding: 11px 20px;
		font-size: 13.5px;
		font-weight: 600;
		cursor: pointer;
		transition:
			transform 0.15s ease,
			box-shadow 0.2s ease,
			background 0.2s ease;
		font-family: 'Tajawal', sans-serif;
		white-space: nowrap;
	}
	.btn:focus-visible {
		outline: 2px solid var(--rp-accent);
		outline-offset: 3px;
	}
	.btn:active:not(:disabled) {
		transform: scale(0.98);
	}
	.btn-primary {
		background: linear-gradient(
			165deg,
			#34b16f 0%,
			var(--rp-accent) 45%,
			var(--rp-accent-deep) 100%
		);
		color: #fff;
		box-shadow: 0 4px 16px rgba(42, 157, 98, 0.28);
	}
	.btn-primary:hover:not(:disabled) {
		box-shadow: 0 8px 28px rgba(42, 157, 98, 0.35);
	}
	.btn-ai {
		background: linear-gradient(135deg, #5b4a9e 0%, #8b6fd4 50%, #a78bfa 100%);
		color: #fff;
		box-shadow: 0 4px 18px rgba(91, 74, 158, 0.28);
	}
	.btn-ai:hover:not(:disabled) {
		box-shadow: 0 8px 26px rgba(91, 74, 158, 0.34);
	}
	.btn-ghost {
		background: transparent;
		color: var(--rp-muted);
		border: 1.5px solid var(--rp-line);
	}
	.btn-ghost:hover:not(:disabled) {
		background: var(--rp-warm);
		border-color: #c5cdc7;
		color: var(--rp-ink);
	}
	.btn:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}

	/* Grid */
	.grid {
		display: grid;
		gap: 18px;
		grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
	}

	/* Card */
	.card {
		background: var(--rp-surface);
		border-radius: 18px;
		border: 1px solid var(--rp-line);
		box-shadow: 0 2px 8px rgba(18, 24, 22, 0.04);
		transition:
			box-shadow 0.28s ease,
			transform 0.28s ease,
			border-color 0.28s ease;
		overflow: hidden;
		display: flex;
		flex-direction: column;
		cursor: pointer;
		animation: card-rise 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
	}
	.card:nth-child(1) {
		animation-delay: 0.04s;
	}
	.card:nth-child(2) {
		animation-delay: 0.08s;
	}
	.card:nth-child(3) {
		animation-delay: 0.12s;
	}
	.card:nth-child(4) {
		animation-delay: 0.16s;
	}
	.card:nth-child(5) {
		animation-delay: 0.2s;
	}
	.card:nth-child(6) {
		animation-delay: 0.24s;
	}
	.card:nth-child(n + 7) {
		animation-delay: 0.28s;
	}
	@keyframes card-rise {
		from {
			opacity: 0;
			transform: translateY(14px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
	.card:hover {
		box-shadow: 0 16px 48px rgba(18, 24, 22, 0.1);
		transform: translateY(-4px);
		border-color: rgba(42, 157, 98, 0.35);
	}
	.card:focus-within {
		outline: 2px solid var(--rp-accent);
		outline-offset: 3px;
	}
	.card-image {
		position: relative;
		padding-top: 58%;
		background: linear-gradient(145deg, #ecf8f0 0%, #d4eedf 40%, #bfe8d2 100%);
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
	}
	.card-image.ai {
		background: linear-gradient(145deg, #f3f0ff 0%, #e9e3ff 45%, #ddd4ff 100%);
	}
	.card-image.has-photo {
		background: #e8ece9;
	}
	.card-cover-img {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
		z-index: 0;
		transition: transform 0.45s ease;
	}
	.card:hover .card-cover-img {
		transform: scale(1.04);
	}
	.card-img-icon {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		color: rgba(42, 157, 98, 0.45);
		opacity: 0.85;
		z-index: 0;
	}
	.card-image.ai .card-img-icon {
		color: rgba(107, 78, 181, 0.45);
	}
	.card-tag {
		position: absolute;
		top: 10px;
		right: 10px;
		font-size: 10px;
		font-weight: 800;
		padding: 4px 10px;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.94);
		color: var(--rp-accent-deep);
		backdrop-filter: blur(8px);
		z-index: 2;
		box-shadow: 0 2px 12px rgba(18, 24, 22, 0.08);
	}
	.card-tag.tag-ai {
		color: #5b4a9e;
	}

	.card-body {
		padding: 14px 16px;
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.card-title {
		font-family: var(--font-display);
		font-size: 14px;
		font-weight: 700;
		color: var(--rp-ink);
		margin: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.card-subtitle {
		font-size: 11.5px;
		color: #8b9490;
		margin: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.serving-badge {
		display: inline-block;
		font-size: 10px;
		background: rgba(42, 157, 98, 0.1);
		color: var(--rp-accent-deep);
		padding: 3px 10px;
		border-radius: 999px;
		font-weight: 700;
		width: fit-content;
		border: 1px solid rgba(42, 157, 98, 0.15);
	}

	/* Macro row - 4 cell grid */
	.macro-row {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 6px;
	}
	.macro-cell {
		background: var(--rp-warm);
		border-radius: 10px;
		padding: 7px 4px;
		text-align: center;
		border: 1px solid rgba(226, 232, 228, 0.8);
	}
	.cal-cell {
		background: linear-gradient(180deg, #fff8f0 0%, #fff3e6 100%);
		border-color: rgba(234, 179, 120, 0.25);
	}
	.macro-val {
		font-size: 12px;
		font-weight: 800;
		line-height: 1.2;
		font-variant-numeric: tabular-nums;
	}
	.macro-lbl {
		font-size: 9px;
		color: #8b9490;
		margin-bottom: 2px;
		font-weight: 600;
	}

	.card-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.meta-chip {
		font-size: 10px;
		background: var(--rp-warm);
		color: var(--rp-muted);
		padding: 3px 8px;
		border-radius: 8px;
		font-weight: 600;
		border: 1px solid var(--rp-line);
	}
	.meta-ai {
		background: #f3f0ff;
		color: #5b4a9e;
		border-color: #e4dcff;
	}

	.card-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 6px;
		padding: 10px 14px;
		border-top: 1px solid var(--rp-line);
		background: linear-gradient(0deg, var(--rp-warm) 0%, var(--rp-surface) 100%);
	}
	.btn-view {
		background: none;
		border: 1.5px solid var(--rp-accent);
		font-size: 11.5px;
		color: var(--rp-accent);
		cursor: pointer;
		font-weight: 700;
		font-family: 'Tajawal', sans-serif;
		padding: 6px 14px;
		border-radius: 10px;
		transition:
			background 0.2s ease,
			color 0.2s ease;
		display: inline-flex;
		align-items: center;
		gap: 5px;
	}
	.btn-view:hover {
		background: rgba(42, 157, 98, 0.08);
	}
	.btn-view:focus-visible {
		outline: 2px solid var(--rp-accent);
		outline-offset: 2px;
	}
	.footer-actions {
		display: flex;
		gap: 6px;
	}
	.btn-icon {
		background: var(--rp-surface);
		border: 1px solid var(--rp-line);
		width: 32px;
		height: 32px;
		border-radius: 10px;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		color: #94a3b0;
		transition:
			color 0.15s ease,
			background 0.15s ease,
			border-color 0.15s ease;
	}
	.btn-icon:hover {
		color: #2563eb;
		background: #eff6ff;
		border-color: #bfdbfe;
	}
	.btn-icon:focus-visible {
		outline: 2px solid var(--rp-accent);
		outline-offset: 2px;
	}
	.btn-icon-danger:hover {
		color: #dc2626;
		background: #fff1f2;
		border-color: #fecaca;
	}
	.delete-recipe-form {
		display: inline-flex;
		margin: 0;
		padding: 0;
		border: none;
		background: none;
	}

	/* Empty */
	.empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		padding: 72px 28px;
		border: 1px dashed var(--rp-line);
		border-radius: 20px;
		background: linear-gradient(180deg, var(--rp-surface) 0%, var(--rp-warm) 100%);
	}
	.empty-icon {
		width: 76px;
		height: 76px;
		background: linear-gradient(145deg, #e6f4eb, #d4eedf);
		border-radius: 22px;
		display: flex;
		align-items: center;
		justify-content: center;
		margin-bottom: 22px;
		box-shadow: 0 8px 28px rgba(42, 157, 98, 0.12);
	}
	.empty h3 {
		font-family: var(--font-display);
		font-size: 1.15rem;
		font-weight: 700;
		color: var(--rp-ink);
		margin: 0 0 8px;
	}
	.empty p {
		font-size: 14px;
		color: var(--rp-muted);
		margin: 0 0 20px;
		max-width: 320px;
		line-height: 1.55;
	}
	/* Error */
	.alert-error {
		background: linear-gradient(90deg, #fef2f2 0%, #fff5f5 100%);
		border: 1px solid #fecaca;
		color: #b91c1c;
		padding: 14px 18px;
		border-radius: 14px;
		margin-bottom: 18px;
		font-size: 13.5px;
		border-inline-start: 4px solid #ef4444;
	}

	/* Modal */
	.overlay {
		position: fixed;
		inset: 0;
		background: rgba(15, 23, 42, 0.55);
		display: flex;
		align-items: center;
		justify-content: center;
		/* Above dietitian bottom-nav (z-index 400); below account drawer (449+) */
		z-index: 430;
		padding: 20px;
		box-sizing: border-box;
		animation: overlay-in 0.28s ease both;
	}
	@keyframes overlay-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}
	.modal {
		background: #ffffff;
		background-color: #ffffff;
		border-radius: 20px;
		box-shadow: 0 24px 80px rgba(18, 24, 22, 0.22);
		width: 100%;
		max-width: 520px;
		font-family: 'Tajawal', sans-serif;
		max-height: 90vh;
		overflow-y: auto;
		border: 1px solid var(--rp-line);
		animation: modal-pop 0.38s cubic-bezier(0.22, 1, 0.36, 1) both;
		position: relative;
		z-index: 1;
		isolation: isolate;
		-webkit-backface-visibility: hidden;
		backface-visibility: hidden;
	}
	@keyframes modal-pop {
		from {
			opacity: 0;
			transform: scale(0.94) translateY(12px);
		}
		to {
			opacity: 1;
			transform: scale(1) translateY(0);
		}
	}
	.modal-ai {
		max-width: 520px;
		width: 100%;
		overflow: visible;
		max-height: none;
	}
	/* RTL row: labels and grid follow RTL; numeric glyphs stay LTR and align to the inner end */
	.modal-ai .field-row-ai-numeric {
		direction: rtl;
	}
	.modal-ai .field-row-ai-numeric .field {
		text-align: start;
	}
	.modal-ai .macro-inputs-ai {
		direction: rtl;
	}
	.modal-ai .macro-inputs-ai .macro-input-cell {
		text-align: start;
	}
	/* No inner card scroll; no number spinners (feels like “scroll” on trackpads) */
	.modal-ai input[type='number'],
	.modal-ai .input-ai-number {
		-moz-appearance: textfield;
		direction: ltr;
		text-align: end;
		unicode-bidi: isolate;
	}
	.modal-ai input[type='number']::-webkit-outer-spin-button,
	.modal-ai input[type='number']::-webkit-inner-spin-button {
		-webkit-appearance: none;
		margin: 0;
	}
	.modal-lg {
		max-width: 600px;
	}
	/* Create / edit recipe: one scrollbar on the card (no nested body scroll) */
	.modal-recipe-form {
		max-width: 626px;
		width: 100%;
		max-height: min(94vh, 960px);
		display: flex;
		flex-direction: column;
		overflow-x: hidden;
		overflow-y: auto;
		overscroll-behavior: contain;
		-webkit-overflow-scrolling: touch;
	}
	.modal-recipe-form > form {
		flex: none;
		display: flex;
		flex-direction: column;
		min-height: 0;
	}
	.modal-recipe-form .modal-body {
		flex: none;
		overflow: visible;
		padding: 20px 24px;
		gap: 20px;
	}
	.modal-recipe-form .modal-footer {
		flex-shrink: 0;
		padding: 16px 24px 20px;
		box-shadow: 0 -8px 28px rgba(15, 23, 42, 0.07);
		border-top: 1px solid #e8ecf1;
		gap: 12px;
	}
	.modal-recipe-form .modal-footer .btn {
		flex: 1;
		justify-content: center;
		min-height: 46px;
		font-weight: 700;
	}
	.modal-recipe-form .modal-footer .btn-primary {
		color: #ffffff !important;
		-webkit-text-fill-color: #ffffff;
		background: linear-gradient(165deg, #34b16f 0%, #2a9d62 50%, #238552 100%) !important;
		border: 1px solid #147a41 !important;
		box-shadow: 0 4px 16px rgba(42, 157, 98, 0.3);
	}
	.modal-recipe-form .modal-footer .btn-primary:disabled {
		opacity: 0.65;
	}
	.modal-recipe-form .modal-footer .btn-ghost {
		color: #475569 !important;
		background: #ffffff !important;
		border: 1.5px solid #e2e8f0 !important;
	}
	.modal-header-text {
		flex: 1;
		min-width: 0;
	}
	.modal-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		padding: 22px 24px 16px;
		gap: 12px;
		background: #ffffff;
		background-color: #ffffff;
		border-bottom: 1px solid #f0f2f5;
		flex-shrink: 0;
	}
	.modal-header h2 {
		font-family: var(--font-display);
		font-size: 1.15rem;
		font-weight: 700;
		color: var(--rp-ink);
		margin: 0;
	}
	.modal-subtitle {
		font-size: 12.5px;
		color: var(--rp-muted);
		margin: 4px 0 0;
		line-height: 1.45;
	}
	.modal-close {
		background: var(--rp-warm);
		border: 1px solid var(--rp-line);
		border-radius: 11px;
		width: 36px;
		height: 36px;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		color: var(--rp-muted);
		transition:
			background 0.15s ease,
			color 0.15s ease;
		flex-shrink: 0;
	}
	.modal-close:hover {
		background: #e8ece9;
		color: var(--rp-ink);
	}
	.modal-close:focus-visible {
		outline: 2px solid var(--rp-accent);
		outline-offset: 2px;
	}
	.modal-body {
		padding: 18px 24px;
		display: flex;
		flex-direction: column;
		gap: 14px;
		background: #ffffff;
		background-color: #ffffff;
	}
	.modal-footer {
		padding: 14px 24px 22px;
		display: flex;
		gap: 10px;
		border-top: 1px solid #f1f5f9;
		background: #ffffff;
		background-color: #ffffff;
	}
	.modal:not(.modal-recipe-form) .modal-footer .btn {
		flex: 1;
		justify-content: center;
	}

	/* Form */
	.field {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.field-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
	}
	.field label {
		font-size: 12px;
		font-weight: 600;
		color: #475569;
	}
	.field .field-group-heading {
		font-size: 12px;
		font-weight: 600;
		color: #475569;
	}
	.required {
		color: #ef4444;
	}
	.optional-label {
		font-size: 10px;
		color: #94a3b8;
		font-weight: 400;
	}
	/*
	 * @tailwindcss/forms zeroes default borders — use explicit borders + appearance reset
	 * so text/number fields match and stay visible on white modal surfaces.
	 */
	.input {
		width: 100%;
		max-width: 100%;
		min-height: 46px;
		display: block;
		appearance: none;
		-webkit-appearance: none;
		border: 1.5px solid #cbd5e1;
		border-radius: 12px;
		padding: 11px 14px;
		font-size: 14px;
		font-family: 'Tajawal', sans-serif;
		outline: none;
		box-sizing: border-box;
		transition:
			border-color 0.2s ease,
			box-shadow 0.2s ease,
			background 0.15s ease;
		color: #0f172a;
		background: #ffffff;
		box-shadow: inset 0 1px 2px rgba(15, 23, 42, 0.04);
	}
	.input::placeholder {
		color: #94a3b8;
		opacity: 1;
	}
	.input:hover {
		border-color: #94a3b8;
		background: #fafafa;
	}
	.input:focus {
		border-color: var(--rp-accent);
		box-shadow:
			inset 0 1px 2px rgba(15, 23, 42, 0.04),
			0 0 0 4px rgba(42, 157, 98, 0.14);
		background: #ffffff;
	}
	.input-sm {
		padding: 8px 10px;
		font-size: 13px;
		min-height: 40px;
	}
	textarea.input {
		resize: vertical;
		min-height: 100px;
		line-height: 1.6;
		padding-top: 12px;
		padding-bottom: 12px;
	}
	/* Create/edit modals: @tailwindcss/forms strips borders — force visible fields + stable RTL grid */
	.recipe-page-modal .field-row {
		direction: rtl;
		align-items: flex-start;
	}
	.recipe-page-modal .field-row > .field {
		min-width: 0;
	}
	.recipe-page-modal .field.field-portions {
		direction: rtl;
		align-items: stretch;
		max-width: 100%;
	}
	.recipe-page-modal input.input.input-portions {
		width: auto !important;
		max-width: 120px;
		min-width: 88px;
		align-self: flex-start;
		text-align: center;
		direction: ltr;
		unicode-bidi: isolate;
		overflow-x: hidden;
		-moz-appearance: textfield;
	}
	.recipe-page-modal input.input.input-portions::-webkit-outer-spin-button,
	.recipe-page-modal input.input.input-portions::-webkit-inner-spin-button {
		-webkit-appearance: none;
		margin: 0;
	}
	.recipe-page-modal input.input,
	.recipe-page-modal textarea.input {
		width: 100% !important;
		border-width: 1.5px !important;
		border-style: solid !important;
		border-color: #cbd5e1 !important;
		background-color: #ffffff !important;
		box-shadow: inset 0 1px 2px rgba(15, 23, 42, 0.05) !important;
	}
	.recipe-page-modal input.input:hover,
	.recipe-page-modal textarea.input:hover {
		border-color: #94a3b8 !important;
		background-color: #fafafa !important;
	}
	.recipe-page-modal input.input:focus,
	.recipe-page-modal textarea.input:focus {
		border-color: var(--rp-accent) !important;
		background-color: #ffffff !important;
		box-shadow:
			inset 0 1px 2px rgba(15, 23, 42, 0.05),
			0 0 0 4px rgba(42, 157, 98, 0.14) !important;
		outline: none !important;
	}
	.section-label {
		font-size: 11px;
		font-weight: 700;
		color: #94a3b8;
		text-transform: uppercase;
		letter-spacing: 0.6px;
		padding-bottom: 6px;
		border-bottom: 1px solid #f1f5f9;
	}
	.recipe-photo-block {
		margin: 0;
	}
	.recipe-photo-row {
		display: flex;
		align-items: center;
		gap: 16px;
	}
	.recipe-photo-thumb {
		width: 80px;
		height: 80px;
		flex-shrink: 0;
		border-radius: 12px;
		border: 2px dashed #d1d5db;
		background: #f9fafb;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0;
		overflow: hidden;
		transition:
			border-color 0.15s ease,
			background 0.15s ease;
	}
	.recipe-photo-thumb:hover {
		border-color: #3cb96b;
		background: #edf9f2;
	}
	.recipe-photo-thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		border-radius: 10px;
	}
	.recipe-photo-meta {
		flex: 1;
		min-width: 0;
	}
	.recipe-photo-heading {
		font-size: 12px;
		font-weight: 600;
		color: #059669;
		margin: 0 0 2px;
	}
	.recipe-photo-hint-line {
		font-size: 11px;
		color: #9ca3af;
		margin: 0 0 10px;
		line-height: 1.45;
	}
	.recipe-photo-actions {
		display: flex;
		align-items: center;
		gap: 14px;
		flex-wrap: wrap;
	}
	.recipe-photo-upload-link {
		font-size: 12px;
		color: #059669;
		background: none;
		border: none;
		cursor: pointer;
		padding: 0;
		text-decoration: underline;
		text-underline-offset: 2px;
		font-family: 'Tajawal', sans-serif;
		font-weight: 600;
	}
	.recipe-photo-upload-link:hover {
		color: #047857;
	}
	.recipe-photo-clear {
		font-size: 12px;
		color: #ef4444;
		background: none;
		border: none;
		cursor: pointer;
		padding: 0;
		font-family: 'Tajawal', sans-serif;
		text-decoration: underline;
		text-underline-offset: 2px;
		font-weight: 600;
	}
	.hidden-file-input {
		position: absolute;
		width: 0;
		height: 0;
		opacity: 0;
		pointer-events: none;
	}
	.view-recipe-hero {
		margin: -4px 0 12px;
		border-radius: 12px;
		overflow: hidden;
		border: 1px solid #e2e8f0;
		max-height: 220px;
	}
	.view-recipe-hero img {
		width: 100%;
		height: 200px;
		object-fit: cover;
		display: block;
	}
	/* Ingredient search */
	.ing-search-wrap {
		display: flex;
		align-items: center;
		gap: 8px;
		border: 1.5px solid #e2e8f0;
		border-radius: 10px;
		padding: 9px 13px;
		background: #fff;
		transition: border-color 0.15s;
	}
	.ing-search-wrap:focus-within {
		border-color: #3cb96b;
		box-shadow: 0 0 0 3px rgba(60, 185, 107, 0.1);
	}
	/* Inner field: no border/ring — @tailwindcss/forms adds a blue focus box-shadow on bare inputs */
	.ing-search-input {
		flex: 1;
		min-width: 0;
		border: none !important;
		outline: none !important;
		box-shadow: none !important;
		appearance: none;
		-webkit-appearance: none;
		font-size: 13.5px;
		font-family: 'Tajawal', sans-serif;
		color: #0f172a;
		background: transparent;
	}
	.ing-search-input:focus,
	.ing-search-input:focus-visible {
		outline: none !important;
		border: none !important;
		box-shadow: none !important;
	}
	.ing-dropdown {
		position: absolute;
		top: calc(100% + 4px);
		right: 0;
		left: 0;
		background: #fff;
		border: 1.5px solid #e2e8f0;
		border-radius: 10px;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
		z-index: 50;
		overflow: hidden;
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
		transition: background 0.12s;
		text-align: right;
	}
	.ing-dropdown-row:hover {
		background: #f0fdf4;
	}
	.ing-dropdown-name {
		font-size: 13px;
		font-weight: 500;
		color: #1e293b;
	}
	.ing-dropdown-cal {
		font-size: 11px;
		color: #94a3b8;
	}
	.ing-list {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.ing-row {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 12px 12px 11px;
		border-radius: 10px;
		background: #f8fafc;
		border: 1px solid #e2e8f0;
		font-size: 12px;
	}
	.ing-row-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 10px;
		min-width: 0;
	}
	.ing-row-meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 10px 12px;
	}
	.ing-name {
		flex: 1;
		min-width: 0;
		font-weight: 600;
		color: #1e293b;
		font-size: 13px;
		line-height: 1.35;
		overflow-wrap: anywhere;
		word-break: break-word;
	}
	.ing-qty-wrap {
		display: flex;
		align-items: center;
		gap: 6px;
		flex-shrink: 0;
	}
	.ing-qty-input {
		width: 72px;
		max-width: 72px;
		min-width: 0;
		border: 1px solid #e2e8f0;
		border-radius: 8px;
		padding: 6px 4px;
		font-size: 13px;
		font-variant-numeric: tabular-nums;
		font-family: ui-sans-serif, system-ui, sans-serif;
		text-align: center;
		outline: none;
		overflow: hidden;
		box-sizing: border-box;
	}
	.ing-qty-input:focus {
		border-color: #3cb96b;
		box-shadow: 0 0 0 2px rgba(60, 185, 107, 0.12);
	}
	.recipe-page-modal .ing-qty-input {
		-moz-appearance: textfield;
	}
	.recipe-page-modal .ing-qty-input::-webkit-outer-spin-button,
	.recipe-page-modal .ing-qty-input::-webkit-inner-spin-button {
		-webkit-appearance: none;
		margin: 0;
	}
	.ing-unit {
		font-size: 12px;
		color: #64748b;
		font-weight: 600;
		white-space: nowrap;
	}
	.ing-macros {
		display: flex;
		flex-wrap: wrap;
		gap: 8px 10px;
		align-items: stretch;
		justify-content: flex-end;
		flex: 1;
		min-width: 0;
	}
	.ing-macro-pill {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 3px;
		font-size: 12px;
		font-weight: 700;
		padding: 6px 11px;
		border-radius: 12px;
		background: #ffffff;
		border: 1px solid #e2e8f0;
		line-height: 1.25;
		font-variant-numeric: tabular-nums;
		font-family: 'Tajawal', sans-serif;
	}
	.ing-macro-pill-stack {
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 3px;
		padding: 8px 10px;
		min-width: 4.75rem;
		max-width: 7.5rem;
		text-align: center;
		white-space: normal;
	}
	.ing-macro-pill-val {
		font-size: 15px;
		font-weight: 800;
		line-height: 1.15;
		letter-spacing: -0.02em;
		font-variant-numeric: tabular-nums;
	}
	.ing-macro-pill-unit {
		font-size: 12px;
		font-weight: 700;
	}
	.ing-macro-pill-lbl {
		font-size: 11.5px;
		font-weight: 600;
		line-height: 1.3;
		max-width: 100%;
	}
	.ing-macro-cal {
		color: #c2410c;
		border-color: #fed7aa;
		background: #fff7ed;
	}
	.ing-macro-prot {
		color: #1d4ed8;
		border-color: #bfdbfe;
		background: #eff6ff;
	}
	.ing-macro-carb {
		color: #15803d;
		border-color: #bbf7d0;
		background: #f0fdf4;
	}
	.ing-macro-fat {
		color: #b91c1c;
		border-color: #fecaca;
		background: #fef2f2;
	}
	.ing-remove {
		background: none;
		border: none;
		cursor: pointer;
		color: #cbd5e1;
		padding: 4px;
		display: flex;
		align-items: center;
		transition: color 0.12s;
		flex-shrink: 0;
		border-radius: 6px;
	}
	.ing-remove:hover {
		color: #ef4444;
		background: #fef2f2;
	}
	.ing-totals {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: 10px;
		padding: 12px 12px;
		border-radius: 10px;
		background: #f0fdf4;
		border: 1px solid #bbf7d0;
		margin-top: 2px;
	}
	.ing-totals-title {
		font-size: 13px;
		font-weight: 800;
		color: #14532d;
	}
	.ing-totals-pills {
		display: flex;
		flex-wrap: wrap;
		gap: 10px 12px;
		align-items: stretch;
	}
	.ing-empty {
		text-align: center;
		padding: 14px;
		font-size: 12.5px;
		color: #94a3b8;
		background: #f8fafc;
		border-radius: 8px;
		border: 1.5px dashed #e2e8f0;
	}

	/* Macro presets */
	.preset-tabs {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
	}
	.preset-tab {
		padding: 6px 12px;
		border-radius: 8px;
		font-size: 12px;
		font-weight: 600;
		cursor: pointer;
		border: 1.5px solid #e2e8f0;
		background: #fff;
		color: #64748b;
		font-family: 'Tajawal', sans-serif;
		transition: all 0.15s;
	}
	.preset-tab:hover {
		border-color: #cbd5e1;
		color: #334155;
	}
	.preset-tab.active {
		border-color: #7c5cbf;
		background: #f5f3ff;
		color: #7c5cbf;
	}
	.macro-inputs {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 8px;
		margin-top: 8px;
	}
	.macro-input-cell {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.macro-input-cell label {
		font-size: 10px;
		color: #64748b;
		font-weight: 500;
	}
	.macro-preview {
		display: flex;
		gap: 12px;
		margin-top: 6px;
		font-size: 12px;
		color: #64748b;
	}
	.macro-preview span {
		background: #f8fafc;
		padding: 4px 10px;
		border-radius: 6px;
	}

	/* View modal sections */
	.view-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.section-title {
		font-size: 13px;
		font-weight: 700;
		color: #334155;
		margin-bottom: 8px;
	}
	.nutrients-card {
		background: #f8fafc;
		border: 1px solid #e2e8f0;
		border-radius: 12px;
		padding: 14px;
	}
	.nutrients-title {
		font-size: 12px;
		font-weight: 700;
		color: #475569;
		margin-bottom: 10px;
	}
	/* 4 macros by default; 5 when fiber row exists */
	.nutrients-grid {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 8px;
		text-align: center;
	}
	.nutrients-grid:has(> .nutrient-item:nth-child(5)) {
		grid-template-columns: repeat(5, minmax(0, 1fr));
	}
	.nutrients-grid-sm {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 6px 8px;
		font-size: 11px;
		color: #64748b;
	}
	.nutrients-grid-sm span {
		font-weight: 700;
	}
	.nutrient-item {
		background: #fff;
		border-radius: 8px;
		padding: 8px 4px;
		min-width: 0;
	}
	.nutrient-val {
		font-size: 16px;
		font-weight: 800;
		line-height: 1.2;
	}
	.nutrient-lbl {
		font-size: 10px;
		color: #94a3b8;
		margin-top: 2px;
	}
	.nutrients-per-serving {
		margin-top: 10px;
		padding-top: 10px;
		border-top: 1px solid #e2e8f0;
	}
	.nutrients-per-title {
		font-size: 11px;
		color: #64748b;
		margin-bottom: 6px;
	}
	.ingredients-list {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.ingredient-row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 10px 12px;
		align-items: center;
		padding: 10px 12px;
		background: #f8fafc;
		border-radius: 8px;
		font-size: 13px;
	}
	.ingredient-name {
		font-weight: 500;
		color: #1a1d23;
		min-width: 0;
		word-break: break-word;
		line-height: 1.45;
	}
	.ingredient-qty {
		font-size: 12px;
		color: #64748b;
		white-space: nowrap;
		flex-shrink: 0;
	}
	.steps-box {
		font-size: 13px;
		color: #475569;
		line-height: 1.7;
		white-space: pre-wrap;
		word-break: break-word;
		background: #f8fafc;
		border-radius: 10px;
		padding: 14px;
	}

	/* AI icon */
	.ai-icon-wrap {
		width: 40px;
		height: 40px;
		background: linear-gradient(135deg, #f5f3ff, #ede9fe);
		border-radius: 12px;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	/* Spinner */
	.spinner {
		width: 14px;
		height: 14px;
		border: 2px solid rgba(255, 255, 255, 0.3);
		border-top-color: #fff;
		border-radius: 50%;
		animation: spin 0.6s linear infinite;
		flex-shrink: 0;
		display: inline-block;
	}
	.spinner-dark {
		border-color: rgba(100, 116, 139, 0.25);
		border-top-color: #64748b;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	/* —— Mobile & narrow tablets —— */
	@media (max-width: 720px) {
		.page {
			padding: 14px max(10px, env(safe-area-inset-right, 0px)) 28px
				max(10px, env(safe-area-inset-left, 0px));
			max-width: 100%;
		}
		.header {
			flex-direction: column;
			align-items: stretch;
			margin-bottom: 18px;
			gap: 14px;
		}
		.header-copy {
			max-width: none;
		}
		.header-actions {
			flex-direction: column;
			width: 100%;
			gap: 10px;
		}
		.header-actions .btn {
			width: 100%;
			justify-content: center;
			min-height: 46px;
			white-space: normal;
			text-align: center;
			line-height: 1.35;
		}
		.toolbar {
			flex-direction: column;
			align-items: stretch;
			gap: 12px;
			padding: 12px;
			margin-bottom: 18px;
		}
		.tabs {
			display: flex;
			flex-wrap: nowrap;
			overflow-x: auto;
			-webkit-overflow-scrolling: touch;
			scrollbar-width: thin;
			gap: 4px;
			padding: 6px;
		}
		.tab {
			flex: 0 0 auto;
			padding: 10px 14px;
		}
		.search-wrapper {
			width: 100%;
			max-width: none;
		}
		.grid {
			grid-template-columns: minmax(0, 1fr);
			gap: 14px;
		}
		.card:hover {
			transform: none;
		}
		.card-title {
			white-space: normal;
			display: -webkit-box;
			-webkit-box-orient: vertical;
			-webkit-line-clamp: 2;
			line-clamp: 2;
			overflow: hidden;
		}
		.card-subtitle {
			white-space: normal;
			display: -webkit-box;
			-webkit-box-orient: vertical;
			-webkit-line-clamp: 2;
			line-clamp: 2;
		}
		.macro-row {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: 8px;
		}
		.overlay {
			padding: max(12px, env(safe-area-inset-top, 0px)) max(14px, env(safe-area-inset-right, 0px))
				max(14px, env(safe-area-inset-bottom, 0px)) max(14px, env(safe-area-inset-left, 0px));
			align-items: center;
			justify-content: center;
		}
		.modal {
			width: min(100%, 540px);
			max-width: calc(100vw - 28px);
			align-self: center;
			margin: 0;
			max-height: min(92dvh, calc(100dvh - 32px));
			border-radius: 18px;
			overflow-y: auto;
			-webkit-overflow-scrolling: touch;
		}
		.modal-ai {
			max-width: min(520px, calc(100vw - 28px));
			max-height: min(88dvh, calc(100dvh - 36px));
			overflow-y: auto;
			overflow-x: hidden;
			-webkit-overflow-scrolling: touch;
		}
		.modal-recipe-form {
			width: min(100%, 626px);
			max-width: calc(100vw - 28px);
			align-self: center;
			max-height: min(92dvh, calc(100dvh - 32px));
			border-radius: 18px;
		}
		.modal-header,
		.modal-body,
		.modal-footer,
		.modal-recipe-form .modal-body,
		.modal-recipe-form .modal-footer {
			padding-inline: 16px;
		}
		.modal-view-recipe .modal-body {
			padding-bottom: max(28px, calc(env(safe-area-inset-bottom, 0px) + 20px));
		}
		.modal-header h2 {
			white-space: normal;
			overflow-wrap: anywhere;
			word-break: break-word;
		}
		.field-row {
			grid-template-columns: 1fr;
		}
		/* Balanced 2×2 + full-width fiber row; beats desktop :has(5-col) via equal specificity + source order */
		.nutrients-grid,
		.nutrients-grid:has(> .nutrient-item:nth-child(5)) {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: 8px;
		}
		.nutrients-grid:has(> .nutrient-item:nth-child(5)) > .nutrient-item:nth-child(5) {
			grid-column: 1 / -1;
		}
		.nutrients-grid-sm {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.recipe-photo-row {
			flex-direction: column;
			align-items: stretch;
		}
		.recipe-photo-thumb {
			align-self: center;
		}
		.macro-inputs {
			grid-template-columns: 1fr;
		}
		.ing-row-meta {
			flex-direction: column;
			align-items: stretch;
		}
		.ing-macros {
			justify-content: flex-start;
		}
	}
</style>
