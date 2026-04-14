<script lang="ts">
	import type { PageData } from './$types';
	import { MEAL_TYPES, DAYS_W } from '$lib/meal-plan/constants';

	let { data }: { data: PageData } = $props();

	let waterCups = $state(0);
	let dayCompleted = $state(false);
	let showFinishModal = $state(false);
	let mealStatuses = $state<Record<number, string>>({});
	let toastError = $state('');
	let isSubmitting = $state(false);

	$effect(() => {
		waterCups = data.todayLog?.waterCups ?? 0;
		dayCompleted = data.todayLog?.completed ?? false;
		mealStatuses = Object.fromEntries(data.todayMeals.map((m) => [m.meal.id, m.status ?? '']));
	});

	/* ─── AI Generate State ─── */
	let showAiModal = $state(false);
	let aiScope = $state<'day' | 'week'>('day');
	let aiExtraNote = $state('');
	let aiGenerating = $state(false);
	let aiError = $state('');
	let aiMeals = $state<
		Array<{
			mealType: string;
			name_ar: string;
			total: { calories: number; protein: number; carbs: number; fat: number };
			ingredients: any[];
			steps: string;
		}>
	>([]);

	async function startPatientAiGenerate() {
		aiGenerating = true;
		aiError = '';
		try {
			const res = await fetch('/api/ai/meal-plan', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					sessionId: data.session.id,
					scope: aiScope,
					targetCalories: data.builderConfig?.targetCalories ?? 2000,
					macros: data.builderConfig?.macros ?? { c: 50, p: 25, f: 25 },
					excludedFoods: data.builderConfig?.excluded ?? [],
					diagnoses: data.builderConfig?.diags ?? [],
					tags: data.builderConfig?.tags ?? [],
					dietTypes: data.builderConfig?.dietTypes ?? [],
					selectedMeals: data.builderConfig?.selectedMeals ?? ['breakfast', 'lunch', 'dinner'],
					extraNote: aiExtraNote,
					dates: aiScope === 'week' ? data.weekDates : [today]
				})
			});
			const result = await res.json();
			if (result.success && result.plan?.days?.length) {
				const todayDay = result.plan.days.find((d: any) => d.date === today) ?? result.plan.days[0];
				aiMeals = todayDay.meals ?? [];
				showAiModal = false;
			} else {
				aiError = result.error || 'فشل في إنشاء الوجبات';
			}
		} catch {
			aiError = 'تعذر الاتصال بالخادم';
		} finally {
			aiGenerating = false;
		}
	}

	const today = $derived(data.today ?? new Date().toISOString().split('T')[0]);

	const totalTarget = $derived(data.builderConfig?.targetCalories ?? 0);
	const eatenCalories = $derived(
		data.todayMeals
			.filter((m) => mealStatuses[m.meal.id] === 'eaten')
			.reduce((sum, m) => sum + m.calories, 0)
	);
	const eatenProtein = $derived(
		data.todayMeals
			.filter((m) => mealStatuses[m.meal.id] === 'eaten')
			.reduce((sum, m) => sum + m.protein, 0)
	);
	const eatenCarbs = $derived(
		data.todayMeals
			.filter((m) => mealStatuses[m.meal.id] === 'eaten')
			.reduce((sum, m) => sum + m.carbs, 0)
	);
	const eatenFat = $derived(
		data.todayMeals
			.filter((m) => mealStatuses[m.meal.id] === 'eaten')
			.reduce((sum, m) => sum + m.fat, 0)
	);

	const macroTargets = $derived(() => {
		const cal = totalTarget || 0;
		const cfg = data.builderConfig?.macros;
		if (!cfg) return { carbG: 0, protG: 0, fatG: 0 };
		return {
			carbG: Math.round((cal * cfg.c) / 100 / 4),
			protG: Math.round((cal * cfg.p) / 100 / 4),
			fatG: Math.round((cal * cfg.f) / 100 / 9)
		};
	});

	const caloriesPct = $derived(
		totalTarget ? Math.min(100, Math.round((eatenCalories / totalTarget) * 100)) : 0
	);

	const totalMeals = $derived(data.todayMeals.length);
	const eatenCount = $derived(Object.values(mealStatuses).filter((s) => s === 'eaten').length);
	const adherencePct = $derived(totalMeals ? Math.round((eatenCount / totalMeals) * 100) : 0);

	const todayName = $derived(() => {
		const d = new Date(today + 'T00:00:00');
		return DAYS_W[d.getDay()];
	});

	function showToast(msg: string) {
		toastError = msg;
		setTimeout(() => (toastError = ''), 3500);
	}

	async function setMealStatus(mealId: number, status: string) {
		const prev = mealStatuses[mealId];
		mealStatuses = { ...mealStatuses, [mealId]: status };
		const body = new FormData();
		body.append('mealId', String(mealId));
		body.append('status', status);
		body.append('date', today);
		const res = await fetch('?/updateMealStatus', { method: 'POST', body });
		if (!res.ok) {
			mealStatuses = { ...mealStatuses, [mealId]: prev };
			showToast('فشل تحديث حالة الوجبة. حاول مرة أخرى.');
		}
	}

	async function updateWater(delta: number) {
		const prev = waterCups;
		waterCups = Math.max(0, waterCups + delta);
		const body = new FormData();
		body.append('cups', String(waterCups));
		body.append('date', today);
		const res = await fetch('?/updateWater', { method: 'POST', body });
		if (!res.ok) {
			waterCups = prev;
			showToast('فشل تحديث متابعة الماء. حاول مرة أخرى.');
		}
	}

	async function finishDay() {
		isSubmitting = true;
		try {
			const body = new FormData();
			body.append('date', today);
			const res = await fetch('?/finishDay', { method: 'POST', body });
			if (res.ok) {
				dayCompleted = true;
				showFinishModal = false;
			} else {
				showFinishModal = false;
				showToast('فشل إنهاء اليوم. حاول مرة أخرى.');
			}
		} finally {
			isSubmitting = false;
		}
	}

	function getMealLabel(type: string): string {
		return MEAL_TYPES.find((m) => m.id === type)?.label ?? type;
	}
