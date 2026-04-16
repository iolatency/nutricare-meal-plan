<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';
	import { resolveBuilderConfigForDate } from '$lib/meal-plan/builder-config';
	import { DAYS_W } from '$lib/meal-plan/constants';
	import { formatArFullDate, formatArRange } from '$lib/date/ar-format';
	import { toLocalYmd } from '$lib/date/local-ymd';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let weightInput = $state('');
	let weightError = $state('');
	let weightSuccess = $state(false);

	$effect(() => {
		if (form?.success) {
			weightInput = '';
			weightSuccess = true;
			setTimeout(() => (weightSuccess = false), 2500);
		}
		if (form?.error) weightError = form.error as string;
	});

	const cfg = $derived(resolveBuilderConfigForDate(data.builderConfig, data.today));
	const targetCal = $derived(cfg.targetCalories ?? 0);

	const latestWeight = $derived(
		data.weightLogs.length > 0
			? data.weightLogs[data.weightLogs.length - 1].weight
			: (data.todayLog?.weight ?? null)
	);
	const firstWeight = $derived(data.weightLogs.length > 0 ? data.weightLogs[0].weight : null);
	const prevWeight = $derived(data.weightLogs.length > 1 ? data.weightLogs[data.weightLogs.length - 2].weight : null);
	const weightDelta = $derived(latestWeight && prevWeight ? latestWeight - prevWeight : null);
	const totalWeightChange = $derived(latestWeight && firstWeight && data.weightLogs.length > 1 ? latestWeight - firstWeight : null);

	// ─── Global week navigation (controls all charts) ───
	let hoveredDot = $state<number | null>(null);

	function snapToSubscriptionPeriod(dateStr: string, baseDate: string) {
		const base = new Date(baseDate + 'T00:00:00');
		const d = new Date(dateStr + 'T00:00:00');
		const diffDays = Math.floor((d.getTime() - base.getTime()) / 86400000);
		const periodOffset = Math.floor(diffDays / 7) * 7;
		const anchor = new Date(base);
		anchor.setDate(base.getDate() + periodOffset);
		return toLocalYmd(anchor);
	}

	function shiftDays(ymd: string, days: number) {
		const d = new Date(ymd + 'T00:00:00');
		d.setDate(d.getDate() + days);
		return toLocalYmd(d);
	}

	const sessionStart = $derived(data.session?.startDate ?? data.today);
	const sessionEnd = $derived(data.session?.endDate ?? data.today);
	const weekAnchorBase = $derived(sessionStart);

	let viewWeekAnchor = $state<string>('');
	$effect(() => {
		// Initialize/reset to the current period for today (or clamp inside the session).
		const base = weekAnchorBase;
		const start = data.session ? snapToSubscriptionPeriod(data.today, base) : data.today;
		viewWeekAnchor = start;
		hoveredDot = null;
	});

	const minWeekAnchor = $derived(data.session ? snapToSubscriptionPeriod(sessionStart, weekAnchorBase) : data.today);
	const maxWeekAnchor = $derived(data.session ? snapToSubscriptionPeriod(sessionEnd, weekAnchorBase) : data.today);
	const todayWeekAnchor = $derived(data.session ? snapToSubscriptionPeriod(data.today, weekAnchorBase) : data.today);

	const canGoNewer = $derived(data.session ? viewWeekAnchor < maxWeekAnchor : false);
	const canGoOlder = $derived(data.session ? viewWeekAnchor > minWeekAnchor : false);

	function weekForward() {
		if (!data.session) return;
		const next = snapToSubscriptionPeriod(shiftDays(viewWeekAnchor, 7), weekAnchorBase);
		if (next > maxWeekAnchor) return;
		viewWeekAnchor = next;
		hoveredDot = null;
	}
	function weekBack() {
		if (!data.session) return;
		const prev = snapToSubscriptionPeriod(shiftDays(viewWeekAnchor, -7), weekAnchorBase);
		if (prev < minWeekAnchor) return;
		viewWeekAnchor = prev;
		hoveredDot = null;
	}

	function computeWeekDates(anchorYmd: string) {
		const start = new Date(anchorYmd + 'T00:00:00');
		const dates: string[] = [];
		for (let i = 0; i < 7; i++) {
			const d = new Date(start);
			d.setDate(d.getDate() + i);
			dates.push(toLocalYmd(d));
		}
		return dates;
	}

	const weekDates = $derived(computeWeekDates(data.session ? viewWeekAnchor : data.today));
	const weekLabel = $derived(formatArRange(weekDates[0], weekDates[6]));

	// ─── Adherence data for selected week ───
	const logsByDate = $derived(new Map((data.allLogs ?? []).map((l) => [l.date, l])));

	const weeklyAdherence = $derived(weekDates.map((d) => {
		const log = logsByDate.get(d);
		const dayOfWeek = new Date(d + 'T00:00:00').getDay();
		return { date: d, label: DAYS_W[dayOfWeek], score: (log?.adherenceScore as number | null) ?? null };
	}));

	const adherenceMax = $derived(() => {
		const scores = weeklyAdherence.map((d) => d.score ?? 0);
		return Math.max(100, ...scores);
	});

	const adherenceScored = $derived(weeklyAdherence.filter((d) => d.score !== null));
	const adherenceWeekAvg = $derived(
		adherenceScored.length > 0
			? Math.round(adherenceScored.reduce((s, d) => s + (d.score ?? 0), 0) / adherenceScored.length)
			: 0
	);

	// ─── Water data for selected week ───
	const waterHistory = $derived(weekDates.map((d) => {
		const log = logsByDate.get(d);
		const dayOfWeek = new Date(d + 'T00:00:00').getDay();
		return { date: d, label: DAYS_W[dayOfWeek], cups: (log?.waterCups as number) ?? 0 };
	}));

	const hasAnyWater = $derived(waterHistory.some((d) => d.cups > 0));
	const waterAvgPerDay = $derived(() => {
		const total = waterHistory.reduce((s, d) => s + d.cups, 0);
		const withData = waterHistory.filter((d) => d.cups > 0).length;
		return withData > 0 ? Math.round((total / withData) * 10) / 10 : 0;
	});

	// ─── Daily nutrition for selected week ───
	const nutritionByDate = $derived(new Map((data.dailyNutrition ?? []).map((n) => [n.date, n])));
	const weekNutrition = $derived(weekDates.map((d) => {
		const n = nutritionByDate.get(d);
		const dayOfWeek = new Date(d + 'T00:00:00').getDay();
		return {
			date: d,
			label: DAYS_W[dayOfWeek],
			calories: n?.calories ?? 0,
			protein: n?.protein ?? 0,
			carbs: n?.carbs ?? 0,
			fat: n?.fat ?? 0
		};
	}));

	const hasAnyNutrition = $derived(weekNutrition.some((d) => d.calories > 0));
	const nutritionMax = $derived(() => Math.max(1, ...weekNutrition.map((d) => d.calories)));
	const nutritionAvg = $derived(() => {
		const withData = weekNutrition.filter((d) => d.calories > 0);
		if (withData.length === 0) return { calories: 0, protein: 0, carbs: 0, fat: 0 };
		return {
			calories: Math.round(withData.reduce((s, d) => s + d.calories, 0) / withData.length),
			protein: Math.round(withData.reduce((s, d) => s + d.protein, 0) / withData.length),
			carbs: Math.round(withData.reduce((s, d) => s + d.carbs, 0) / withData.length),
			fat: Math.round(withData.reduce((s, d) => s + d.fat, 0) / withData.length)
		};
	});

	// ─── Weight chart for selected week ───
	const weekDateSet = $derived(new Set(weekDates));
	const pagedWeightLogs = $derived(() => {
		return data.weightLogs.filter((l) => weekDateSet.has(l.date));
	});

	const CW = 440, CH = 120, CPAD = 28, CPAD_B = 22;
	const chartPoints = $derived(() => {
		const logs = pagedWeightLogs();
		if (logs.length < 2) return { path: '', area: '', dots: [] as { x: number; y: number; w: number; date: string }[], labels: [] as { x: number; text: string }[] };
		const weights = logs.map((l) => l.weight);
		const minW = Math.min(...weights) - 0.5;
		const maxW = Math.max(...weights) + 0.5;
		const range = maxW - minW || 1;
		const n = logs.length;
		const drawW = CW - CPAD * 2;
		const drawH = CH - CPAD - CPAD_B;
		const pts = logs.map((l, i) => {
			const x = CPAD + (i / (n - 1)) * drawW;
			const y = CPAD + drawH - ((l.weight - minW) / range) * drawH;
			return { x, y, w: l.weight, date: l.date };
		});
		const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
		const lastPt = pts[pts.length - 1];
		const firstPt = pts[0];
		const area = `${path} L ${lastPt.x.toFixed(1)} ${(CPAD + drawH).toFixed(1)} L ${firstPt.x.toFixed(1)} ${(CPAD + drawH).toFixed(1)} Z`;

		const labels = pts.map((p) => ({
			x: p.x,
			text: p.date.slice(5)
		}));

		return { path, area, dots: pts, labels };
	});
