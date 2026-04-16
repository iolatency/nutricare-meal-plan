<script lang="ts">
	import type { PageData } from './$types';
	import type { RecipeGroup, PatientRecipe } from './+page.server';
	import { formatArDayMonth } from '$lib/date/ar-format';

	let { data }: { data: PageData } = $props();

	let expandedRecipeIds = $state<Set<number>>(new Set());

	function toggleRecipe(id: number) {
		const next = new Set(expandedRecipeIds);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		expandedRecipeIds = next;
	}

	function formatDate(iso: string): string {
		return formatArDayMonth(iso);
	}

	function statusLabel(s: RecipeGroup['sessionStatus']): string {
		if (s === 'active') return 'نشطة';
		if (s === 'completed') return 'مكتملة';
		return 'مسودة';
	}

	function phaseLabel(phase: RecipeGroup['phase']): string {
		if (phase === 'current') return 'الجلسة الحالية';
		if (phase === 'upcoming') return 'الجلسة القادمة';
		return 'جلسة سابقة';
	}

	function phaseAccent(phase: RecipeGroup['phase']): string {
		if (phase === 'current') return '#2a9d62';
		if (phase === 'upcoming') return '#6b9ff5';
		return '#b0b8b4';
	}

	const totalRecipes = $derived(data.groups.reduce((sum, g) => sum + g.recipes.length, 0));
</script>

<svelte:head>
	<title>الوصفات — نيوتريكير</title>
	<link
		href="https://fonts.googleapis.com/css2?family=El+Messiri:wght@500;600;700&family=Tajawal:wght@400;500;600;700;800&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