</script>

<svelte:head><title>خطتي الغذائية — نيوتريكير</title></svelte:head>

<div class="pdash">
	<div class="pdash-header">
		<div class="pdash-name">مرحباً {data.patient.name}</div>
		<div class="pdash-date">{todayName()} — {today}</div>
	</div>

	<div class="pdash-body">
		<!-- Week Strip -->
		<div class="week-strip">
			{#each data.weekDates as wd}
				{@const d = new Date(wd + 'T00:00:00')}
				<div class="week-day" class:active={wd === today}>
					<div style="font-size:10px; margin-bottom:2px;">{DAYS_W[d.getDay()].slice(0, 3)}</div>
					<div style="font-size:15px; font-weight:800;">{d.getDate()}</div>
				</div>
			{/each}
		</div>

		<!-- Progress -->
		<div class="progress-card">
			<div class="progress-label">السعرات الحرارية</div>
			<div class="progress-bar">
				<div class="progress-fill" style="width:{caloriesPct}%; background:#3cb96b;"></div>
			</div>
			<div class="progress-nums">
				<span>{Math.round(eatenCalories)} مستهلك</span>
				<span>{caloriesPct}%</span>
				<span>{totalTarget} هدف</span>
			</div>

			<div class="macro-row">
				<div class="macro-box" style="background:#eef4ff; border:1px solid #c5d9fb;">
					<div class="macro-val" style="color:#4e9af1;">{Math.round(eatenCarbs)}g</div>
					<div class="macro-lbl">كارب / {macroTargets().carbG}g</div>
				</div>
				<div class="macro-box" style="background:#fff0f0; border:1px solid #fbbcbc;">
					<div class="macro-val" style="color:#ef4444;">{Math.round(eatenProtein)}g</div>
					<div class="macro-lbl">بروتين / {macroTargets().protG}g</div>
				</div>
				<div class="macro-box" style="background:#fffbeb; border:1px solid #fde68a;">
					<div class="macro-val" style="color:#f59e0b;">{Math.round(eatenFat)}g</div>
					<div class="macro-lbl">دهون / {macroTargets().fatG}g</div>
				</div>
			</div>
		</div>

		<!-- Recommendation -->
		{#if data.recommendation}
			<div class="rec-card">
				<div class="rec-title">توصيات الأخصائي</div>
				<div class="rec-text">{data.recommendation}</div>
			</div>
		{/if}

		<!-- AI Generate Button -->
		<button
			style="width:100%; padding:14px; border-radius:14px; border:none; background:linear-gradient(135deg,#7c3aed,#a855f7); color:#fff; font-size:15px; font-weight:800; cursor:pointer; font-family:'Tajawal',sans-serif; margin-bottom:14px; display:flex; align-items:center; justify-content:center; gap:8px; transition:.15s;"
			onclick={() => {
				aiExtraNote = '';
				aiError = '';
				showAiModal = true;
			}}
		>
			🤖 إنشاء وجبات بالذكاء الاصطناعي
		</button>

		<!-- AI Generated Meals (client-only, not stored in recipe library) -->
		{#if aiMeals.length > 0}
			<div
				style="background:#f3e8ff; border:1.5px solid #c4b5fd; border-radius:14px; padding:14px 16px; margin-bottom:14px;"
			>
				<div
					style="font-size:12px; font-weight:800; color:#7c3aed; margin-bottom:10px; display:flex; align-items:center; gap:6px;"
				>
					🤖 وجبات مقترحة بالذكاء الاصطناعي
					<button
						style="margin-right:auto; font-size:10px; padding:3px 8px; border-radius:6px; border:1px solid #c4b5fd; background:#fff; color:#7c3aed; cursor:pointer; font-family:'Tajawal',sans-serif; font-weight:600;"
						onclick={() => (aiMeals = [])}>مسح</button
					>
				</div>
				{#each aiMeals as meal}
					<div
						style="background:#fff; border-radius:10px; padding:12px; margin-bottom:8px; border:1px solid #e8eaed;"
					>
						<div style="display:flex; justify-content:space-between; margin-bottom:4px;">
							<div>
								<div style="font-size:11px; color:#8b909a; font-weight:600;">
									{getMealLabel(meal.mealType)}
								</div>
								<div style="font-size:14px; font-weight:700; color:#1f2937;">{meal.name_ar}</div>
							</div>
							<div style="font-size:12px; color:#3cb96b; font-weight:700;">
								{Math.round(meal.total?.calories ?? 0)} سعرة
							</div>
						</div>
						<div style="font-size:10.5px; color:#8b909a; display:flex; gap:8px;">
							<span>كارب: {Math.round(meal.total?.carbs ?? 0)}g</span>
							<span>بروتين: {Math.round(meal.total?.protein ?? 0)}g</span>
							<span>دهون: {Math.round(meal.total?.fat ?? 0)}g</span>
						</div>
						{#if meal.ingredients?.length}
							<details style="margin-top:6px;">
								<summary style="font-size:11px; color:#7c3aed; cursor:pointer; font-weight:600;"
									>المكونات ({meal.ingredients.length})</summary
								>
								<div style="margin-top:4px; font-size:11px; color:#4b5563; line-height:1.8;">
									{#each meal.ingredients as ing}
										<div>• {ing.name_ar} — {ing.quantity} {ing.unit}</div>
									{/each}
								</div>
							</details>
						{/if}
						{#if meal.steps}
							<details style="margin-top:4px;">
								<summary style="font-size:11px; color:#7c3aed; cursor:pointer; font-weight:600;"
									>طريقة التحضير</summary
								>
								<div style="margin-top:4px; font-size:11px; color:#4b5563; line-height:1.7;">
									{meal.steps}
								</div>
							</details>
						{/if}
					</div>
				{/each}
			</div>
		{/if}

		<!-- Water Tracker -->
		<div class="water-card">
			<div class="progress-label">متابعة الماء</div>
			<div class="water-cups">
				{#each Array(8) as _, i}
					<div class="water-cup" class:filled={i < waterCups}>
						{i < waterCups ? '💧' : '○'}
					</div>
				{/each}
			</div>
			<div style="font-size:12px; color:#8b909a; text-align:center; margin-bottom:6px;">
				{waterCups} / 8 أكواب
			</div>
			<div class="water-btns">
				<button class="water-btn" onclick={() => updateWater(-1)}>−</button>
				<button class="water-btn" onclick={() => updateWater(1)}>+</button>
			</div>
		</div>

		<!-- Meals -->
		{#if data.todayMeals.length === 0}
			<div class="progress-card" style="text-align:center;">
				<div style="font-size:28px; margin-bottom:8px;">📋</div>
				<div style="font-size:14px; color:#8b909a; font-weight:600;">لا توجد وجبات مخططة لليوم</div>
			</div>
		{:else}
			{#each data.todayMeals as item}
				{@const st = mealStatuses[item.meal.id]}
				<div class="meal-card" class:eaten={st === 'eaten'} class:skipped={st === 'skipped'}>
					<div
						style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px;"
					>
						{#if item.recipeImageUrl}
							<img
								src={item.recipeImageUrl}
								alt=""
								style="width:52px;height:52px;border-radius:10px;object-fit:cover;flex-shrink:0;border:1px solid #e8eaed;"
							/>
						{/if}
						<div style="flex:1; min-width:0;">
							<div class="meal-type">{getMealLabel(item.meal.mealType)}</div>
							<div class="meal-name">
								{item.recipeName ?? item.supplementName ?? item.foodName ?? '—'}
							</div>
						</div>
						<div class="meal-kcal">{Math.round(item.calories)} سعرة</div>
					</div>
					<div style="display:flex; gap:8px; font-size:10.5px; color:#8b909a; margin-top:4px;">
						<span>كارب: {Math.round(item.carbs)}g</span>
						<span>بروتين: {Math.round(item.protein)}g</span>
						<span>دهون: {Math.round(item.fat)}g</span>
					</div>
					{#if !dayCompleted}
						<div class="meal-actions">
							<button
								class="meal-btn meal-btn-eat"
								class:active={st === 'eaten'}
								onclick={() => setMealStatus(item.meal.id, st === 'eaten' ? '' : 'eaten')}
							>
								{st === 'eaten' ? '✓ أكلتها' : 'أكلتها'}
							</button>
							<button
								class="meal-btn meal-btn-skip"
								class:active={st === 'skipped'}
								onclick={() => setMealStatus(item.meal.id, st === 'skipped' ? '' : 'skipped')}
							>
								{st === 'skipped' ? '✓ تخطيت' : 'تخطيت'}
							</button>
						</div>
					{/if}
				</div>
			{/each}
		{/if}

		<!-- Finish Day -->
		{#if dayCompleted}
			<button class="finish-btn finish-btn-done" disabled> ✓ تم إنهاء اليوم </button>
			<div style="text-align:center;">
				<span
					class="badge"
					class:badge-success={adherencePct >= 80}
					class:badge-warn={adherencePct < 80}
				>
					{adherencePct >= 80 ? '🏆' : '💪'}
					الالتزام: {adherencePct}%
				</span>
			</div>
		{:else if data.todayMeals.length > 0}
			<button class="finish-btn finish-btn-active" onclick={() => (showFinishModal = true)}>
				إنهاء اليوم
			</button>
		{/if}
	</div>
</div>

<!-- AI Generate Modal -->
{#if showAiModal}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="overlay"
		onclick={(e) => e.target === e.currentTarget && !aiGenerating && (showAiModal = false)}
	>
		<div class="modal" style="text-align:right;">
			<h2 style="font-size:17px; font-weight:700; margin:0 0 4px;">
				🤖 إنشاء وجبات بالذكاء الاصطناعي
			</h2>
			<p style="font-size:12.5px; color:#8b909a; margin:0 0 16px; line-height:1.6;">
				سيتم استخدام بياناتك الصحية والغذائية تلقائياً لإنشاء وجبات مناسبة لك.
			</p>

			<div
				style="font-size:11px; font-weight:700; color:#8b909a; text-transform:uppercase; letter-spacing:.4px; margin-bottom:6px;"
			>
				النطاق
			</div>
			<div style="display:flex; gap:8px; margin-bottom:14px;">
				<button
					style="flex:1; padding:10px; border-radius:9px; border:1.5px solid {aiScope === 'day'
						? '#7c3aed'
						: '#e8eaed'}; background:{aiScope === 'day' ? '#f3e8ff' : '#fff'}; color:{aiScope ===
					'day'
						? '#7c3aed'
						: '#8b909a'}; font-size:13px; font-weight:700; cursor:pointer; font-family:'Tajawal',sans-serif;"
					onclick={() => (aiScope = 'day')}
				>
					يوم واحد
				</button>
				<button
					style="flex:1; padding:10px; border-radius:9px; border:1.5px solid {aiScope === 'week'
						? '#7c3aed'
						: '#e8eaed'}; background:{aiScope === 'week' ? '#f3e8ff' : '#fff'}; color:{aiScope ===
					'week'
						? '#7c3aed'
						: '#8b909a'}; font-size:13px; font-weight:700; cursor:pointer; font-family:'Tajawal',sans-serif;"
					onclick={() => (aiScope = 'week')}
				>
					أسبوع كامل
				</button>
			</div>

			<div
				style="font-size:11px; font-weight:700; color:#8b909a; text-transform:uppercase; letter-spacing:.4px; margin-bottom:6px;"
			>
				هل تريد إضافة ملاحظات؟
			</div>
			<textarea
				bind:value={aiExtraNote}
				placeholder="مثال: أفضل أكل خفيف اليوم، لا أحب الباذنجان…"
				style="width:100%; border:1.5px solid #e8eaed; border-radius:9px; padding:10px 13px; font-size:13px; font-family:'Tajawal',sans-serif; resize:vertical; min-height:64px; outline:none; color:#1a1d23; box-sizing:border-box;"
			></textarea>

			{#if aiError}
				<div
					style="font-size:12px; color:#dc2626; margin:8px 0; padding:8px; background:#fef2f2; border-radius:8px;"
				>
					{aiError}
				</div>
			{/if}

			<div style="display:flex; gap:8px; margin-top:16px;">
				<button
					style="flex:1; padding:12px; border-radius:10px; border:1.5px solid #e8eaed; background:#fff; font-size:13px; font-weight:600; cursor:pointer; font-family:'Tajawal',sans-serif; color:#8b909a;"
					onclick={() => (showAiModal = false)}
					disabled={aiGenerating}>إلغاء</button
				>
				<button
					style="flex:2; padding:12px; border-radius:10px; border:none; background:linear-gradient(135deg,#7c3aed,#a855f7); color:#fff; font-size:14px; font-weight:700; font-family:'Tajawal',sans-serif; {aiGenerating
						? 'opacity:.7; cursor:wait;'
						: 'cursor:pointer;'}"
					disabled={aiGenerating}
					onclick={startPatientAiGenerate}
				>
					{aiGenerating ? 'جاري الإنشاء…' : 'إنشاء الوجبات ←'}
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- Finish Day Confirmation -->
{#if toastError}
	<div
		style="position:fixed; bottom:24px; right:24px; background:#dc2626; color:#fff; padding:13px 18px; border-radius:12px; font-size:13px; font-family:'Tajawal',sans-serif; z-index:9999; box-shadow:0 4px 18px rgba(0,0,0,.18); direction:rtl; max-width:300px;"
	>
		{toastError}
	</div>
{/if}

{#if showFinishModal}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="overlay" onclick={(e) => e.target === e.currentTarget && (showFinishModal = false)}>
		<div class="modal">
			<div style="font-size:40px; margin-bottom:12px;">🎯</div>
			<h2 style="font-size:18px; font-weight:800; color:#1f2937; margin:0 0 8px;">إنهاء اليوم</h2>
			<p style="font-size:13px; color:#8b909a; margin:0 0 16px; line-height:1.6;">
				أكلت {eatenCount} من {totalMeals} وجبات — الالتزام {adherencePct}%
			</p>
			{#if adherencePct >= 80}
				<div class="badge badge-success" style="margin-bottom:14px;">🏆 أداء ممتاز!</div>
			{:else if adherencePct >= 50}
				<div class="badge badge-warn" style="margin-bottom:14px;">💪 يمكنك تحسين الالتزام!</div>
			{:else}
				<div class="badge badge-warn" style="margin-bottom:14px;">
					⚠️ التزام منخفض — سيتم إبلاغ الأخصائي
				</div>
			{/if}
			<div style="display:flex; gap:8px;">
				<button
					style="flex:1; padding:12px; border-radius:10px; border:1.5px solid #e8eaed; background:#fff; font-size:13px; font-weight:600; cursor:pointer; font-family:'Tajawal',sans-serif; color:#8b909a;"
					onclick={() => (showFinishModal = false)}
				>
					رجوع
				</button>
				<button
					style="flex:2; padding:12px; border-radius:10px; border:none; background:#3cb96b; color:#fff; font-size:14px; font-weight:700; cursor:pointer; font-family:'Tajawal',sans-serif; opacity:{isSubmitting
						? 0.7
						: 1};"
					onclick={finishDay}
					disabled={isSubmitting}
				>
					{isSubmitting ? 'جاري الحفظ…' : 'تأكيد إنهاء اليوم'}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.pdash {
		font-family: 'Tajawal', sans-serif;
		min-height: 100vh;
		background: #f7f9fc;
		direction: rtl;
	}
	.pdash-header {
		background: #fff;
		border-bottom: 1px solid #e8eaed;
		padding: 16px 20px;
	}
	.pdash-name {
		font-size: 18px;
		font-weight: 800;
		color: #1f2937;
	}
	.pdash-date {
		font-size: 12px;
		color: #8b909a;
		margin-top: 2px;
	}
	.pdash-body {
		padding: 16px 20px;
		max-width: 480px;
		margin: 0 auto;
	}

	.week-strip {
		display: flex;
		gap: 6px;
		margin-bottom: 18px;
		overflow-x: auto;
		padding-bottom: 4px;
	}
	.week-day {
		flex: 1;
		min-width: 44px;
		text-align: center;
		padding: 8px 4px;
		border-radius: 12px;
		font-size: 11px;
		font-weight: 600;
		color: #8b909a;
		background: #fff;
		border: 1.5px solid #e8eaed;
		cursor: default;
		transition: 0.15s;
	}
	.week-day.active {
		background: #3cb96b;
		color: #fff;
		border-color: #3cb96b;
		font-weight: 800;
		box-shadow: 0 2px 8px rgba(60, 185, 107, 0.3);
	}

	.progress-card {
		background: #fff;
		border-radius: 16px;
		padding: 18px;
		border: 1px solid #e8edf3;
		box-shadow: 0 2px 12px rgba(16, 24, 40, 0.05);
		margin-bottom: 14px;
	}
	.progress-label {
		font-size: 11px;
		font-weight: 700;
		color: #8b909a;
		margin-bottom: 6px;
		text-transform: uppercase;
		letter-spacing: 0.4px;
	}
	.progress-bar {
		height: 8px;
		background: #e8eaed;
		border-radius: 4px;
		overflow: hidden;
		margin-bottom: 4px;
	}
	.progress-fill {
		height: 100%;
		border-radius: 4px;
		transition: width 0.4s ease;
	}
	.progress-nums {
		display: flex;
		justify-content: space-between;
		font-size: 10.5px;
		color: #8b909a;
	}

	.macro-row {
		display: flex;
		gap: 6px;
		margin-top: 10px;
	}
	.macro-box {
		flex: 1;
		border-radius: 10px;
		padding: 10px 6px;
		text-align: center;
	}
	.macro-val {
		font-size: 16px;
		font-weight: 800;
	}
	.macro-lbl {
		font-size: 10px;
		color: #8b909a;
		font-weight: 600;
		margin-top: 1px;
	}

	.meal-card {
		background: #fff;
		border-radius: 14px;
		padding: 14px 16px;
		border: 1.5px solid #e8eaed;
		margin-bottom: 10px;
		transition: 0.2s;
	}
	.meal-card.eaten {
		border-color: #3cb96b;
		background: #f0faf4;
	}
	.meal-card.skipped {
		border-color: #e8eaed;
		background: #f9fafb;
		opacity: 0.6;
	}
	.meal-name {
		font-size: 14px;
		font-weight: 700;
		color: #1f2937;
		margin-bottom: 2px;
	}
	.meal-type {
		font-size: 11px;
		color: #8b909a;
		font-weight: 600;
	}
	.meal-kcal {
		font-size: 12px;
		color: #3cb96b;
		font-weight: 700;
	}
	.meal-actions {
		display: flex;
		gap: 6px;
		margin-top: 10px;
	}
	.meal-btn {
		flex: 1;
		padding: 10px 8px;
		border-radius: 10px;
		border: 1.5px solid #e8eaed;
		background: #fff;
		font-size: 12px;
		font-weight: 700;
		cursor: pointer;
		transition: 0.15s;
		font-family: 'Tajawal', sans-serif;
		min-height: 42px;
	}
	.meal-btn:hover {
		border-color: #3cb96b;
	}
	.meal-btn-eat {
		color: #1f9e57;
	}
	.meal-btn-eat:hover {
		background: #edf9f2;
		border-color: #3cb96b;
	}
	.meal-btn-eat.active {
		background: #3cb96b;
		color: #fff;
		border-color: #3cb96b;
	}
	.meal-btn-skip {
		color: #8b909a;
	}
	.meal-btn-skip:hover {
		background: #f4f6f9;
	}
	.meal-btn-skip.active {
		background: #6b7280;
		color: #fff;
		border-color: #6b7280;
	}

	.water-card {
		background: #fff;
		border-radius: 16px;
		padding: 18px;
		border: 1px solid #e8edf3;
		box-shadow: 0 2px 12px rgba(16, 24, 40, 0.05);
		margin-bottom: 14px;
	}
	.water-cups {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
		margin: 10px 0;
	}
	.water-cup {
		width: 36px;
		height: 36px;
		border-radius: 50%;
		border: 2px solid #bfdbfe;
		background: #eff6ff;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 16px;
		cursor: pointer;
		transition: 0.15s;
	}
	.water-cup.filled {
		background: #3b82f6;
		border-color: #3b82f6;
	}
	.water-btns {
		display: flex;
		gap: 8px;
		margin-top: 8px;
	}
	.water-btn {
		flex: 1;
		padding: 8px;
		border-radius: 8px;
		border: 1.5px solid #e8eaed;
		background: #fff;
		font-size: 18px;
		font-weight: 700;
		cursor: pointer;
		transition: 0.15s;
		font-family: 'Tajawal', sans-serif;
	}
	.water-btn:hover {
		border-color: #3b82f6;
		background: #eff6ff;
	}

	.finish-btn {
		width: 100%;
		padding: 16px;
		border-radius: 14px;
		border: none;
		font-size: 16px;
		font-weight: 800;
		cursor: pointer;
		font-family: 'Tajawal', sans-serif;
		transition: 0.15s;
		margin-top: 8px;
	}
	.finish-btn-active {
		background: #3cb96b;
		color: #fff;
	}
	.finish-btn-active:hover {
		background: #2ea55d;
	}
	.finish-btn-done {
		background: #edf9f2;
		color: #1f9e57;
		cursor: default;
	}

	.overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.38);
		z-index: 500;
		display: flex;
		align-items: center;
		justify-content: center;
		backdrop-filter: blur(2px);
	}
	.modal {
		background: #fff;
		border-radius: 20px;
		padding: 28px;
		max-width: 380px;
		width: 92%;
		text-align: center;
		font-family: 'Tajawal', sans-serif;
	}

	.badge {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 6px 16px;
		border-radius: 20px;
		font-size: 13px;
		font-weight: 700;
		margin-top: 12px;
	}
	.badge-success {
		background: #edf9f2;
		color: #1f9e57;
	}
	.badge-warn {
		background: #fffbeb;
		color: #d97706;
	}

	.rec-card {
		background: #fffdf0;
		border: 1.5px solid #fde68a;
		border-radius: 14px;
		padding: 14px 16px;
		margin-bottom: 14px;
	}
	.rec-title {
		font-size: 11px;
		font-weight: 700;
		color: #92400e;
		text-transform: uppercase;
		letter-spacing: 0.4px;
		margin-bottom: 6px;
	}
	.rec-text {
		font-size: 13px;
		color: #44403c;
		line-height: 1.7;
	}
</style>