</script>

<svelte:head><title>الرئيسية — نيوتريكير</title></svelte:head>

<style>
	.home {
		--g: #2a9d62;
		--g2: #34b872;
		--g-soft: #e6f4eb;
		--g-mid: #c3e8d4;
		--g-text: #1a7a4a;
		--ink: #121816;
		--ink2: #1e293b;
		--muted: #5a635e;
		--muted2: #8b909a;
		--line: #e4e9e4;
		--surf: #ffffff;
		--warm: #faf9f6;
		--radius: 14px;
		--shadow: 0 2px 12px rgba(18, 24, 22, 0.05);
		--shadow2: 0 4px 20px rgba(18, 24, 22, 0.07);
		font-family: 'Tajawal', sans-serif;
		direction: rtl;
		max-width: 520px;
		margin: 0 auto;
		padding: 16px 16px 24px;
	}

	/* ─── GREETING ─── */
	.greeting { margin-bottom: 20px; }
	.greeting h2 {
		margin: 0;
		font-size: 21px;
		font-weight: 800;
		color: var(--ink);
		font-family: 'El Messiri', 'Tajawal', serif;
	}
	.greeting p {
		margin: 3px 0 0;
		font-size: 12px;
		color: var(--muted);
	}

	/* ─── STAT CHIPS (top row) ─── */
	.stat-chips {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 8px;
		margin-bottom: 14px;
	}
	.chip {
		background: var(--surf);
		border: 1px solid var(--line);
		border-radius: 12px;
		padding: 12px 8px;
		text-align: center;
		box-shadow: var(--shadow);
		animation: chip-in 0.4s cubic-bezier(0.22, 1, 0.36, 1) both;
	}
	.chip:nth-child(2) { animation-delay: 0.06s; }
	.chip:nth-child(3) { animation-delay: 0.12s; }
	.chip:nth-child(4) { animation-delay: 0.18s; }
	@keyframes chip-in {
		from { opacity: 0; transform: translateY(8px); }
		to   { opacity: 1; transform: translateY(0); }
	}
	.chip-icon {
		font-size: 18px;
		line-height: 1;
		margin-bottom: 4px;
	}
	.chip-val {
		font-size: 20px;
		font-weight: 800;
		color: var(--ink);
		line-height: 1.1;
		font-family: 'El Messiri', 'Tajawal', serif;
		font-variant-numeric: tabular-nums;
	}
	.chip-val-unit {
		font-size: 11px;
		font-weight: 500;
		color: var(--muted);
		font-family: 'Tajawal', sans-serif;
	}
	.chip-lbl {
		font-size: 9.5px;
		color: var(--muted);
		margin-top: 2px;
		font-weight: 600;
	}

	/* ─── CARDS ─── */
	.card {
		background: var(--surf);
		border-radius: var(--radius);
		border: 1px solid var(--line);
		box-shadow: var(--shadow);
		padding: 18px;
		margin-bottom: 14px;
		animation: card-in 0.45s cubic-bezier(0.22, 1, 0.36, 1) both;
	}
	@keyframes card-in {
		from { opacity: 0; transform: translateY(10px); }
		to   { opacity: 1; transform: translateY(0); }
	}
	.card-title {
		font-size: 11px;
		font-weight: 700;
		color: var(--muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin: 0 0 14px;
		font-family: 'El Messiri', 'Tajawal', serif;
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.card-title-icon {
		width: 20px;
		height: 20px;
		border-radius: 6px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 11px;
		flex-shrink: 0;
	}

	/* ─── WEIGHT CHART CARD ─── */
	.weight-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		margin-bottom: 14px;
		flex-wrap: wrap;
		gap: 8px;
	}
	.weight-current {
		font-family: 'El Messiri', 'Tajawal', serif;
		font-size: 36px;
		font-weight: 800;
		color: var(--ink);
		line-height: 1;
		font-variant-numeric: tabular-nums;
	}
	.weight-unit { font-size: 14px; color: var(--muted); font-weight: 500; font-family: 'Tajawal', sans-serif; }
	.delta-badge {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 4px 10px;
		border-radius: 999px;
		font-size: 12px;
		font-weight: 700;
		margin-top: 6px;
		font-family: 'El Messiri', 'Tajawal', serif;
		font-variant-numeric: tabular-nums;
	}
	.delta-down { background: #ecfdf5; color: #059669; }
	.delta-up   { background: #fef2f2; color: #dc2626; }
	.delta-same { background: #f3f4f6; color: #6b7280; }
	.weight-total-change {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 11.5px;
		color: var(--muted);
		margin-top: 4px;
	}

	.chart-nav {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 14px;
		gap: 8px;
	}
	.chart-nav-btn {
		width: 32px;
		height: 32px;
		border-radius: 8px;
		border: 1.5px solid var(--line);
		background: var(--surf);
		color: var(--g);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: all 0.15s;
		flex-shrink: 0;
	}
	.chart-nav-btn:hover:not(:disabled) {
		background: var(--g-soft);
		border-color: var(--g-mid);
	}
	.chart-nav-btn:disabled {
		opacity: 0.3;
		cursor: default;
	}
	.chart-nav-label {
		font-size: 11px;
		font-weight: 700;
		color: var(--muted);
		font-family: 'El Messiri', 'Tajawal', serif;
		font-variant-numeric: tabular-nums;
		direction: ltr;
	}

	.chart-wrap {
		margin-bottom: 14px;
		overflow: hidden;
		border-radius: 10px;
		background: linear-gradient(180deg, #f8faf8 0%, #f0f5f1 100%);
		border: 1px solid var(--line);
		position: relative;
	}
	.chart-empty {
		padding: 32px 16px;
		text-align: center;
		color: var(--muted);
		font-size: 13px;
		line-height: 1.7;
	}
	.chart-empty-icon {
		width: 48px;
		height: 48px;
		background: var(--g-soft);
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		margin: 0 auto 10px;
	}

	.weight-form {
		display: flex;
		gap: 8px;
		align-items: stretch;
		flex-wrap: wrap;
	}
	.weight-input {
		flex: 1;
		padding: 10px 14px;
		border: 1.5px solid var(--line);
		border-radius: 10px;
		font-size: 14px;
		font-family: 'Tajawal', sans-serif;
		outline: none;
		direction: ltr;
		text-align: right;
		background: var(--warm);
		color: var(--ink);
		transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
		min-width: 100px;
	}
	.weight-input:focus { border-color: var(--g); background: #fff; box-shadow: 0 0 0 3px rgba(42,157,98,0.1); }
	.weight-btn {
		padding: 10px 18px;
		border-radius: 10px;
		border: none;
		background: linear-gradient(135deg, var(--g), var(--g2));
		color: #fff;
		font-size: 13px;
		font-weight: 700;
		cursor: pointer;
		font-family: 'Tajawal', sans-serif;
		transition: all 0.15s;
		box-shadow: 0 2px 8px rgba(42,157,98,0.2);
	}
	.weight-btn:hover { box-shadow: 0 4px 14px rgba(42,157,98,0.3); transform: translateY(-1px); }
	.msg-success { font-size: 12px; color: #059669; margin-top: 8px; text-align: center; font-weight: 600; }
	.msg-error   { font-size: 12px; color: #dc2626; margin-top: 8px; text-align: center; }

	/* ─── BAR CHARTS (adherence + water) ─── */
	.bar-chart {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: 6px;
		height: 100px;
		padding: 0 2px;
	}
	.bar-col {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		height: 100%;
		justify-content: flex-end;
	}
	.bar-fill-wrap {
		width: 100%;
		max-width: 28px;
		border-radius: 6px 6px 2px 2px;
		overflow: hidden;
		transition: height 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
	}
	.bar-inner {
		width: 100%;
		height: 100%;
		border-radius: 6px 6px 2px 2px;
	}
	.bar-val {
		font-size: 9px;
		font-weight: 700;
		color: var(--muted);
		font-family: 'El Messiri', 'Tajawal', serif;
		font-variant-numeric: tabular-nums;
	}
	.bar-label {
		font-size: 9.5px;
		color: var(--muted2);
		font-weight: 600;
	}
	.bar-target-line {
		position: relative;
		margin-top: 8px;
		padding-top: 8px;
		border-top: 1.5px dashed var(--line);
		display: flex;
		align-items: center;
		justify-content: space-between;
		font-size: 10px;
		color: var(--muted);
	}
	.bar-avg-badge {
		font-size: 10px;
		font-weight: 700;
		padding: 2px 8px;
		border-radius: 999px;
		font-family: 'El Messiri', 'Tajawal', serif;
		font-variant-numeric: tabular-nums;
	}

	/* ─── NUTRITION SUMMARY ─── */
	.legend-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
		display: inline-block;
	}
	.nutrition-summary {
		margin-top: 8px;
		padding-top: 8px;
		border-top: 1.5px dashed var(--line);
	}
	.nutrition-avg {
		display: flex;
		align-items: baseline;
		gap: 6px;
		margin-bottom: 8px;
	}
	.nutrition-avg-val {
		font-size: 20px;
		font-weight: 800;
		color: var(--ink);
		font-family: 'El Messiri', 'Tajawal', serif;
		font-variant-numeric: tabular-nums;
	}
	.nutrition-avg-lbl {
		font-size: 11px;
		color: var(--muted);
		font-weight: 600;
	}
	.nutrition-target-badge {
		margin-inline-start: auto;
		font-size: 10px;
		font-weight: 700;
		padding: 2px 8px;
		border-radius: 999px;
		background: #fef3c7;
		color: #92400e;
		font-family: 'El Messiri', 'Tajawal', serif;
		font-variant-numeric: tabular-nums;
	}
	.nutrition-macros {
		display: flex;
		gap: 12px;
		flex-wrap: wrap;
	}
	.nutrition-macro {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: 11px;
		font-weight: 600;
		color: var(--muted);
		font-variant-numeric: tabular-nums;
	}
	.no-plan {
		text-align: center;
		padding: 24px 0;
		color: var(--muted);
		font-size: 13px;
		line-height: 1.7;
	}

	/* ─── DESKTOP: two-column grid ─── */
	.cards-grid {
		display: flex;
		flex-direction: column;
	}
	@media (min-width: 901px) {
		.home {
			max-width: 960px;
			padding: 24px 28px 32px;
		}
		.stat-chips {
			gap: 12px;
		}
		.chip { padding: 14px 10px; }
		.chip-val { font-size: 24px; }
		.cards-grid {
			display: grid;
			grid-template-columns: 1fr 1fr;
			gap: 16px;
		}
		.cards-grid > .card { margin-bottom: 0; }
		.cards-grid > .card-full { grid-column: 1 / -1; }
		.greeting h2 { font-size: 24px; }
		.weight-current { font-size: 42px; }
		.bar-chart { height: 120px; }
	}

	@media (max-width: 420px) {
		.stat-chips { grid-template-columns: repeat(2, 1fr); gap: 6px; }
		.chip-val { font-size: 18px; }
		.chip-lbl { font-size: 8.5px; }
		.bar-chart { gap: 4px; }
	}
</style>

<div class="home">
	<!-- Greeting -->
	<div class="greeting">
		<h2>مرحباً، {data.patient.name.split(' ')[0]}</h2>
		<p>{formatArFullDate(new Date())}</p>
	</div>

	<!-- Summary Stat Chips -->
	<div class="stat-chips">
		<div class="chip">
			<div class="chip-icon"><svg width="16" height="16" fill="none" stroke="#f59e0b" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z"/><path stroke-linecap="round" stroke-linejoin="round" d="M9.879 16.121A3 3 0 1012.015 11L11 14H9c0 .768.293 1.536.879 2.121z"/></svg></div>
			<div class="chip-val">{data.session ? data.streakDays : '—'}</div>
			<div class="chip-lbl">أيام متتالية</div>
		</div>
		<div class="chip">
			<div class="chip-icon"><svg width="16" height="16" fill="none" stroke="#2a9d62" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg></div>
			<div class="chip-val">{data.session ? (data.avgAdherence ?? 0) : '—'}<span class="chip-val-unit">{data.session ? '%' : ''}</span></div>
			<div class="chip-lbl">متوسط الالتزام</div>
		</div>
		<div class="chip">
			<div class="chip-icon"><svg width="16" height="16" fill="none" stroke="#059669" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg></div>
			<div class="chip-val">{data.session ? data.totalCompletedDays : '—'}</div>
			<div class="chip-lbl">أيام مكتملة</div>
		</div>
		<div class="chip">
			<div class="chip-icon"><svg width="16" height="16" fill="none" stroke="#6366f1" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3"/></svg></div>
			{#if latestWeight}
				<div class="chip-val">{latestWeight.toFixed(1)}<span class="chip-val-unit"> كغ</span></div>
			{:else}
				<div class="chip-val">—</div>
			{/if}
			<div class="chip-lbl">الوزن الحالي</div>
		</div>
	</div>

	<div class="chart-nav">
		<button class="chart-nav-btn" onclick={weekForward} disabled={!canGoNewer} aria-label="أحدث">
			<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>
		</button>
		<span class="chart-nav-label">{weekLabel}</span>
		<button class="chart-nav-btn" onclick={weekBack} disabled={!canGoOlder} aria-label="أقدم">
			<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg>
		</button>
	</div>

	<div class="cards-grid">
		<!-- Weight Progress Card (full-width) -->
		<div class="card card-full" style="animation-delay:0.1s;">
			<div class="card-title">
				<span class="card-title-icon" style="background:var(--g-soft);"><svg width="12" height="12" fill="none" stroke="var(--g-text)" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3"/></svg></span>
				تتبع الوزن
			</div>

			<div class="weight-header">
				<div>
					{#if latestWeight}
						<div class="weight-current">{latestWeight.toFixed(1)}<span class="weight-unit"> كغ</span></div>
						{#if weightDelta !== null}
							<div class="delta-badge" class:delta-down={weightDelta < 0} class:delta-up={weightDelta > 0} class:delta-same={weightDelta === 0}>
								{weightDelta < 0 ? '↓' : weightDelta > 0 ? '↑' : '→'}
								{Math.abs(weightDelta).toFixed(1)} كغ عن آخر قراءة
							</div>
						{/if}
						{#if totalWeightChange !== null}
							<div class="weight-total-change">
								<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/></svg>
								إجمالي التغيير: <strong style="color:{totalWeightChange < 0 ? '#059669' : totalWeightChange > 0 ? '#dc2626' : 'var(--muted)'};">{totalWeightChange > 0 ? '+' : ''}{totalWeightChange.toFixed(1)} كغ</strong>
							</div>
						{/if}
					{:else}
						<div style="font-size:14px; color:var(--muted);">لم يُسجَّل وزن بعد</div>
					{/if}
				</div>
			</div>

		{#if pagedWeightLogs().length >= 2}
			{@const cDrawH = CH - CPAD - CPAD_B}
			<div class="chart-wrap">
				<svg
					width="100%"
					viewBox="0 0 {CW} {CH}"
					preserveAspectRatio="xMidYMid meet"
					aria-hidden="true"
					style="display:block;"
				>
					<line x1={CPAD} y1={CPAD} x2={CW - CPAD} y2={CPAD} stroke="#e4e9e4" stroke-width="0.5" stroke-dasharray="3,3"/>
					<line x1={CPAD} y1={CPAD + cDrawH / 2} x2={CW - CPAD} y2={CPAD + cDrawH / 2} stroke="#e4e9e4" stroke-width="0.5" stroke-dasharray="3,3"/>
					<line x1={CPAD} y1={CPAD + cDrawH} x2={CW - CPAD} y2={CPAD + cDrawH} stroke="#e4e9e4" stroke-width="0.5"/>
					<path d={chartPoints().area} fill="url(#weightGrad)" opacity="0.6"/>
					<path d={chartPoints().path} fill="none" stroke="#2a9d62" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
				{#each chartPoints().dots as dot, i}
					{@const isCurrentView = data.session ? viewWeekAnchor === todayWeekAnchor : true}
					{@const isLast = i === chartPoints().dots.length - 1 && isCurrentView}
					{@const isHovered = hoveredDot === i}
					{#if isHovered}
						<line x1={dot.x} y1={CPAD} x2={dot.x} y2={CPAD + cDrawH} stroke="#2a9d62" stroke-width="1" stroke-dasharray="3,3" opacity="0.3"/>
					{/if}
					<circle cx={dot.x} cy={dot.y} r={isHovered ? 6 : isLast ? 5 : 3}
						fill={isHovered ? '#1a7a4a' : isLast ? '#2a9d62' : '#fff'}
						stroke={isHovered ? '#1a7a4a' : '#2a9d62'} stroke-width={isHovered || isLast ? 2.5 : 1.5}
						style="cursor:pointer;"/>
					<circle cx={dot.x} cy={dot.y} r="12" fill="transparent"
						onmouseenter={() => hoveredDot = i}
						onmouseleave={() => hoveredDot = null}
						style="cursor:pointer;"/>
					{#if isHovered || isLast}
						<rect x={dot.x - 32} y={dot.y - 30} width="64" height="18" rx="4"
							fill={isHovered ? '#1a7a4a' : 'transparent'} opacity={isHovered ? 0.9 : 0}/>
						<text x={dot.x} y={dot.y - 18} text-anchor="middle" font-size="8.5" font-weight="700"
							fill={isHovered ? '#fff' : '#2a9d62'} font-family="Tajawal,sans-serif">
							{#if isHovered}{dot.w.toFixed(1)} كغ · {dot.date.slice(5)}{:else}{dot.w.toFixed(1)}{/if}
						</text>
					{/if}
				{/each}
					{#each chartPoints().labels as lbl}
						<text x={lbl.x} y={CH - 4} text-anchor="middle" font-size="8" fill="#8b909a" font-family="Tajawal,sans-serif">{lbl.text}</text>
					{/each}
					<defs>
						<linearGradient id="weightGrad" x1="0" y1="0" x2="0" y2="1">
							<stop offset="0%" stop-color="#2a9d62" stop-opacity="0.25"/>
							<stop offset="100%" stop-color="#2a9d62" stop-opacity="0.02"/>
						</linearGradient>
					</defs>
				</svg>
			</div>
		{:else}
			<div class="chart-wrap">
				<div class="chart-empty">
					<div class="chart-empty-icon">
						<svg width="22" height="22" fill="none" stroke="var(--g-text)" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/></svg>
					</div>
					{#if data.weightLogs.length < 2}
						سجّل وزنك يومياً لمتابعة تقدمك<br/>سيظهر الرسم البياني بعد تسجيلين على الأقل
					{:else}
						لا توجد قراءات وزن لهذا الأسبوع
					{/if}
				</div>
			</div>
		{/if}

		{#if data.session}
			<form method="POST" action="?/logWeight" use:enhance class="weight-form">
				<input type="hidden" name="sessionId" value={data.session.id}/>
				<input type="hidden" name="date" value={data.today}/>
				<input
					type="number"
					name="weight"
					class="weight-input"
					placeholder="الوزن (كغ)"
					step="0.1"
					min="20"
					max="400"
					bind:value={weightInput}
					required
				/>
				<button type="submit" class="weight-btn">تسجيل</button>
			</form>
			{#if weightSuccess}
				<p class="msg-success">تم تسجيل الوزن بنجاح</p>
			{/if}
			{#if weightError}
				<p class="msg-error">{weightError}</p>
			{/if}
		{/if}

		</div>

		<!-- Weekly Adherence Card -->
		<div class="card" style="animation-delay:0.2s;">
			<div class="card-title">
				<span class="card-title-icon" style="background:#ecfdf5;"><svg width="12" height="12" fill="none" stroke="#059669" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg></span>
				الالتزام الأسبوعي
			</div>
			{#if adherenceScored.length > 0}
				<div class="bar-chart">
					{#each weeklyAdherence as day}
						{@const pct = day.score ?? 0}
						{@const h = (pct / adherenceMax()) * 100}
						{@const color = pct >= 70 ? '#22c55e' : pct >= 40 ? '#f59e0b' : pct > 0 ? '#ef4444' : '#e8eaed'}
						<div class="bar-col">
							{#if day.score !== null}
								<div class="bar-val">{pct}%</div>
							{/if}
							<div class="bar-fill-wrap" style="height:{Math.max(4, h)}%;">
								<div class="bar-inner" style="background:{color};"></div>
							</div>
							<div class="bar-label">{day.label}</div>
						</div>
					{/each}
				</div>
				<div class="bar-target-line">
					<span>متوسط الأسبوع</span>
					<span class="bar-avg-badge" style="background:{adherenceWeekAvg >= 70 ? '#ecfdf5' : '#fef2f2'}; color:{adherenceWeekAvg >= 70 ? '#059669' : '#dc2626'};">{adherenceWeekAvg}%</span>
				</div>
			{:else}
				<div class="no-plan">لا توجد بيانات التزام بعد.<br/>سيظهر هنا مدى التزامك بخطتك الغذائية.</div>
			{/if}
		</div>

		<!-- Water Intake Card -->
		<div class="card" style="animation-delay:0.25s;">
			<div class="card-title">
				<span class="card-title-icon" style="background:#eff6ff;"><svg width="12" height="12" fill="none" stroke="#0284c7" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 21a8 8 0 008-8c0-4.418-8-12-8-12S4 8.582 4 13a8 8 0 008 8z"/></svg></span>
				متابعة الماء
			</div>
			{#if hasAnyWater}
				<div class="bar-chart">
					{#each waterHistory as day}
						{@const pct = (day.cups / 8) * 100}
						{@const h = Math.min(100, pct)}
						{@const color = day.cups >= 7 ? '#0284c7' : day.cups >= 4 ? '#38bdf8' : day.cups > 0 ? '#bae6fd' : '#e8eaed'}
						<div class="bar-col">
							{#if day.cups > 0}
								<div class="bar-val">{day.cups}</div>
							{/if}
							<div class="bar-fill-wrap" style="height:{Math.max(4, h)}%;">
								<div class="bar-inner" style="background:{color};"></div>
							</div>
							<div class="bar-label">{day.label}</div>
						</div>
					{/each}
				</div>
				<div class="bar-target-line">
					<span>الهدف: 8 أكواب/يوم</span>
					<span class="bar-avg-badge" style="background:#eff6ff; color:#0284c7;">{waterAvgPerDay()} كوب/يوم</span>
				</div>
			{:else}
				<div class="no-plan">لم تسجّل شرب ماء بعد.<br/>سيظهر هنا تتبع شربك للماء يومياً.</div>
			{/if}
		</div>

		<!-- Daily Nutrition Card -->
		<div class="card card-full" style="animation-delay:0.3s;">
			<div class="card-title">
				<span class="card-title-icon" style="background:#fef3c7;"><svg width="12" height="12" fill="none" stroke="#d97706" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8v2m0 8v2M3 12h2m14 0h2"/></svg></span>
				السعرات اليومية
			</div>

			{#if hasAnyNutrition}
				<div class="bar-chart">
					{#each weekNutrition as day}
						{@const h = (day.calories / nutritionMax()) * 100}
						{@const color = day.calories > 0 ? '#f59e0b' : '#e8eaed'}
						<div class="bar-col">
							{#if day.calories > 0}
								<div class="bar-val">{day.calories}</div>
							{/if}
							<div class="bar-fill-wrap" style="height:{Math.max(4, h)}%;">
								<div class="bar-inner" style="background:{color};"></div>
							</div>
							<div class="bar-label">{day.label}</div>
						</div>
					{/each}
				</div>
				{@const avg = nutritionAvg()}
				<div class="nutrition-summary">
					<div class="nutrition-avg">
						<span class="nutrition-avg-val">{avg.calories}</span>
						<span class="nutrition-avg-lbl">سعرة/يوم</span>
						{#if targetCal}
							<span class="nutrition-target-badge">الهدف: {targetCal}</span>
						{/if}
					</div>
					<div class="nutrition-macros">
						<span class="nutrition-macro"><span class="legend-dot" style="background:#22d3ee;"></span> كربو {avg.carbs}g</span>
						<span class="nutrition-macro"><span class="legend-dot" style="background:#a855f7;"></span> بروتين {avg.protein}g</span>
						<span class="nutrition-macro"><span class="legend-dot" style="background:#f59e0b;"></span> دهون {avg.fat}g</span>
					</div>
				</div>
			{:else}
				<div class="no-plan">
					لم يتم تحديد خطة غذائية بعد.<br/>سيقوم أخصائي التغذية بإعداد خطتك قريباً.
				</div>
			{/if}
		</div>

	</div>
</div>
