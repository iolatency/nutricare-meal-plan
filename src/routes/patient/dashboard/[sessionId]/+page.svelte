<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';
	import { MEAL_TYPES, DAYS_W } from '$lib/meal-plan/constants';
	import { toLocalYmd } from '$lib/date/local-ymd';
	import { resolveBuilderConfigForDate } from '$lib/meal-plan/builder-config';

	let { data }: { data: PageData } = $props();

	let waterCups = $state(0);
	let dayCompleted = $state(false);
	let showFinishModal = $state(false);
	let mealStatuses = $state<Record<number, string>>({});
	let toastMsg = $state('');
	let toastType = $state<'error' | 'success'>('error');
	let isSubmitting = $state(false);
	let expandedIngredients = $state<Set<number>>(new Set());
	let expandedSteps = $state<Set<number>>(new Set());

	// Replace popup state
	let replacePopupOpen = $state(false);
	let replaceMealId = $state<number | null>(null);
	let replaceMealName = $state('');
	let replaceNote = $state('');
	let replaceSaving = $state(false);

	$effect(() => {
		waterCups = data.todayLog?.waterCups ?? 0;
		dayCompleted = data.todayLog?.completed ?? false;
		mealStatuses = Object.fromEntries(data.todayMeals.map((m) => [m.meal.id, m.status ?? '']));
	});

	const today = $derived(data.today ?? toLocalYmd(new Date()));
	const realToday = $derived(data.realToday ?? toLocalYmd(new Date()));
	const minNavDate = $derived(data.minNavDate ?? today);
	const maxNavDate = $derived(data.maxNavDate ?? today);
	const canGoPrevWeek = $derived(data.canGoPrevWeek ?? false);
	const canGoNextWeek = $derived(data.canGoNextWeek ?? false);
	const prevWeekDate = $derived(shiftWeek(-7));
	const nextWeekDate = $derived(shiftWeek(7));

	const resolvedBuilder = $derived(resolveBuilderConfigForDate(data.builderConfig, today));
	const totalTarget = $derived(resolvedBuilder.targetCalories ?? 0);
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
		const cfg = resolvedBuilder.macros;
		if (!cfg) return { carbG: Math.round(cal * 0.5 / 4), protG: Math.round(cal * 0.25 / 4), fatG: Math.round(cal * 0.25 / 9) };
		return {
			carbG: Math.round((cal * cfg.c) / 100 / 4),
			protG: Math.round((cal * cfg.p) / 100 / 4),
			fatG: Math.round((cal * cfg.f) / 100 / 9)
		};
	});

	const caloriesPct = $derived(totalTarget ? Math.min(100, Math.round((eatenCalories / totalTarget) * 100)) : 0);
	const totalMeals = $derived(data.todayMeals.length);
	const carbPct = $derived(macroTargets().carbG > 0 ? Math.min(100, Math.round((eatenCarbs / macroTargets().carbG) * 100)) : 0);
	const protPct = $derived(macroTargets().protG > 0 ? Math.min(100, Math.round((eatenProtein / macroTargets().protG) * 100)) : 0);
	const fatPct = $derived(macroTargets().fatG > 0 ? Math.min(100, Math.round((eatenFat / macroTargets().fatG) * 100)) : 0);
	const eatenCount = $derived(Object.values(mealStatuses).filter((s) => s === 'eaten').length);
	const adherencePct = $derived(totalMeals ? Math.round((eatenCount / totalMeals) * 100) : 0);

	const todayName = $derived(() => {
		const d = new Date(today + 'T00:00:00');
		return DAYS_W[d.getDay()];
	});

	const greeting = $derived(() => {
		const h = new Date().getHours();
		if (h < 12) return 'صباح الخير';
		if (h < 17) return 'مساء النور';
		return 'مساء الخير';
	});

	function shiftWeek(dir: -7 | 7) {
		const base = new Date(today + 'T00:00:00');
		base.setDate(base.getDate() + dir);
		return base.toISOString().split('T')[0];
	}

	function isDateNavigable(dateStr: string) {
		return dateStr >= minNavDate && dateStr <= maxNavDate;
	}

	function showToast(msg: string, type: 'error' | 'success' = 'error') {
		toastMsg = msg;
		toastType = type;
		setTimeout(() => (toastMsg = ''), 3500);
	}

	async function setMealStatus(mealId: number, status: string, replacementNote?: string) {
		const prev = mealStatuses[mealId];
		mealStatuses = { ...mealStatuses, [mealId]: status };
		const body = new FormData();
		body.append('mealId', String(mealId));
		body.append('status', status);
		body.append('date', today);
		if (replacementNote) body.append('replacementNote', replacementNote);
		const res = await fetch('?/updateMealStatus', { method: 'POST', body });
		if (!res.ok) {
			mealStatuses = { ...mealStatuses, [mealId]: prev };
			showToast('فشل تحديث حالة الوجبة. حاول مرة أخرى.');
		}
	}

	async function updateWater(newCount: number) {
		const prev = waterCups;
		const clamped = Math.min(8, Math.max(0, newCount));
		waterCups = clamped;
		const body = new FormData();
		body.append('cups', String(clamped));
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
				showToast('أحسنت! تم تسجيل يومك بنجاح', 'success');
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

	const MEAL_THEME: Record<string, { gradient: string; accent: string; icon: string }> = {
		breakfast:       { gradient: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)', accent: '#d97706', icon: '🥚' },
		morning_snack:   { gradient: 'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)', accent: '#059669', icon: '🍎' },
		lunch:           { gradient: 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)', accent: '#2563eb', icon: '🍗' },
		afternoon_snack: { gradient: 'linear-gradient(135deg, #ede9fe 0%, #ddd6fe 100%)', accent: '#7c3aed', icon: '🥜' },
		dinner:          { gradient: 'linear-gradient(135deg, #ccfbf1 0%, #99f6e4 100%)', accent: '#0d9488', icon: '🍲' },
		supplement:      { gradient: 'linear-gradient(135deg, #fce7f3 0%, #fbcfe8 100%)', accent: '#be185d', icon: '💊' },
		other:           { gradient: 'linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)', accent: '#475569', icon: '🍽️' }
	};

	function mealTheme(type: string) {
		return MEAL_THEME[type] ?? MEAL_THEME.other;
	}

	function openReplace(mealId: number, mealName: string) {
		replaceMealId = mealId;
		replaceMealName = mealName;
		replaceNote = '';
		replacePopupOpen = true;
	}

	async function saveReplacement() {
		if (!replaceMealId) return;
		replaceSaving = true;
		await setMealStatus(replaceMealId, 'skipped', replaceNote || undefined);
		replacePopupOpen = false;
		replaceSaving = false;
		await invalidateAll();
		showToast('تم تسجيل البديل وإرساله للأخصائي ✓', 'success');
	}

	function toggleIngredients(mealId: number) {
		const next = new Set(expandedIngredients);
		if (next.has(mealId)) next.delete(mealId);
		else next.add(mealId);
		expandedIngredients = next;
	}

	function toggleSteps(mealId: number) {
		const next = new Set(expandedSteps);
		if (next.has(mealId)) next.delete(mealId);
		else next.add(mealId);
		expandedSteps = next;
	}

	// Radial arc path for SVG donut
	function arcPath(pct: number, r = 34, cx = 40, cy = 40, startAngle = -90): string {
		const clampedPct = Math.min(99.9, Math.max(0, pct));
		const angle = (clampedPct / 100) * 360;
		const rad = (a: number) => (a * Math.PI) / 180;
		const sx = cx + r * Math.cos(rad(startAngle));
		const sy = cy + r * Math.sin(rad(startAngle));
		const ex = cx + r * Math.cos(rad(startAngle + angle));
		const ey = cy + r * Math.sin(rad(startAngle + angle));
		const large = angle > 180 ? 1 : 0;
		return `M ${sx} ${sy} A ${r} ${r} 0 ${large} 1 ${ex} ${ey}`;
	}
</script>

<svelte:head>
	<title>خطتي الغذائية — نيوتريكير</title>
</svelte:head>

<style>
	/* ─── DESIGN TOKENS — aligned with patient layout --nc-* tokens ─── */
	.pdash {
		--g:       #2a9d62;
		--g2:      #34b872;
		--g3:      #4ade80;
		--g-soft:  #e6f4eb;
		--g-mid:   #c3e8d4;
		--g-text:  #1a7a4a;
		--ink:     #121816;
		--ink2:    #1e293b;
		--muted:   #5a635e;
		--muted2:  #8b909a;
		--line:    #e4e9e4;
		--surf:    #ffffff;
		--warm:    #faf9f6;
		--radius:  14px;
		--shadow:  0 2px 12px rgba(18, 24, 22, 0.05);
		--shadow2: 0 8px 30px rgba(18, 24, 22, 0.07);

		font-family: 'Tajawal', sans-serif;
		direction: rtl;
		max-width: 540px;
		margin: 0 auto;
		padding: 0 0 24px;
		background: transparent;
	}

	/* ─── HERO HEADER ─── */
	.hero {
		background: linear-gradient(145deg, #0b3d21 0%, #145534 40%, #1a7a4a 100%);
		padding: 24px 20px 32px;
		position: relative;
		overflow: hidden;
	}
	.hero::before {
		content: '';
		position: absolute;
		inset: 0;
		background:
			radial-gradient(ellipse 60% 80% at 90% 20%, rgba(74, 222, 128, 0.18) 0%, transparent 60%),
			radial-gradient(ellipse 40% 60% at 10% 80%, rgba(21, 128, 61, 0.25) 0%, transparent 50%);
		pointer-events: none;
	}
	.hero-inner { position: relative; z-index: 1; }
	.hero-greeting {
		font-size: 12px;
		font-weight: 600;
		color: rgba(167, 243, 208, 0.8);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		margin-bottom: 2px;
	}
	.hero-name {
		font-family: 'El Messiri', 'Tajawal', serif;
		font-size: 26px;
		font-weight: 700;
		color: #fff;
		margin-bottom: 2px;
		line-height: 1.15;
	}
	.hero-date {
		font-size: 13px;
		color: rgba(167, 243, 208, 0.7);
		font-weight: 500;
	}
	.hero-completed-badge {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		margin-top: 8px;
		padding: 4px 12px;
		background: rgba(74, 222, 128, 0.2);
		border: 1px solid rgba(74, 222, 128, 0.35);
		border-radius: 999px;
		font-size: 11.5px;
		font-weight: 700;
		color: #86efac;
	}

	/* ─── WEEK STRIP ─── */
	.week-nav {
		background: #fff;
		border-bottom: 1px solid var(--line);
		padding: 10px 12px;
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.week-arrow {
		display: flex; align-items: center; justify-content: center;
		width: 30px; height: 30px; min-width: 30px;
		border-radius: 8px;
		border: 1px solid var(--line);
		background: var(--surf);
		color: var(--muted);
		text-decoration: none;
		flex-shrink: 0;
		transition: 0.15s;
	}
	/* In RTL, the SVG chevrons look reversed visually; flip only the icon. */
	.week-arrow svg {
		transform: scaleX(-1);
		transform-origin: center;
	}
	.week-arrow:hover { border-color: var(--g2); color: var(--g); background: var(--g-soft); }
	.week-arrow.is-disabled {
		opacity: 0.45;
		pointer-events: none;
		cursor: not-allowed;
		color: #c0c4cc;
		background: #f8f9fa;
	}
	.week-arrow.is-disabled:hover {
		border-color: var(--line);
		color: #c0c4cc;
		background: #f8f9fa;
	}
	.week-strip {
		display: flex;
		gap: 4px;
		flex: 1;
		overflow: hidden;
	}
	.week-day {
		flex: 1;
		min-width: 0;
		text-align: center;
		padding: 6px 2px;
		border-radius: 10px;
		font-size: 9.5px;
		font-weight: 600;
		color: var(--muted);
		background: transparent;
		border: 1.5px solid transparent;
		text-decoration: none;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		transition: 0.15s;
		cursor: pointer;
	}
	.week-day:hover { background: var(--g-soft); color: var(--g-text); }
	.week-day.active {
		background: var(--g);
		color: #fff;
		border-color: var(--g);
		box-shadow: 0 2px 8px rgba(22, 163, 74, 0.35);
	}
	.week-day.is-today:not(.active) {
		border-color: var(--g2);
		color: var(--g-text);
		font-weight: 700;
	}
	.week-day-num { font-size: 14px; font-weight: 800; line-height: 1.1; }
	.day-pip {
		width: 4px; height: 4px;
		border-radius: 50%;
		background: currentColor;
		opacity: 0;
		transition: opacity 0.2s;
	}
	.week-day.has-data .day-pip { opacity: 0.6; }
	.week-day.active .day-pip { opacity: 1; background: rgba(255,255,255,0.7); }
	.week-day.is-disabled {
		pointer-events: none;
		cursor: not-allowed;
		opacity: 0.45;
	}
	.week-day.is-disabled:hover {
		background: transparent;
		color: var(--muted);
	}

	/* ─── SECTION WRAPPER ─── */
	.section {
		margin: 12px 14px 0;
		background: var(--surf);
		border-radius: var(--radius);
		border: 1px solid var(--line);
		box-shadow: var(--shadow);
		overflow: hidden;
	}
	.section-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 14px 16px 0;
	}
	.section-label {
		font-size: 10px;
		font-weight: 800;
		color: var(--muted);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.section-body { padding: 10px 16px 16px; }

	/* ─── CALORIE PROGRESS ─── */
	.cal-row {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		margin-bottom: 8px;
	}
	.cal-eaten {
		font-family: 'El Messiri', 'Tajawal', serif;
		font-size: 38px;
		font-weight: 700;
		color: var(--ink);
		line-height: 1;
	}
	.cal-unit { font-size: 13px; color: var(--muted); font-weight: 500; margin-bottom: 4px; margin-inline-start: 3px; }
	.cal-target { font-size: 13px; color: var(--muted2); font-weight: 500; }
	.cal-pct-badge {
		font-size: 11px;
		font-weight: 800;
		padding: 3px 10px;
		border-radius: 999px;
		background: var(--g-soft);
		color: var(--g-text);
	}
	.pbar-track {
		height: 10px;
		background: #f1f5f9;
		border-radius: 6px;
		overflow: hidden;
		margin-bottom: 12px;
	}
	.pbar-fill {
		height: 100%;
		border-radius: 6px;
		background: linear-gradient(90deg, var(--g) 0%, var(--g2) 60%, var(--g3) 100%);
		box-shadow: 0 2px 6px rgba(42, 157, 98, 0.3);
		transition: width 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
	}

	/* ─── MACRO GAUGES ─── */
	.macro-row {
		display: flex;
		gap: 8px;
	}
	.macro-gauge {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		padding: 10px 4px 6px;
		border-radius: 12px;
		border: 1px solid var(--line);
		background: var(--warm);
		position: relative;
	}
	.gauge-svg { display: block; }
	.gauge-val {
		font-size: 11px;
		font-weight: 800;
		color: var(--ink2);
		text-align: center;
		line-height: 1.1;
	}
	.gauge-label { font-size: 9.5px; color: var(--muted2); font-weight: 600; text-align: center; }

	/* ─── RECOMMENDATION ─── */
	.rec-card {
		margin: 12px 14px 0;
		background: linear-gradient(135deg, #fffbeb 0%, #fef9c3 100%);
		border: 1.5px solid #fde68a;
		border-radius: var(--radius);
		padding: 14px 16px;
	}
	.rec-header {
		display: flex;
		align-items: center;
		gap: 7px;
		font-size: 10px;
		font-weight: 800;
		color: #92400e;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		margin-bottom: 8px;
	}
	.rec-icon {
		width: 22px; height: 22px;
		background: #fde68a;
		border-radius: 6px;
		display: flex; align-items: center; justify-content: center;
		font-size: 12px;
		flex-shrink: 0;
	}
	.rec-text { font-size: 13.5px; color: #44403c; line-height: 1.75; }

	/* ─── WATER TRACKER ─── */
	.water-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
	.water-drops {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
		margin-bottom: 10px;
	}
	.drop-btn {
		width: 36px; height: 42px;
		border: none;
		background: none;
		cursor: pointer;
		padding: 0;
		display: flex; align-items: center; justify-content: center;
		transition: transform 0.15s;
		position: relative;
	}
	.drop-btn:hover { transform: translateY(-2px); }
	.drop-btn:disabled { cursor: default; opacity: 0.7; }
	.drop-svg { width: 30px; height: 36px; display: block; }
	.water-actions-row { display: flex; gap: 8px; margin-top: 4px; }
	.water-btn-add {
		flex: 2;
		padding: 10px;
		border-radius: 10px;
		border: none;
		background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
		color: #1d4ed8;
		font-size: 13px;
		font-weight: 700;
		cursor: pointer;
		font-family: 'Tajawal', sans-serif;
		transition: 0.15s;
		display: flex; align-items: center; justify-content: center; gap: 6px;
	}
	.water-btn-add:hover { background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%); }
	.water-btn-add:disabled { opacity: 0.5; cursor: not-allowed; }
	.water-btn-reset {
		flex: 1;
		padding: 10px;
		border-radius: 10px;
		border: 1.5px solid var(--line);
		background: var(--surf);
		color: var(--muted);
		font-size: 12px;
		font-weight: 600;
		cursor: pointer;
		font-family: 'Tajawal', sans-serif;
		transition: 0.15s;
	}
	.water-btn-reset:hover { border-color: #ef4444; color: #ef4444; }
	.water-note {
		text-align: center;
		font-size: 12px;
		color: var(--muted2);
		margin-top: 8px;
	}
	.water-note.done { color: var(--g-text); font-weight: 700; }

	/* ─── MEALS SECTION ─── */
	.meals-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 14px 14px 6px;
	}
	.meals-label {
		font-size: 10px;
		font-weight: 800;
		color: var(--muted);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.meals-count-badge {
		font-size: 11px;
		font-weight: 700;
		color: var(--muted2);
		background: #f1f5f9;
		padding: 2px 9px;
		border-radius: 999px;
	}

	/* ─── MEAL CARD ─── */
	.meal-card {
		margin: 0 14px 10px;
		border-radius: var(--radius);
		border: 1.5px solid var(--line);
		background: var(--surf);
		overflow: hidden;
		transition: border-color 0.25s, box-shadow 0.25s;
		animation: card-in 0.35s cubic-bezier(0.22, 1, 0.36, 1) both;
	}
	@keyframes card-in {
		from { opacity: 0; transform: translateY(12px); }
		to   { opacity: 1; transform: translateY(0); }
	}
	.meal-card.status-eaten {
		border-color: #22c55e;
		box-shadow: 0 2px 12px rgba(34, 197, 94, 0.15);
	}
	.meal-card.status-skipped {
		opacity: 0.7;
		border-color: #94a3b8;
	}
	.meal-card.status-replaced {
		border-color: #a855f7;
		box-shadow: 0 2px 12px rgba(168, 85, 247, 0.12);
	}

	.meal-top {
		display: flex;
		align-items: stretch;
		min-height: 88px;
	}
	.meal-icon-col {
		width: 68px;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		position: relative;
	}
	.meal-emoji-wrap {
		width: 52px;
		height: 52px;
		border-radius: 14px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 26px;
	}
	.meal-thumb {
		width: 52px;
		height: 52px;
		border-radius: 14px;
		object-fit: cover;
		border: 1.5px solid var(--line);
	}
	.status-badge-corner {
		position: absolute;
		top: 6px;
		right: 6px;
		width: 18px;
		height: 18px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 9px;
		font-weight: 800;
	}
	.badge-eaten { background: #22c55e; color: #fff; }
	.badge-skipped { background: #94a3b8; color: #fff; }
	.badge-replaced { background: #a855f7; color: #fff; }

	.meal-content {
		flex: 1;
		min-width: 0;
		padding: 10px 12px 10px 0;
	}
	.meal-type-chip {
		display: inline-block;
		font-size: 9px;
		font-weight: 800;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		padding: 2px 7px;
		border-radius: 5px;
		margin-bottom: 4px;
	}
	.meal-name-row {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 6px;
	}
	.meal-name {
		font-size: 14.5px;
		font-weight: 700;
		color: var(--ink);
		line-height: 1.3;
		flex: 1;
	}
	.meal-kcal {
		font-size: 11px;
		color: var(--g);
		font-weight: 700;
		margin: 3px 0 5px;
	}
	.meal-macros {
		display: flex;
		gap: 10px;
		font-size: 10px;
		color: var(--muted2);
	}
	.macro-chip {
		display: flex;
		align-items: center;
		gap: 2px;
	}
	.macro-dot {
		width: 5px;
		height: 5px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	/* ─── INGREDIENTS EXPAND ─── */
	.ing-toggle {
		width: 100%;
		padding: 7px 14px;
		background: #fafafa;
		border: none;
		border-top: 1px solid var(--line);
		border-bottom: 1px solid var(--line);
		font-size: 11.5px;
		font-weight: 700;
		color: var(--muted);
		cursor: pointer;
		font-family: 'Tajawal', sans-serif;
		text-align: right;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 6px;
		transition: background 0.15s;
	}
	.ing-toggle:hover { background: #f1f5f9; color: var(--ink2); }
	.ing-list {
		padding: 10px 14px 12px;
		display: flex;
		flex-direction: column;
		gap: 5px;
		border-bottom: 1px solid var(--line);
	}
	.ing-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		font-size: 11.5px;
		padding: 4px 0;
		border-bottom: 1px solid #f1f5f9;
	}
	.ing-row:last-child { border-bottom: none; }
	.ing-name { color: var(--ink2); font-weight: 600; }
	.ing-qty { color: var(--muted2); font-size: 10.5px; }
	.ing-kcal { color: var(--g-text); font-size: 10.5px; font-weight: 700; }

	/* ─── COOKING STEPS ─── */
	.steps-toggle {
		width: 100%;
		padding: 7px 14px;
		background: #f7f9f7;
		border: none;
		border-top: 1px solid var(--line);
		border-bottom: 1px solid var(--line);
		font-size: 11.5px;
		font-weight: 700;
		color: var(--g-text);
		cursor: pointer;
		font-family: 'Tajawal', sans-serif;
		text-align: right;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 6px;
		transition: background 0.15s;
	}
	.steps-toggle:hover { background: var(--g-soft); }
	.steps-content {
		padding: 12px 16px 14px;
		border-bottom: 1px solid var(--line);
		background: #fafcfa;
		font-size: 13px;
		color: var(--ink2);
		line-height: 1.8;
		white-space: pre-line;
		direction: rtl;
	}

	/* ─── REPLACEMENT NOTE ─── */
	.replace-note {
		margin: 0 14px 8px;
		padding: 8px 12px;
		background: #faf5ff;
		border: 1px solid #ddd6fe;
		border-radius: 10px;
		font-size: 11.5px;
		color: #6d28d9;
		line-height: 1.55;
		display: flex;
		align-items: flex-start;
		gap: 6px;
	}
	.replace-note-icon { flex-shrink: 0; font-size: 14px; margin-top: 1px; }

	/* ─── ACTION BUTTONS ─── */
	.meal-actions {
		display: flex;
		gap: 6px;
		padding: 10px 12px 12px;
		border-top: 1px solid #f1f5f9;
	}
	.act-btn {
		flex: 1;
		padding: 9px 4px;
		border-radius: 10px;
		border: 1.5px solid var(--line);
		background: #fff;
		font-size: 11.5px;
		font-weight: 700;
		cursor: pointer;
		font-family: 'Tajawal', sans-serif;
		transition: all 0.15s;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 4px;
		min-height: 38px;
	}
	.act-eat { color: var(--g-text); }
	.act-eat:hover { background: var(--g-soft); border-color: var(--g); }
	.act-eat.on { background: var(--g); color: #fff; border-color: var(--g); box-shadow: 0 2px 8px rgba(22,163,74,.28); }
	.act-skip { color: var(--muted); }
	.act-skip:hover { background: #f1f5f9; border-color: #94a3b8; }
	.act-skip.on { background: #64748b; color: #fff; border-color: #64748b; }
	.act-replace { color: #7c3aed; }
	.act-replace:hover { background: #f3e8ff; border-color: #a855f7; }
	.act-replace.on { background: #7c3aed; color: #fff; border-color: #7c3aed; }

	/* ─── FINISH BUTTON ─── */
	.finish-wrap { padding: 14px 14px 0; }
	.finish-btn {
		width: 100%;
		padding: 16px;
		border-radius: var(--radius);
		border: none;
		font-size: 15px;
		font-weight: 800;
		cursor: pointer;
		font-family: 'Tajawal', sans-serif;
		transition: all 0.2s;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
	}
	.finish-active {
		background: linear-gradient(135deg, var(--g) 0%, var(--g2) 60%, var(--g3) 100%);
		color: #fff;
		box-shadow: 0 4px 18px rgba(42, 157, 98, 0.3);
	}
	.finish-active:hover { box-shadow: 0 6px 24px rgba(42, 157, 98, 0.4); transform: translateY(-1px); }
	.finish-done { background: var(--g-soft); color: var(--g-text); cursor: default; }

	/* ─── REPLACE POPUP ─── */
	.popup-overlay {
		position: fixed;
		inset: 0;
		background: rgba(10, 20, 16, 0.55);
		z-index: 600;
		display: flex;
		align-items: center;
		justify-content: center;
		backdrop-filter: blur(6px);
		-webkit-backdrop-filter: blur(6px);
		animation: overlay-fade 0.25s ease both;
	}
	@keyframes overlay-fade {
		from { opacity: 0; }
		to   { opacity: 1; }
	}
	.popup-sheet {
		background: var(--surf);
		border-radius: 20px;
		padding: 22px 24px;
		width: 92%;
		max-width: 460px;
		font-family: 'Tajawal', sans-serif;
		direction: rtl;
		animation: popup-pop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) both;
		box-shadow: 0 20px 60px rgba(10, 20, 16, 0.22), 0 0 0 1px rgba(42, 157, 98, 0.08);
	}
	@keyframes popup-pop {
		from { opacity: 0; transform: scale(0.92); }
		to   { opacity: 1; transform: scale(1); }
	}
	.popup-handle {
		width: 36px;
		height: 4px;
		background: var(--line);
		border-radius: 2px;
		margin: 0 auto 16px;
		opacity: 0.7;
	}
	.popup-icon-wrap {
		width: 46px;
		height: 46px;
		border-radius: 13px;
		background: linear-gradient(145deg, var(--g-soft) 0%, var(--g-mid) 100%);
		display: flex;
		align-items: center;
		justify-content: center;
		margin-bottom: 14px;
		box-shadow: 0 2px 8px rgba(42, 157, 98, 0.12);
	}
	.popup-title {
		font-family: 'El Messiri', 'Tajawal', serif;
		font-size: 19px;
		font-weight: 700;
		color: var(--ink);
		margin: 0 0 4px;
		line-height: 1.3;
	}
	.popup-sub {
		font-size: 12.5px;
		color: var(--muted);
		margin: 0 0 16px;
		line-height: 1.65;
	}
	.popup-label {
		font-size: 11px;
		font-weight: 700;
		color: var(--muted);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		margin-bottom: 6px;
	}
	.popup-meal-name {
		background: var(--warm);
		border: 1px solid var(--line);
		border-radius: 11px;
		padding: 11px 14px;
		font-size: 13.5px;
		font-weight: 700;
		color: var(--ink);
		margin-bottom: 16px;
		display: flex;
		align-items: center;
		gap: 9px;
	}
	.popup-meal-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--g);
		flex-shrink: 0;
		box-shadow: 0 0 0 3px rgba(42, 157, 98, 0.15);
	}
	.popup-textarea {
		width: 100%;
		border: 1.5px solid var(--line);
		border-radius: 12px;
		padding: 12px 14px;
		font-size: 13.5px;
		font-family: 'Tajawal', sans-serif;
		resize: vertical;
		min-height: 88px;
		outline: none;
		color: var(--ink);
		box-sizing: border-box;
		direction: rtl;
		transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
		background: var(--warm);
	}
	.popup-textarea::placeholder { color: var(--muted2); opacity: 0.7; }
	.popup-textarea:focus {
		border-color: var(--g);
		background: #fff;
		box-shadow: 0 0 0 3px rgba(42, 157, 98, 0.1), 0 2px 8px rgba(42, 157, 98, 0.06);
	}
	.popup-actions {
		display: flex;
		gap: 10px;
		margin-top: 18px;
	}
	.popup-cancel {
		flex: 1;
		padding: 13px;
		border-radius: 12px;
		border: 1.5px solid var(--line);
		background: var(--surf);
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
		font-family: 'Tajawal', sans-serif;
		color: var(--muted);
		transition: all 0.15s;
	}
	.popup-cancel:hover { border-color: var(--muted2); background: #f4f6f5; }
	.popup-save {
		flex: 2;
		padding: 13px;
		border-radius: 12px;
		border: none;
		background: linear-gradient(135deg, var(--g) 0%, var(--g2) 100%);
		color: #fff;
		font-size: 13.5px;
		font-weight: 700;
		cursor: pointer;
		font-family: 'Tajawal', sans-serif;
		transition: all 0.2s;
		box-shadow: 0 4px 14px rgba(42, 157, 98, 0.28);
	}
	.popup-save:hover { box-shadow: 0 6px 22px rgba(42, 157, 98, 0.38); transform: translateY(-1px); }
	.popup-save:disabled { opacity: 0.55; cursor: wait; transform: none; box-shadow: none; }

	/* ─── FINISH MODAL ─── */
	.modal-overlay {
		position: fixed;
		inset: 0;
		background: rgba(15, 23, 42, 0.45);
		z-index: 500;
		display: flex;
		align-items: center;
		justify-content: center;
		backdrop-filter: blur(3px);
	}
	.modal {
		background: #fff;
		border-radius: 22px;
		padding: 30px 24px;
		max-width: 380px;
		width: 92%;
		text-align: center;
		font-family: 'Tajawal', sans-serif;
		direction: rtl;
		animation: modal-pop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) both;
	}
	@keyframes modal-pop {
		from { opacity: 0; transform: scale(0.92); }
		to   { opacity: 1; transform: scale(1); }
	}
	.modal-icon-wrap {
		width: 56px;
		height: 56px;
		margin: 0 auto 16px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--g-soft);
		border: 2px solid var(--g-mid);
	}
	.modal-title {
		font-family: 'El Messiri', 'Tajawal', serif;
		font-size: 20px;
		font-weight: 700;
		color: var(--ink);
		margin: 0 0 8px;
	}
	.modal-sub { font-size: 13px; color: var(--muted); margin: 0 0 16px; line-height: 1.65; }
	.adherence-ring-wrap { display: flex; justify-content: center; margin-bottom: 16px; }
	.modal-actions { display: flex; gap: 8px; }
	.modal-cancel {
		flex: 1; padding: 12px; border-radius: 12px;
		border: 1.5px solid var(--line); background: #fff;
		font-size: 13px; font-weight: 600; cursor: pointer;
		font-family: 'Tajawal', sans-serif; color: var(--muted);
		transition: 0.15s;
	}
	.modal-cancel:hover { border-color: var(--muted2); background: #f9fafb; }
	.modal-confirm {
		flex: 2; padding: 12px; border-radius: 12px; border: none;
		background: linear-gradient(135deg, var(--g), var(--g2));
		color: #fff; font-size: 14px; font-weight: 700;
		cursor: pointer; font-family: 'Tajawal', sans-serif;
		box-shadow: 0 4px 14px rgba(42,157,98,.3);
		transition: 0.15s;
	}
	.modal-confirm:hover { box-shadow: 0 6px 20px rgba(42,157,98,.4); transform: translateY(-1px); }
	.modal-confirm:disabled { opacity: 0.7; cursor: wait; transform: none; }

	/* ─── EMPTY STATE ─── */
	.empty-state {
		text-align: center;
		padding: 48px 24px;
		margin: 12px 14px;
		background: var(--surf);
		border-radius: var(--radius);
		border: 1px solid var(--line);
	}
	.empty-art { margin-bottom: 14px; display: flex; justify-content: center; }
	.empty-title { font-family: 'El Messiri', 'Tajawal', serif; font-size: 18px; font-weight: 700; color: var(--ink); margin: 0 0 8px; }
	.empty-sub { font-size: 13px; color: var(--muted); line-height: 1.65; margin: 0; }

	/* ─── TOAST ─── */
	.toast {
		position: fixed;
		bottom: calc(80px + env(safe-area-inset-bottom, 0px));
		right: 14px;
		left: 14px;
		max-width: 420px;
		margin: 0 auto;
		padding: 13px 18px;
		border-radius: 14px;
		font-size: 13.5px;
		font-family: 'Tajawal', sans-serif;
		z-index: 9999;
		box-shadow: 0 6px 24px rgba(15, 23, 42, 0.2);
		direction: rtl;
		text-align: center;
		animation: toast-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) both;
	}
	@keyframes toast-in {
		from { opacity: 0; transform: translateY(12px) scale(0.96); }
		to   { opacity: 1; transform: translateY(0) scale(1); }
	}
	.toast-error   { background: #dc2626; color: #fff; }
	.toast-success { background: linear-gradient(135deg, var(--g), var(--g2)); color: #fff; }

	/* ─── DESKTOP: use screen real estate ─── */
	@media (min-width: 901px) {
		.pdash {
			max-width: 960px;
			padding: 0 28px 32px;
		}
		.hero {
			margin-inline: -28px;
			border-radius: 0 0 18px 18px;
			padding: 28px 32px 36px;
		}
		.week-nav {
			margin-inline: -28px;
		}
		.section {
			margin-inline: 0;
		}
		.sections-grid {
			display: grid;
			grid-template-columns: 1fr 1fr;
			gap: 16px;
			margin-top: 16px;
		}
		.sections-grid > .section {
			margin-top: 0 !important;
		}
		.rec-card {
			margin-inline: 0;
			margin-top: 16px;
		}
		.meals-heading {
			padding-inline: 0;
		}
		.meals-grid {
			display: grid;
			grid-template-columns: 1fr 1fr;
			gap: 14px;
		}
		.meals-grid > .meal-card {
			margin: 0;
		}
		.finish-wrap {
			padding-inline: 0;
			margin-top: 4px;
		}
		.macro-gauge {
			padding: 14px 8px 10px;
		}
		.gauge-svg {
			width: 90px;
			height: 90px;
		}
		.gauge-val {
			font-size: 12px;
		}
		.gauge-label {
			font-size: 10px;
		}
		.empty-state {
			margin-inline: 0;
		}
	}

	@media (max-width: 360px) {
		.meal-macros { flex-wrap: wrap; gap: 6px; }
		.macro-row { gap: 6px; }
		.hero-name { font-size: 22px; }
		.cal-eaten { font-size: 32px; }
	}
</style>

<div class="pdash">
	<!-- Hero Header -->
	<div class="hero">
		<div class="hero-inner">
			<div class="hero-greeting">{greeting()} · {todayName()} {today === realToday ? '— اليوم' : ''}</div>
			<div class="hero-name">{data.patient?.name ?? 'المريض'}</div>
			<div class="hero-date">{today}</div>
			{#if dayCompleted}
				<div class="hero-completed-badge">
					<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
					تم إنهاء اليوم بنجاح
				</div>
			{/if}
		</div>
	</div>

	<!-- Week Strip -->
	<div class="week-nav">
		<a
			class="week-arrow"
			class:is-disabled={!canGoPrevWeek}
			href={canGoPrevWeek ? `?date=${prevWeekDate}` : undefined}
			aria-label="الأسبوع السابق"
			aria-disabled={!canGoPrevWeek}
		>
			<svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg>
		</a>
		<div class="week-strip">
			{#each data.weekDates as wd}
				{@const d = new Date(wd + 'T00:00:00')}
				{@const isActive = wd === today}
				{@const isToday = wd === realToday}
				{@const hasData = data.trackedDates?.includes(wd)}
				{@const isAllowed = isDateNavigable(wd)}
				<a
					href={isAllowed ? `?date=${wd}` : undefined}
					class="week-day"
					class:active={isActive}
					class:is-today={isToday}
					class:has-data={hasData}
					class:is-disabled={!isAllowed}
					aria-label="{DAYS_W[d.getDay()]} {d.getDate()}"
					aria-disabled={!isAllowed}
				>
					<span style="font-size:8.5px; opacity:0.75;">{DAYS_W[d.getDay()]}</span>
					<span class="week-day-num">{d.getDate()}</span>
					<span class="day-pip"></span>
				</a>
			{/each}
		</div>
		<a
			class="week-arrow"
			class:is-disabled={!canGoNextWeek}
			href={canGoNextWeek ? `?date=${nextWeekDate}` : undefined}
			aria-label="الأسبوع التالي"
			aria-disabled={!canGoNextWeek}
		>
			<svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>
		</a>
	</div>

	<!-- Progress + Water grid wrapper (side-by-side on desktop) -->
	<div class="sections-grid">

	<!-- Progress Section -->
	{#if totalTarget > 0}
		<div class="section" style="margin-top:12px;">
			<div class="section-header">
				<span class="section-label">التقدم اليومي</span>
				<span class="cal-pct-badge">{caloriesPct}%</span>
			</div>
			<div class="section-body">
				<div class="cal-row">
					<div style="display:flex; align-items:flex-end; gap:2px;">
						<span class="cal-eaten">{Math.round(eatenCalories)}</span>
						<span class="cal-unit">سعرة</span>
					</div>
					<span class="cal-target">/ {totalTarget} سعرة</span>
				</div>
				<div class="pbar-track">
					<div class="pbar-fill" style="width:{caloriesPct}%;"></div>
				</div>
				<div class="macro-row">
					<!-- Carbs gauge -->
					<div class="macro-gauge">
						<svg width="80" height="80" viewBox="0 0 80 80" class="gauge-svg">
							<circle cx="40" cy="40" r="34" fill="none" stroke="#f1f5f9" stroke-width="7"/>
							{#if carbPct > 0}
								<path d={arcPath(carbPct)} fill="none" stroke="#f59e0b" stroke-width="7" stroke-linecap="round"/>
							{/if}
							<text x="40" y="43" text-anchor="middle" font-size="13" font-weight="800" fill="#0f172a" font-family="Tajawal, sans-serif">{Math.round(eatenCarbs)}g</text>
						</svg>
						<div class="gauge-val" style="color:#d97706;">{carbPct}%</div>
						<div class="gauge-label">كارب / {macroTargets().carbG}g</div>
					</div>
					<!-- Protein gauge -->
					<div class="macro-gauge">
						<svg width="80" height="80" viewBox="0 0 80 80" class="gauge-svg">
							<circle cx="40" cy="40" r="34" fill="none" stroke="#f1f5f9" stroke-width="7"/>
							{#if protPct > 0}
								<path d={arcPath(protPct)} fill="none" stroke="#7c3aed" stroke-width="7" stroke-linecap="round"/>
							{/if}
							<text x="40" y="43" text-anchor="middle" font-size="13" font-weight="800" fill="#0f172a" font-family="Tajawal, sans-serif">{Math.round(eatenProtein)}g</text>
						</svg>
						<div class="gauge-val" style="color:#7c3aed;">{protPct}%</div>
						<div class="gauge-label">بروتين / {macroTargets().protG}g</div>
					</div>
					<!-- Fat gauge -->
					<div class="macro-gauge">
						<svg width="80" height="80" viewBox="0 0 80 80" class="gauge-svg">
							<circle cx="40" cy="40" r="34" fill="none" stroke="#f1f5f9" stroke-width="7"/>
							{#if fatPct > 0}
								<path d={arcPath(fatPct)} fill="none" stroke="#0ea5e9" stroke-width="7" stroke-linecap="round"/>
							{/if}
							<text x="40" y="43" text-anchor="middle" font-size="13" font-weight="800" fill="#0f172a" font-family="Tajawal, sans-serif">{Math.round(eatenFat)}g</text>
						</svg>
						<div class="gauge-val" style="color:#0ea5e9;">{fatPct}%</div>
						<div class="gauge-label">دهون / {macroTargets().fatG}g</div>
					</div>
				</div>
			</div>
		</div>
	{:else}
		<div class="section" style="margin-top:12px;">
			<div class="section-body" style="padding-top:14px;">
				<div style="font-size:13px; color:var(--muted); text-align:center;">لم يتم تحديد أهداف غذائية بعد</div>
			</div>
		</div>
	{/if}

	<!-- Water Tracker -->
	<div class="section">
		<div class="section-header">
			<span class="section-label">الماء</span>
			<span style="font-size:11px; color:var(--muted2);">كل كوب = 250 مل</span>
		</div>
		<div class="section-body">
			<div class="water-header">
				<span style="font-size:22px; font-weight:800; color:var(--ink);">{waterCups} <span style="font-size:14px; color:var(--muted2); font-weight:500;">/ 8</span></span>
				<span style="font-size:12px; font-weight:700; padding:3px 11px; border-radius:999px; background:{waterCups >= 8 ? 'var(--g-soft)' : '#f1f5f9'}; color:{waterCups >= 8 ? 'var(--g-text)' : 'var(--muted)'};">
					{waterCups >= 8 ? 'تم الهدف' : `${8 - waterCups} متبقي`}
				</span>
			</div>
			<div class="water-drops">
				{#each Array(8) as _, i}
					{@const filled = i < waterCups}
					<button
						type="button"
						class="drop-btn"
						onclick={() => updateWater(filled ? i : i + 1)}
						aria-label={filled ? 'إزالة كوب' : 'إضافة كوب'}
						disabled={dayCompleted}
					>
						<svg class="drop-svg" viewBox="0 0 30 36" fill="none" xmlns="http://www.w3.org/2000/svg">
							<path d="M15 2C15 2 3 13.5 3 22C3 28.627 8.373 34 15 34C21.627 34 27 28.627 27 22C27 13.5 15 2 15 2Z"
								fill="{filled ? '#0ea5e9' : '#e2e8f0'}"
								stroke="{filled ? '#0284c7' : '#cbd5e1'}"
								stroke-width="1.5"
							/>
							{#if filled}
								<path d="M10 26C10 26 11 29 15 29C19 29 20 26 20 26" stroke="rgba(255,255,255,0.6)" stroke-width="1.5" stroke-linecap="round"/>
							{/if}
						</svg>
					</button>
				{/each}
			</div>
			{#if !dayCompleted}
				<div class="water-actions-row">
					<button class="water-btn-add" onclick={() => updateWater(waterCups + 1)} disabled={waterCups >= 8}>
						<svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>
						شربت كوب
					</button>
					<button class="water-btn-reset" onclick={() => updateWater(0)}>إعادة تعيين</button>
				</div>
			{/if}
		<div class="water-note" class:done={waterCups >= 8}>
		{#if waterCups >= 8}
			رائع! وصلت لهدفك المائي اليوم
		{:else if waterCups === 0}
			ابدأ يومك بكوب ماء
		{:else}
				{waterCups} / 8 أكواب · {8 - waterCups} {8 - waterCups === 1 ? 'كوب' : 'أكواب'} متبقية
			{/if}
		</div>
		</div>
	</div>

	</div><!-- /sections-grid -->

	<!-- Recommendation -->
	{#if data.recommendation}
		<div class="rec-card">
			<div class="rec-header">
				<div class="rec-icon">
					<svg width="12" height="12" fill="none" stroke="#92400e" stroke-width="2.2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg>
				</div>
				توصيات الأخصائي
			</div>
			<div class="rec-text">{data.recommendation}</div>
		</div>
	{/if}

	<!-- Meal Cards -->
	<div class="meals-heading">
		<span class="meals-label">وجبات اليوم</span>
		{#if data.todayMeals.length > 0}
			<span class="meals-count-badge">{eatenCount}/{totalMeals} مكتمل</span>
		{/if}
	</div>

	{#if data.todayMeals.length === 0}
		<div class="empty-state">
			<div class="empty-art">
				<svg width="48" height="48" fill="none" stroke="var(--muted2)" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
			</div>
			<div class="empty-title">لا توجد وجبات لهذا اليوم</div>
			<p class="empty-sub">اختر يوماً آخر من الشريط العلوي، أو انتظر حتى يضيف أخصائيك خطتك الغذائية وينشرها.</p>
		</div>
	{:else}
		<div class="meals-grid">
		{#each data.todayMeals as item, idx}
			{@const st = mealStatuses[item.meal.id]}
			{@const theme = mealTheme(item.meal.mealType)}
			{@const mealName = item.recipeName ?? item.supplementName ?? item.foodName ?? (item as any).aiMealName ?? '—'}
			{@const imgUrl = item.recipeImageUrl ?? (item as any).foodImageUrl ?? null}
			{@const hasIngredients = Array.isArray((item as any).aiIngredients) && (item as any).aiIngredients.length > 0}
			{@const ingExpanded = expandedIngredients.has(item.meal.id)}
			{@const mealSteps = (item as any).steps as string | null}
			{@const stepsExpanded = expandedSteps.has(item.meal.id)}
			<div
				class="meal-card"
				class:status-eaten={st === 'eaten'}
				class:status-skipped={st === 'skipped' && !item.replacementNote}
				class:status-replaced={st === 'skipped' && item.replacementNote}
				style="animation-delay: {idx * 60}ms"
			>
				<div class="meal-top">
					<div class="meal-icon-col">
						{#if imgUrl}
							<img src={imgUrl} alt="" class="meal-thumb" />
						{:else}
							<div class="meal-emoji-wrap" style="background:{theme.gradient};"></div>
						{/if}
						{#if st === 'eaten'}
							<div class="status-badge-corner badge-eaten">✓</div>
						{:else if st === 'skipped' && !item.replacementNote}
							<div class="status-badge-corner badge-skipped">✕</div>
						{:else if st === 'skipped' && item.replacementNote}
							<div class="status-badge-corner badge-replaced">↔</div>
						{/if}
					</div>

					<div class="meal-content">
						<div class="meal-type-chip" style="background:{theme.gradient}; color:{theme.accent};">{getMealLabel(item.meal.mealType)}</div>
						<div class="meal-name-row">
							<div class="meal-name">{mealName}</div>
						</div>
						<div class="meal-kcal">{Math.round(item.calories)} سعرة حرارية</div>
						<div class="meal-macros">
							<span class="macro-chip">
								<span class="macro-dot" style="background:#f59e0b;"></span>
								<span>{Math.round(item.carbs)}g كارب</span>
							</span>
							<span class="macro-chip">
								<span class="macro-dot" style="background:#a855f7;"></span>
								<span>{Math.round(item.protein)}g بروتين</span>
							</span>
							<span class="macro-chip">
								<span class="macro-dot" style="background:#0ea5e9;"></span>
								<span>{Math.round(item.fat)}g دهون</span>
							</span>
						</div>
					</div>
				</div>

				<!-- Ingredients toggle -->
				{#if hasIngredients}
					<button class="ing-toggle" onclick={() => toggleIngredients(item.meal.id)}>
						<span>المكونات ({(item as any).aiIngredients.length})</span>
						<svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24" style="transform:rotate({ingExpanded ? 180 : 0}deg); transition:0.2s;">
							<path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/>
						</svg>
					</button>
					{#if ingExpanded}
						<div class="ing-list">
							{#each (item as any).aiIngredients as ing}
								<div class="ing-row">
									<span class="ing-name">{ing.name_ar ?? ing.name ?? '—'}</span>
									<span class="ing-qty">{ing.quantity}{ing.unit}</span>
									<span class="ing-kcal">{Math.round(ing.calories ?? 0)} kcal</span>
								</div>
							{/each}
						</div>
					{/if}
				{/if}

				<!-- Cooking steps toggle -->
				{#if mealSteps}
					<button class="steps-toggle" onclick={() => toggleSteps(item.meal.id)}>
						<span>طريقة التحضير</span>
						<svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24" style="transform:rotate({stepsExpanded ? 180 : 0}deg); transition:0.2s;">
							<path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/>
						</svg>
					</button>
					{#if stepsExpanded}
						<div class="steps-content">{mealSteps}</div>
					{/if}
				{/if}

				<!-- Replacement note -->
				{#if item.replacementNote && st === 'skipped'}
					<div class="replace-note">
						<span class="replace-note-icon">
						<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
					</span>
						<span><strong>البديل:</strong> {item.replacementNote}</span>
					</div>
				{/if}

				<!-- Action buttons -->
				{#if !dayCompleted}
					<div class="meal-actions">
						<button
							class="act-btn act-eat"
							class:on={st === 'eaten'}
							onclick={() => setMealStatus(item.meal.id, st === 'eaten' ? 'not_eaten' : 'eaten')}
						>
							<svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5">
								<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
							</svg>
							{st === 'eaten' ? 'أكلتها ✓' : 'أكلتها'}
						</button>
						<button
							class="act-btn act-skip"
							class:on={st === 'skipped' && !item.replacementNote}
							onclick={() => setMealStatus(item.meal.id, st === 'skipped' ? 'not_eaten' : 'skipped')}
						>
							<svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5">
								<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
							</svg>
							تخطيت
						</button>
						<button
							class="act-btn act-replace"
							class:on={st === 'skipped' && !!item.replacementNote}
							onclick={() => openReplace(item.meal.id, mealName)}
						>
							<svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5">
								<path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
							</svg>
							استبدلت
						</button>
					</div>
				{/if}
			</div>
		{/each}
		</div><!-- /meals-grid -->
	{/if}

	<!-- Finish Day -->
	{#if data.todayMeals.length > 0}
		<div class="finish-wrap">
			{#if dayCompleted}
				<button class="finish-btn finish-done" disabled>
					✓ تم إنهاء اليوم · الالتزام {adherencePct}%
				</button>
			{:else}
				<button class="finish-btn finish-active" onclick={() => (showFinishModal = true)}>
					<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
					</svg>
					إنهاء اليوم وتسجيل التقدم
				</button>
			{/if}
		</div>
	{/if}

	<!-- Replace Popup -->
	{#if replacePopupOpen}
		<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
		<div class="popup-overlay" role="presentation" onclick={(e) => e.target === e.currentTarget && !replaceSaving && (replacePopupOpen = false)}>
			<div class="popup-sheet" role="dialog" aria-modal="true">
				<div class="popup-handle"></div>
				<div class="popup-icon-wrap">
					<svg width="22" height="22" fill="none" stroke="var(--g-text)" stroke-width="2" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
					</svg>
				</div>
				<p class="popup-title">ماذا أكلت بدلها؟</p>
				<p class="popup-sub">سيُرسَل هذا للأخصائي لمتابعة تقدمك</p>
				<div class="popup-label">الوجبة الأصلية</div>
				<div class="popup-meal-name">
					<span class="popup-meal-dot"></span>
					{replaceMealName}
				</div>
				<div class="popup-label">ماذا أكلت بدلاً منها؟</div>
				<textarea
					class="popup-textarea"
					placeholder="مثال: أكلت شاورما دجاج مع سلطة خضراء…"
					bind:value={replaceNote}
					rows="3"
				></textarea>
				<div class="popup-actions">
					<button class="popup-cancel" onclick={() => (replacePopupOpen = false)} disabled={replaceSaving}>إلغاء</button>
					<button class="popup-save" onclick={saveReplacement} disabled={replaceSaving}>
						{replaceSaving ? 'جاري الحفظ…' : 'حفظ وإرسال'}
					</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- Finish Day Modal -->
	{#if showFinishModal}
		<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
		<div class="modal-overlay" role="presentation" onclick={(e) => e.target === e.currentTarget && (showFinishModal = false)}>
			<div class="modal">
				<div class="modal-icon-wrap">
					<svg width="24" height="24" fill="none" stroke="var(--g-text)" stroke-width="2" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
					</svg>
				</div>
				<h2 class="modal-title">إنهاء اليوم</h2>
				<p class="modal-sub">أكلت {eatenCount} من {totalMeals} وجبات — الالتزام {adherencePct}%</p>
				<div class="adherence-ring-wrap">
					<svg width="80" height="80" viewBox="0 0 80 80">
						<circle cx="40" cy="40" r="34" fill="none" stroke="#f1f5f9" stroke-width="7"/>
						{#if adherencePct > 0}
							<path d={arcPath(adherencePct)} fill="none"
								stroke={adherencePct >= 80 ? '#22c55e' : adherencePct >= 50 ? '#f59e0b' : '#ef4444'}
								stroke-width="7" stroke-linecap="round"/>
						{/if}
						<text x="40" y="45" text-anchor="middle" font-size="15" font-weight="800"
							fill={adherencePct >= 80 ? '#15803d' : adherencePct >= 50 ? '#d97706' : '#b91c1c'}
							font-family="Tajawal, sans-serif">{adherencePct}%</text>
					</svg>
				</div>
				<div class="modal-actions">
					<button class="modal-cancel" onclick={() => (showFinishModal = false)}>رجوع</button>
					<button class="modal-confirm" onclick={finishDay} disabled={isSubmitting}>
						{isSubmitting ? 'جاري الحفظ…' : 'تأكيد إنهاء اليوم'}
					</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- Toast -->
	{#if toastMsg}
		<div class="toast" class:toast-error={toastType === 'error'} class:toast-success={toastType === 'success'}>
			{toastMsg}
		</div>
	{/if}
</div>