<div class="page" dir="rtl">
	<div class="page-header">
		<h1 class="page-title">وصفاتي الغذائية</h1>
		<p class="page-subtitle">
			{totalRecipes > 0
				? `${totalRecipes} وصفة — مرتبة حسب الجلسة`
				: 'لا توجد وصفات في خططك الغذائية'}
		</p>
	</div>

	{#if totalRecipes === 0}
		<div class="empty-state">
			<div class="empty-icon">🍽️</div>
			<p class="empty-title">لا توجد وصفات بعد</p>
			<p class="empty-hint">ستظهر هنا الوصفات التي يضيفها أخصائي التغذية لخطتك.</p>
		</div>
	{:else}
		<div class="groups-list">
			{#each data.groups as group (group.sessionId)}
				<div class="group">
					<!-- Group header -->
					<div class="group-header" style="--phase-color: {phaseAccent(group.phase)}">
						<div class="group-dot" style="background: {phaseAccent(group.phase)}"></div>
						<div class="group-meta">
							<span class="group-phase-label">{phaseLabel(group.phase)}</span>
							<span class="group-dates">{formatDate(group.sessionStartDate)} — {formatDate(group.sessionEndDate)}</span>
						</div>
						<span class="group-status status-{group.sessionStatus}">{statusLabel(group.sessionStatus)}</span>
						<span class="group-count">{group.recipes.length}</span>
					</div>

					<!-- Recipe cards for this group -->
					<div class="recipes-grid">
						{#each group.recipes as recipe (recipe.id)}
							<div class="recipe-card" class:expanded={expandedRecipeIds.has(recipe.id)}>
								<button
									type="button"
									class="recipe-header"
									onclick={() => toggleRecipe(recipe.id)}
									aria-expanded={expandedRecipeIds.has(recipe.id)}
								>
									<div class="recipe-title-row">
										<span class="recipe-name">{recipe.name}</span>
										<svg
											class="chevron-icon"
											class:rotated={expandedRecipeIds.has(recipe.id)}
											width="16" height="16"
											fill="none" stroke="currentColor" viewBox="0 0 24 24"
										>
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
										</svg>
									</div>

									<!-- Macro pills -->
									<div class="macro-pills">
										{#if recipe.calories > 0}
											<span class="pill pill-cal">
												🔥 {Math.round(recipe.calories)} سعرة
											</span>
										{/if}
										{#if recipe.protein > 0}
											<span class="pill pill-prot">{Math.round(recipe.protein)}ب</span>
										{/if}
										{#if recipe.carbs > 0}
											<span class="pill pill-carb">{Math.round(recipe.carbs)}ك</span>
										{/if}
										{#if recipe.fat > 0}
											<span class="pill pill-fat">{Math.round(recipe.fat)}د</span>
										{/if}
									</div>

									{#if recipe.lastUsedDate}
										<p class="recipe-last-used">آخر استخدام: {formatDate(recipe.lastUsedDate)}</p>
									{/if}
								</button>

								{#if expandedRecipeIds.has(recipe.id)}
									<div class="recipe-body">
										{#if recipe.ingredients.length > 0}
											<div class="ingredients-section">
												<p class="ingredients-label">المكونات</p>
												<ul class="ingredients-list">
													{#each recipe.ingredients as ing (ing.id)}
														<li class="ingredient-item">
															<span class="ing-name">
																{ing.foodName ?? ing.customText ?? '—'}
															</span>
															<span class="ing-qty">{ing.quantity} {ing.unit}</span>
														</li>
													{/each}
												</ul>
											</div>
										{/if}

										{#if recipe.steps}
											<div class="steps-section">
												<p class="steps-label">طريقة التحضير</p>
												<p class="steps-text">{recipe.steps}</p>
											</div>
										{/if}
									</div>
								{/if}
							</div>
						{/each}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.page {
		--fp-ink: #121816;
		--fp-muted: #5c6560;
		--fp-line: #e2e8e4;
		--fp-surface: #ffffff;
		--fp-accent: #2a9d62;
		--fp-bg: #f3f5f2;
		--fp-warm: #faf9f6;
		--font-display: 'El Messiri', 'Tajawal', serif;

		max-width: 720px;
		margin: 0 auto;
		padding: 32px 20px 60px;
		font-family: 'Tajawal', sans-serif;
		animation: page-in 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
	}
	@keyframes page-in {
		from { opacity: 0; transform: translateY(10px); }
		to { opacity: 1; transform: translateY(0); }
	}
	.page-header { margin-bottom: 28px; }
	.page-title {
		font-family: var(--font-display);
		font-size: clamp(1.5rem, 4vw, 1.9rem);
		font-weight: 700;
		color: var(--fp-ink);
		margin: 0 0 6px;
	}
	.page-subtitle { margin: 0; font-size: 13.5px; color: var(--fp-muted); }

	.empty-state { text-align: center; padding: 60px 20px; }
	.empty-icon { font-size: 3rem; margin-bottom: 12px; }
	.empty-title { font-size: 16px; font-weight: 700; color: var(--fp-ink); margin: 0 0 8px; }
	.empty-hint { font-size: 13.5px; color: var(--fp-muted); margin: 0; }

	/* ─── GROUPS ─── */
	.groups-list { display: flex; flex-direction: column; gap: 28px; }

	.group { }

	.group-header {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-bottom: 12px;
		padding: 10px 14px;
		background: var(--fp-surface);
		border: 1px solid var(--fp-line);
		border-inline-start: 3px solid var(--phase-color, #b0b8b4);
		border-radius: 10px;
	}
	.group-dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		flex-shrink: 0;
	}
	.group-meta { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
	.group-phase-label { font-size: 12px; font-weight: 700; color: var(--fp-ink); }
	.group-dates { font-size: 11.5px; color: var(--fp-muted); }
	.group-status {
		font-size: 10.5px;
		font-weight: 700;
		padding: 2px 8px;
		border-radius: 999px;
	}
	.status-active { background: rgba(42, 157, 98, 0.15); color: #2a9d62; }
	.status-completed { background: rgba(18, 24, 22, 0.08); color: var(--fp-muted); }
	.status-draft { background: rgba(107, 159, 245, 0.15); color: #4a7fd4; }
	.group-count {
		font-size: 11px;
		font-weight: 700;
		color: var(--fp-muted);
		background: var(--fp-line);
		padding: 2px 7px;
		border-radius: 999px;
	}

	/* ─── RECIPES GRID ─── */
	.recipes-grid { display: flex; flex-direction: column; gap: 8px; }

	/* ─── RECIPE CARD ─── */
	.recipe-card {
		background: var(--fp-surface);
		border: 1px solid var(--fp-line);
		border-radius: 12px;
		overflow: hidden;
		transition: box-shadow 0.2s ease;
	}
	.recipe-card:hover { box-shadow: 0 4px 18px rgba(18, 24, 22, 0.06); }
	.recipe-card.expanded { border-color: rgba(42, 157, 98, 0.3); }

	.recipe-header {
		width: 100%;
		text-align: right;
		padding: 14px 16px;
		background: transparent;
		border: none;
		cursor: pointer;
		font-family: 'Tajawal', sans-serif;
		transition: background 0.15s ease;
	}
	.recipe-header:hover { background: var(--fp-warm); }
	.recipe-header:focus-visible { outline: 2px solid var(--fp-accent); outline-offset: 2px; }

	.recipe-title-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		margin-bottom: 8px;
	}
	.recipe-name {
		font-size: 14px;
		font-weight: 700;
		color: var(--fp-ink);
		text-align: right;
	}
	.chevron-icon {
		flex-shrink: 0;
		color: var(--fp-muted);
		transition: transform 0.25s cubic-bezier(0.22, 1, 0.36, 1);
	}
	.chevron-icon.rotated { transform: rotate(-180deg); }

	.macro-pills {
		display: flex;
		flex-wrap: wrap;
		gap: 5px;
		margin-bottom: 4px;
	}
	.pill {
		font-size: 11px;
		font-weight: 600;
		padding: 2px 8px;
		border-radius: 999px;
		white-space: nowrap;
	}
	.pill-cal { background: rgba(244, 168, 38, 0.12); color: #c47c00; }
	.pill-prot { background: rgba(239, 98, 98, 0.1); color: #c0392b; }
	.pill-carb { background: rgba(59, 130, 246, 0.1); color: #2563eb; }
	.pill-fat { background: rgba(234, 179, 8, 0.12); color: #a16207; }

	.recipe-last-used {
		margin: 0;
		font-size: 11px;
		color: var(--fp-muted);
		text-align: right;
	}

	/* ─── EXPANDED BODY ─── */
	.recipe-body {
		padding: 0 16px 14px;
		border-top: 1px solid var(--fp-line);
		background: var(--fp-warm);
		animation: expand-in 0.25s ease both;
	}
	@keyframes expand-in {
		from { opacity: 0; transform: translateY(-4px); }
		to { opacity: 1; transform: translateY(0); }
	}

	.ingredients-section { margin-top: 12px; }
	.ingredients-label, .steps-label {
		font-size: 11.5px;
		font-weight: 700;
		color: var(--fp-muted);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		margin: 0 0 8px;
	}
	.ingredients-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 5px;
	}
	.ingredient-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 12.5px;
		padding: 5px 0;
		border-bottom: 1px dashed rgba(228, 233, 228, 0.8);
	}
	.ingredient-item:last-child { border-bottom: none; }
	.ing-name { color: var(--fp-ink); }
	.ing-qty { color: var(--fp-muted); font-size: 11.5px; }

	.steps-section { margin-top: 14px; }
	.steps-text {
		font-size: 12.5px;
		color: var(--fp-ink);
		line-height: 1.6;
		margin: 0;
		white-space: pre-wrap;
	}
</style>
