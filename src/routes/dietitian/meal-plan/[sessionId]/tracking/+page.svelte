<script lang="ts">
	import { toLocalYmd } from '$lib/date/local-ymd';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();

	const REPL_NOTES_PER_PAGE = 5;

	let replacementPage = $state(0);

	$effect(() => {
		void data.dateFrom;
		void data.dateTo;
		void data.planType;
		replacementPage = 0;
	});

	const replNotes = $derived(
		(data.trackingData?.replacementNotes ?? []) as Array<{ date: string; mealType: string; note: string }>
	);
	const replTotalPages = $derived(Math.max(1, Math.ceil(replNotes.length / REPL_NOTES_PER_PAGE)));
	const replPageClamped = $derived(Math.min(replacementPage, replTotalPages - 1));
	const replSlice = $derived(() => {
		const start = replPageClamped * REPL_NOTES_PER_PAGE;
		return replNotes.slice(start, start + REPL_NOTES_PER_PAGE);
	});

	function goReplPage(delta: number) {
		const list = (data.trackingData?.replacementNotes ?? []) as Array<{ date: string; mealType: string; note: string }>;
		const total = Math.max(1, Math.ceil(list.length / REPL_NOTES_PER_PAGE));
		replacementPage = Math.max(0, Math.min(total - 1, replacementPage + delta));
	}

	function shiftDate(dateStr: string, days: number) {
		const d = new Date(dateStr + 'T00:00:00');
		d.setDate(d.getDate() + days);
		return toLocalYmd(d);
	}
	function snapToSubscriptionPeriod(dateStr: string, baseDate: string) {
		const base = new Date(baseDate + 'T00:00:00');
		const d = new Date(dateStr + 'T00:00:00');
		const diffDays = Math.floor((d.getTime() - base.getTime()) / 86400000);
		const periodOffset = Math.floor(diffDays / 7) * 7;
		const anchor = new Date(base);
		anchor.setDate(base.getDate() + periodOffset);
		return toLocalYmd(anchor);
	}
	function prevDate(dateStr: string, type: string) { return shiftDate(dateStr, type === 'daily' ? -1 : -7); }
	function nextDate(dateStr: string, type: string) { return shiftDate(dateStr, type === 'daily' ?  1 :  7); }

	const AR_DAYS   = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
	const AR_MONTHS = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

	function fmtDate(dateStr: string) {
		const d = new Date(dateStr + 'T00:00:00');
		return `${AR_DAYS[d.getDay()]} ${d.getDate()} ${AR_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
	}

	function navLabel() {
		if (data.planType === 'daily') return fmtDate(data.dateFrom);
		const from = new Date(data.dateFrom + 'T00:00:00');
		const to   = new Date(data.dateTo   + 'T00:00:00');
		return `${AR_DAYS[from.getDay()]} ${from.getDate()} ${AR_MONTHS[from.getMonth()]} — ${AR_DAYS[to.getDay()]} ${to.getDate()} ${AR_MONTHS[to.getMonth()]} ${to.getFullYear()}`;
	}

	function mealTypeLabel(type: string) {
		if (td?.MEAL_NAMES?.[type]) return td.MEAL_NAMES[type];
		const normalized = type.replaceAll('_', ' ').trim();
		return normalized ? normalized[0].toUpperCase() + normalized.slice(1) : type;
	}

	const navMinDate = $derived(data.minNavDate);
	const navMaxDate = $derived(data.maxNavDate);
	const navSessionBaseDate = $derived(
		/^\d{4}-\d{2}-\d{2}$/.test(data.navAnchorBaseDate ?? '') ? data.navAnchorBaseDate : navMinDate
	);
	const navMinAnchorDate = $derived(
		data.planType === 'weekly'
			? snapToSubscriptionPeriod(navMinDate, navSessionBaseDate)
			: navMinDate
	);
	const navMaxAnchorDate = $derived(
		data.planType === 'weekly'
			? snapToSubscriptionPeriod(navMaxDate, navSessionBaseDate)
			: navMaxDate
	);
	const currentAnchorDate = $derived(
		data.planType === 'weekly'
			? snapToSubscriptionPeriod(data.dateFrom, navSessionBaseDate)
			: data.dateFrom
	);
	const canGoOlder = $derived(currentAnchorDate > navMinAnchorDate);
	const canGoNewer = $derived(currentAnchorDate < navMaxAnchorDate);
	const olderAnchorDate = $derived(prevDate(currentAnchorDate, data.planType));
	const newerAnchorDate = $derived(nextDate(currentAnchorDate, data.planType));

	const MEAL_ICONS: Record<string, string> = {
		breakfast: '', morning_snack: '', lunch: '',
		afternoon_snack: '', dinner: '', other: ''
	};

	const td = $derived(data.trackingData);

	// Full weight history — independent of week navigation
	const allWeightHistory = $derived(data.trackingData?.allWeightHistory ?? []);

	// Weight chart computation (uses full history, not week-scoped)
	const WCW = 540, WCH = 160, WCPAD = 32, WCPAD_B = 28;
	const weightChart = $derived(() => {
		const logs = allWeightHistory as Array<{ date: string; weight: number }>;
		if (logs.length === 0) return { path: '', area: '', dots: [] as { x: number; y: number; w: number; date: string }[], labels: [] as { x: number; text: string }[] };
		// Single record: draw a flat horizontal line in the middle
		if (logs.length === 1) {
			const drawH = WCH - WCPAD - WCPAD_B;
			const midY = WCPAD + drawH / 2;
			const x = WCW / 2;
			return {
				path: `M ${WCPAD} ${midY} L ${WCW - WCPAD} ${midY}`,
				area: `M ${WCPAD} ${midY} L ${WCW - WCPAD} ${midY} L ${WCW - WCPAD} ${WCPAD + drawH} L ${WCPAD} ${WCPAD + drawH} Z`,
				dots: [{ x, y: midY, w: logs[0].weight, date: logs[0].date }],
				labels: [{ x, text: logs[0].date.slice(5) }]
			};
		}
		const weights = logs.map((l) => l.weight);
		const minW = Math.min(...weights) - 0.5;
		const maxW = Math.max(...weights) + 0.5;
		const range = maxW - minW || 1;
		const n = logs.length;
		const drawW = WCW - WCPAD * 2;
		const drawH = WCH - WCPAD - WCPAD_B;
		const pts = logs.map((l, i) => {
			const x = WCPAD + (i / (n - 1)) * drawW;
			const y = WCPAD + drawH - ((l.weight - minW) / range) * drawH;
			return { x, y, w: l.weight, date: l.date };
		});
		const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
		const lastPt = pts[pts.length - 1];
		const firstPt = pts[0];
		const area = `${path} L ${lastPt.x.toFixed(1)} ${(WCPAD + drawH).toFixed(1)} L ${firstPt.x.toFixed(1)} ${(WCPAD + drawH).toFixed(1)} Z`;
		const step = Math.max(1, Math.floor(n / 6));
		const labels = pts.filter((_, i) => i % step === 0 || i === n - 1).map((p) => ({
			x: p.x,
			text: p.date.slice(5)
		}));
		return { path, area, dots: pts, labels };
	});
	const wStartWeight = $derived(allWeightHistory.length ? (allWeightHistory[0] as any).weight : null);
	const wCurrentWeight = $derived(allWeightHistory.length ? (allWeightHistory[allWeightHistory.length - 1] as any).weight : null);
	const wDelta = $derived(wStartWeight != null && wCurrentWeight != null && allWeightHistory.length > 1 ? wCurrentWeight - wStartWeight : null);

	// Hover tooltip for weight chart
	let hoveredDot = $state<{ x: number; y: number; w: number; date: string } | null>(null);

	function donutPath(value: number, total: number, startAngle: number, r = 38) {
		if (total === 0) return '';
		const pct = value / total;
		const angle = pct * 2 * Math.PI;
		const cx = 50, cy = 50;
		const x1 = cx + r * Math.sin(startAngle);
		const y1 = cy - r * Math.cos(startAngle);
		const x2 = cx + r * Math.sin(startAngle + angle);
		const y2 = cy - r * Math.cos(startAngle + angle);
		if (pct >= 1) return `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.001} ${cy - r} Z`;
		return `M ${x1} ${y1} A ${r} ${r} 0 ${angle > Math.PI ? 1 : 0} 1 ${x2} ${y2}`;
	}

	const donutSegments = $derived(() => {
		if (!td) return [];
		const total = td.eaten + td.skipped + td.notEaten;
		if (total === 0) return [];
		let angle = 0;
		const segs = [];
		if (td.eaten > 0)   { segs.push({ d: donutPath(td.eaten,   total, angle), color: '#3cb96b' }); angle += (td.eaten   / total) * 2 * Math.PI; }
		if (td.skipped > 0) { segs.push({ d: donutPath(td.skipped, total, angle), color: '#f59e0b' }); angle += (td.skipped / total) * 2 * Math.PI; }
		if (td.notEaten > 0) segs.push({ d: donutPath(td.notEaten, total, angle), color: '#e8eaed' });
		return segs;
	});
</script>

<svelte:head>
	<title>تتبع {data.patient.name} — نيوتريكير</title>
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link
		href="https://fonts.googleapis.com/css2?family=El+Messiri:wght@500;600;700&family=Tajawal:wght@400;500;600;700;800&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

<style>
	.page {
		--nc-ink: #12151c;
		--nc-muted: #6b7280;
		--nc-line: #e2e8f0;
		--nc-surface: #ffffff;
		--nc-page: #eef2f0;
		--nc-page-2: #e8f4ef;
		--nc-accent: #1f8f54;
		--nc-accent-2: #2db86e;
		--nc-warn: #d97706;
		--nc-radius: 16px;
		--nc-shadow: 0 4px 24px rgba(15, 23, 42, 0.06);
		--font-display: 'El Messiri', 'Tajawal', serif;
		--font-body: 'Tajawal', system-ui, sans-serif;
		--content-pad: clamp(12px, 3.5vw, 24px);
		background:
			radial-gradient(120% 80% at 100% 0%, rgba(45, 184, 110, 0.08), transparent 45%),
			radial-gradient(90% 60% at 0% 100%, rgba(30, 143, 84, 0.06), transparent 50%), var(--nc-page);
		min-height: 100vh;
		font-family: var(--font-body);
		direction: rtl;
		animation: page-in 0.55s ease-out both;
	}

	@keyframes page-in {
		from {
			opacity: 0;
			transform: translateY(6px);
		}
		to {
			opacity: 1;
			transform: none;
		}
	}

	.topbar {
		background: var(--nc-surface);
		border-bottom: 1px solid var(--nc-line);
		padding: 10px var(--content-pad);
		padding-left: max(var(--content-pad), env(safe-area-inset-left));
		padding-right: max(var(--content-pad), env(safe-area-inset-right));
		display: grid;
		align-items: center;
		column-gap: 12px;
		row-gap: 8px;
		min-height: 52px;
		box-shadow: 0 1px 0 rgba(255, 255, 255, 0.8) inset;
		/* mobile: row1 = back, row2 = toggles */
		grid-template-columns: minmax(0, 1fr) auto;
		grid-template-areas:
			'back back'
			'main main';
	}

	.topbar-back {
		grid-area: back;
		justify-self: start;
		min-width: 0;
	}

	.topbar-main {
		grid-area: main;
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 10px;
		min-width: 0;
	}

	.topbar-divider {
		display: none;
		width: 1px;
		height: 18px;
		background: var(--nc-line);
		flex-shrink: 0;
	}

	.topbar-toggles {
		display: flex;
		gap: 6px;
		flex-wrap: nowrap;
		flex-shrink: 0;
	}

	.toggle-pill {
		padding: 8px 14px;
		min-height: 40px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border-radius: 999px;
		font-size: 12px;
		font-weight: 600;
		text-decoration: none;
		border: 1px solid var(--nc-line);
		transition: background 0.15s, color 0.15s, border-color 0.15s;
	}

	.toggle-pill.on {
		background: linear-gradient(135deg, var(--nc-accent), var(--nc-accent-2));
		color: #fff;
		border-color: transparent;
	}

	.toggle-pill.off {
		background: var(--nc-surface);
		color: var(--nc-muted);
	}

	.toggle-pill.off:hover {
		border-color: var(--nc-accent-2);
		color: var(--nc-accent);
	}

	.back-link {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		color: var(--nc-muted);
		text-decoration: none;
		font-size: 13px;
		font-weight: 600;
		transition: color 0.15s;
		min-height: 40px;
		padding: 2px 0;
	}

	.back-link:hover {
		color: var(--nc-accent);
	}

	.content {
		padding: var(--content-pad);
		padding-bottom: max(var(--content-pad), env(safe-area-inset-bottom));
		max-width: 1080px;
		margin: 0 auto;
	}

	.stat-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: clamp(10px, 2.5vw, 14px);
		margin-bottom: 16px;
	}

	.stat-card {
		background: var(--nc-surface);
		border-radius: var(--nc-radius);
		border: 1px solid var(--nc-line);
		box-shadow: var(--nc-shadow);
		padding: clamp(14px, 3vw, 20px) clamp(14px, 3vw, 20px);
		transition: transform 0.2s ease, box-shadow 0.2s ease;
	}

	.stat-card:hover {
		transform: translateY(-2px);
		box-shadow: 0 8px 28px rgba(15, 23, 42, 0.08);
	}

	.stat-label {
		font-size: 11px;
		font-weight: 700;
		color: var(--nc-muted);
		letter-spacing: 0.04em;
		margin-bottom: 8px;
		font-family: var(--font-display);
	}

	.stat-value {
		font-size: clamp(28px, 8vw, 40px);
		font-weight: 800;
		line-height: 1;
		color: var(--nc-ink);
		font-variant-numeric: tabular-nums;
	}

	.stat-sub {
		font-size: clamp(10px, 2.8vw, 11px);
		color: var(--nc-muted);
		margin-top: 8px;
		display: flex;
		gap: 8px 10px;
		flex-wrap: wrap;
		line-height: 1.4;
	}

	.charts-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: clamp(10px, 2.5vw, 14px);
		margin-bottom: 16px;
	}

	.card {
		background: var(--nc-surface);
		border-radius: var(--nc-radius);
		border: 1px solid var(--nc-line);
		box-shadow: var(--nc-shadow);
		padding: clamp(14px, 3vw, 20px);
	}

	.card-title {
		font-size: 12px;
		font-weight: 700;
		color: var(--nc-muted);
		letter-spacing: 0.05em;
		margin-bottom: 14px;
		font-family: var(--font-display);
	}

	.donut-block {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: clamp(16px, 4vw, 28px);
		flex-wrap: wrap;
	}

	.donut-legends {
		flex: 1 1 140px;
		min-width: min(100%, 160px);
	}

	.legend-row {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: clamp(12px, 3.2vw, 14px);
		color: #374151;
		margin-bottom: 10px;
	}

	.legend-dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.legend-count {
		margin-right: auto;
		font-weight: 800;
		color: var(--nc-ink);
		padding-right: 6px;
		font-size: clamp(13px, 3.5vw, 15px);
		font-variant-numeric: tabular-nums;
	}

	.day-bar-scroll {
		overflow-x: auto;
		-webkit-overflow-scrolling: touch;
		overscroll-behavior-x: contain;
		margin: 0 -4px;
		padding: 0 4px 8px;
		scrollbar-width: thin;
		scrollbar-color: #cbd5e1 #f1f5f9;
	}

	.day-bar-wrap {
		display: flex;
		align-items: flex-end;
		justify-content: center;
		gap: clamp(8px, 1.8vw, 12px);
		height: clamp(88px, 22vw, 118px);
		width: max-content;
		min-width: 100%;
		padding-inline: 6px;
	}

	.day-bar-col {
		flex: 0 0 clamp(36px, 9vw, 52px);
		min-width: 36px;
		max-width: 54px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 3px;
		height: 100%;
		justify-content: flex-end;
	}

	.day-stacked {
		width: 100%;
		border-radius: 6px 6px 0 0;
		overflow: hidden;
		display: flex;
		flex-direction: column-reverse;
	}

	.day-label {
		font-size: clamp(9px, 2.5vw, 11px);
		color: #334155;
		font-weight: 700;
		text-align: center;
		line-height: 1.2;
		white-space: normal;
		word-break: keep-all;
		min-height: 1.5rem;
	}

	.day-date {
		font-size: 9px;
		color: #94a3b8;
		font-variant-numeric: tabular-nums;
	}

	.type-row {
		display: grid;
		grid-template-columns: minmax(132px, 180px) 1fr minmax(52px, 68px);
		align-items: center;
		gap: 12px;
		margin-bottom: 14px;
	}

	.type-label {
		font-size: clamp(11px, 3vw, 12px);
		color: #374151;
		font-weight: 700;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.type-stats {
		display: flex;
		gap: 10px;
		font-size: 10px;
		color: #8b909a;
		margin-top: 3px;
		flex-wrap: wrap;
	}

	.bar-track {
		height: 10px;
		background: #f0f2f5;
		border-radius: 100px;
		overflow: hidden;
	}

	.bar-fill {
		height: 100%;
		border-radius: 100px;
		transition: width 0.5s ease;
	}

	.bar-pct {
		font-size: 12px;
		font-weight: 800;
		font-variant-numeric: tabular-nums;
		text-align: center;
	}

	.log-toast {
		margin: 0 0 12px;
		padding: 10px 14px;
		border-radius: 10px;
		background: #ecfdf5;
		border: 1px solid #bbf7d0;
		color: #166534;
		font-size: 13px;
		font-weight: 600;
		text-align: center;
	}


	.replacement-section {
		border: 1px solid var(--nc-line);
		border-radius: 12px;
		padding: 12px 14px;
		margin-bottom: 12px;
		background: #fafbfc;
	}

	.replacement-section:last-child {
		margin-bottom: 0;
	}

	.replacement-intro {
		font-size: 12px;
		color: var(--nc-muted);
		line-height: 1.65;
		margin: 0;
	}

	.replacement-summary-title {
		font-size: 11px;
		font-weight: 800;
		color: #64748b;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		margin-bottom: 6px;
	}

	.replacement-summary {
		font-size: 12px;
		color: #374151;
		margin: 0;
	}

	.replacement-warn {
		display: inline-block;
		margin-right: 8px;
		color: #b45309;
		font-weight: 600;
	}

	.replacement-list-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		flex-wrap: wrap;
		margin-bottom: 10px;
	}

	.replacement-list-title {
		font-size: 13px;
		font-weight: 800;
		color: var(--nc-ink);
	}

	.replacement-pager {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.pager-btn {
		border: 1px solid var(--nc-line);
		background: #fff;
		border-radius: 8px;
		padding: 5px 12px;
		font-size: 12px;
		font-weight: 700;
		cursor: pointer;
		font-family: var(--font-body);
		color: #475569;
	}

	.pager-btn:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}

	.pager-meta {
		font-size: 12px;
		font-weight: 700;
		color: #64748b;
		font-variant-numeric: tabular-nums;
		min-width: 6.75rem;
		text-align: center;
	}

	.replacement-notes-list {
		border-top: 1px solid #e8eaed;
		padding-top: 4px;
	}

	.replacement-pager-bottom {
		margin-top: 10px;
		justify-content: center;
	}

	.note-body {
		font-size: 13px;
		color: #4b5563;
		line-height: 1.55;
	}

	.replacement-empty {
		text-align: center;
		color: #8b909a;
		font-size: 13px;
		padding: 12px 0 4px;
		margin: 0;
	}

	.note-item {
		border-top: 1px solid #f0f2f5;
		padding: 12px 0;
	}

	.note-item:first-child {
		border-top: none;
		padding-top: 0;
	}

	.note-tag {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		background: #f4f6f9;
		border: 1px solid var(--nc-line);
		border-radius: 6px;
		padding: 3px 8px;
		font-size: 11px;
		color: #6b7280;
		margin-left: 6px;
		margin-bottom: 6px;
	}

	.empty-box {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 12px;
		padding: clamp(48px, 15vw, 80px) var(--content-pad);
		text-align: center;
	}

	.week-nav {
		display: flex;
		align-items: stretch;
		gap: 8px;
		margin-bottom: clamp(12px, 3vw, 18px);
		justify-content: center;
		flex-wrap: nowrap;
	}

	.week-nav-arrow {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 44px;
		height: 44px;
		min-width: 44px;
		border-radius: 12px;
		border: 1.5px solid var(--nc-line);
		background: var(--nc-surface);
		color: var(--nc-muted);
		text-decoration: none;
		transition: 0.15s;
		flex-shrink: 0;
		box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);
		font-size: 18px;
		font-weight: 800;
		font-family: var(--font-body);
		line-height: 1;
	}

	.week-nav-arrow.is-disabled {
		color: #c3cad4;
		border-color: #e7ebf1;
		background: #f8fafc;
		pointer-events: none;
		box-shadow: none;
	}

	.week-nav-arrow:hover {
		border-color: var(--nc-accent-2);
		color: var(--nc-accent);
		background: #f0faf4;
	}

	.week-nav-center {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 10px clamp(12px, 3vw, 22px);
		border-radius: 12px;
		border: 1.5px solid var(--nc-line);
		background: var(--nc-surface);
		font-size: clamp(11px, 3vw, 14px);
		font-weight: 700;
		color: var(--nc-ink);
		transition: 0.15s;
		text-align: center;
		line-height: 1.35;
		flex: 1 1 auto;
		min-width: 0;
		max-width: min(100%, 420px);
		font-family: var(--font-display);
		box-shadow: var(--nc-shadow);
	}

	.week-nav-center span {
		white-space: normal;
		word-break: break-word;
		hyphens: auto;
	}

	.progress-bar {
		height: 6px;
		background: #f0f2f5;
		border-radius: 100px;
		overflow: hidden;
		margin-top: 10px;
	}

	.progress-fill {
		height: 100%;
		border-radius: 100px;
		background: linear-gradient(90deg, var(--nc-accent), var(--nc-accent-2));
		transition: width 0.6s ease;
	}

	.empty-chart {
		color: var(--nc-muted);
		font-size: clamp(12px, 3.2vw, 14px);
		text-align: center;
		padding: clamp(16px, 4vw, 28px) 8px;
		margin: 0;
		line-height: 1.5;
	}

	.bar-legend-row {
		display: flex;
		gap: 12px 16px;
		margin-top: 12px;
		flex-wrap: wrap;
		justify-content: flex-start;
	}

	/* ─── WEIGHT CHART ─── */
	.weight-chart-wrap {
		overflow: hidden;
		border-radius: 10px;
		background: linear-gradient(180deg, #f8faf8 0%, #f0f5f1 100%);
		border: 1px solid var(--nc-line);
		margin-bottom: 12px;
	}
	.weight-tooltip {
		position: absolute;
		transform: translate(-50%, calc(-100% - 14px));
		background: #1a2332;
		color: #fff;
		border-radius: 8px;
		padding: 5px 10px;
		pointer-events: none;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		z-index: 10;
		white-space: nowrap;
		box-shadow: 0 4px 16px rgba(0,0,0,0.2);
	}
	.weight-tooltip::after {
		content: '';
		position: absolute;
		top: 100%;
		left: 50%;
		transform: translateX(-50%);
		border: 5px solid transparent;
		border-top-color: #1a2332;
	}
	.weight-tooltip-val {
		font-size: 13px;
		font-weight: 800;
		font-variant-numeric: tabular-nums;
		font-family: var(--font-display);
	}
	.weight-tooltip-date {
		font-size: 10px;
		color: #94a3b8;
		font-variant-numeric: tabular-nums;
	}
	.weight-stat-row {
		display: flex;
		align-items: center;
		gap: 16px;
		flex-wrap: wrap;
		margin-bottom: 12px;
	}
	.weight-stat-item {
		display: flex;
		flex-direction: column;
		gap: 1px;
	}
	.weight-stat-label {
		font-size: 10px;
		color: var(--nc-muted);
		font-weight: 600;
	}
	.weight-stat-value {
		font-size: 22px;
		font-weight: 800;
		color: var(--nc-ink);
		line-height: 1.1;
		font-family: var(--font-display);
		font-variant-numeric: tabular-nums;
	}
	.weight-stat-unit {
		font-size: 12px;
		font-weight: 500;
		color: var(--nc-muted);
	}
	.weight-delta-badge {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 3px 10px;
		border-radius: 999px;
		font-size: 12px;
		font-weight: 700;
		font-family: var(--font-display);
		font-variant-numeric: tabular-nums;
	}
	.weight-chart-empty {
		text-align: center;
		padding: 28px 16px;
		color: var(--nc-muted);
		font-size: 13px;
		line-height: 1.7;
	}

	@media (max-width: 768px) {
		.topbar {
			padding-top: 8px;
			padding-bottom: 8px;
			row-gap: 6px;
		}

		.toggle-pill {
			padding: 6px 12px;
			min-height: 36px;
			font-size: 11px;
		}

		.topbar-name {
			max-width: none;
		}
	}

	@media (max-width: 768px) {
		.stat-grid {
			grid-template-columns: repeat(2, 1fr);
		}
	}

	@media (max-width: 640px) {
		.stat-grid {
			grid-template-columns: 1fr 1fr;
		}

		.stat-card:last-child {
			grid-column: auto;
		}

		.charts-row {
			grid-template-columns: 1fr;
		}

		.type-row {
			grid-template-columns: 1fr;
			gap: 8px;
		}

		.type-label {
			white-space: normal;
		}

		.bar-pct {
			justify-self: start;
		}

		.day-bar-wrap {
			justify-content: flex-start;
		}
	}

	@media (max-width: 400px) {
		.stat-grid {
			grid-template-columns: 1fr 1fr;
		}

		.topbar-name {
			max-width: 100%;
			white-space: normal;
		}

		.topbar-meta {
			max-width: 100%;
			white-space: normal;
		}
	}

	@media (min-width: 769px) {
		.topbar {
			grid-template-columns: auto 1px minmax(0, 1fr);
			grid-template-areas: 'back divider main';
			column-gap: 14px;
			row-gap: 0;
			min-height: 60px;
			padding-top: 10px;
			padding-bottom: 10px;
		}

		.topbar-divider {
			display: block;
			grid-area: divider;
		}

		.topbar-main {
			grid-area: main;
			justify-content: flex-start;
			gap: clamp(10px, 2vw, 16px);
		}

		.toggle-pill {
			min-height: 40px;
		}

	}
</style>

<div class="page">
	<!-- Topbar -->
	<div class="topbar">
		<a href="/dietitian/meal-plan/{data.session.id}" class="back-link topbar-back">
			<svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
			</svg>
			الخطة الغذائية
		</a>
		<div class="topbar-divider" aria-hidden="true"></div>
		<div class="topbar-main">
			<div class="topbar-toggles">
				<a
					href="?type=daily&date={currentAnchorDate}"
					class="toggle-pill"
					class:on={data.planType === 'daily'}
					class:off={data.planType !== 'daily'}
				>
					يومية
				</a>
				<a
					href="?type=weekly&date={currentAnchorDate}"
					class="toggle-pill"
					class:on={data.planType === 'weekly'}
					class:off={data.planType !== 'weekly'}
				>
					أسبوعية
				</a>
			</div>
		</div>
	</div>

	<div class="content">
		<!-- Date navigation -->
		<div class="week-nav">
			<a
				class="week-nav-arrow"
				class:is-disabled={!canGoOlder}
				href={canGoOlder ? `?type=${data.planType}&date=${olderAnchorDate}` : undefined}
				title="الأقدم"
				aria-label="الأقدم"
				aria-disabled={!canGoOlder}
			>
				&lt;
			</a>
			<div class="week-nav-center" aria-live="polite" aria-label="نطاق التاريخ الحالي">
				<span>{navLabel()}</span>
			</div>
			<a
				class="week-nav-arrow"
				class:is-disabled={!canGoNewer}
				href={canGoNewer ? `?type=${data.planType}&date=${newerAnchorDate}` : undefined}
				title="الأحدث"
				aria-label="الأحدث"
				aria-disabled={!canGoNewer}
			>
				&gt;
			</a>
		</div>

		{#if !td}
			<div class="empty-box">
				<div style="width:64px; height:64px; background:#edf9f2; border-radius:50%; display:flex; align-items:center; justify-content:center;">
					<svg width="28" height="28" fill="none" stroke="#3cb96b" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
					</svg>
				</div>
				<p style="font-size:16px; font-weight:600; color:#1a1d23; margin:0;">لا توجد خطة غذائية بعد</p>
				<p style="font-size:13px; color:#8b909a; margin:0;">أنشئ الخطة أولاً ثم ستظهر بيانات التتبع هنا</p>
			</div>
		{:else}
		<!-- Stats -->
		<div class="stat-grid">
			<div class="stat-card">
				<div class="stat-label">الالتزام الإجمالي</div>
				<div class="stat-value" style="color: var(--nc-accent-2);">{td.adherenceRate}%</div>
				<div class="progress-bar">
					<div class="progress-fill" style="width:{td.adherenceRate}%;"></div>
				</div>
			</div>
			<div class="stat-card">
				<div class="stat-label">إجمالي الوجبات</div>
				<div class="stat-value">{td.totalMealSlots}</div>
				<div class="stat-sub">
					<span style="color:#3cb96b; font-weight:600;">{td.eaten} متناولة</span>
					<span style="color:#f59e0b; font-weight:600;">{td.skipped} متخطية</span>
					<span style="color:#9ca3af; font-weight:600;">{td.notEaten} بلا سجل</span>
				</div>
			</div>
			<div class="stat-card">
				<div class="stat-label">البدائل المُسجَّلة</div>
				<div class="stat-value" style="color:#6366f1;">{td.withReplacement}</div>
				<div class="stat-sub">
					<span>{td.skipped > 0 ? Math.round((td.withReplacement / td.skipped) * 100) : 0}% من الوجبات المتخطاة لديها ملاحظة</span>
				</div>
			</div>
			<div class="stat-card">
				<div class="stat-label">متوسط الماء / يوم</div>
				<div class="stat-value" style="color:#0ea5e9;">{td.avgWaterCups}</div>
				<div class="stat-sub">
					<span>{td.totalWaterCups} كوب إجمالاً</span>
					<span style="color:#0ea5e9; font-weight:600;">الهدف 8 أكواب/يوم</span>
				</div>
			</div>
		</div>

		<!-- Water by day card -->
		{#if Object.keys(td.waterByDay).length > 0}
			<div class="card" style="margin-bottom:16px;">
				<div class="card-title">{data.planType === 'weekly' ? 'متابعة الماء خلال الأسبوع' : 'متابعة الماء اليومية'}</div>
				<div class="day-bar-scroll">
					<div class="day-bar-wrap">
						{#each td.dayStats as day}
							{@const cups = day.date ? (td.waterByDay[day.date] ?? 0) : 0}
							{@const pct = Math.min(100, Math.round((cups / 8) * 100))}
							<div class="day-bar-col">
								<div class="day-stacked" style="height:{Math.max(4, pct)}px; min-height:4px; border-radius:4px 4px 0 0;">
									<div style="width:100%; height:100%; background:{pct >= 75 ? '#0ea5e9' : pct >= 40 ? '#7dd3fc' : '#bae6fd'}; border-radius:4px 4px 0 0;"></div>
								</div>
								<div class="day-label">{day.label}</div>
								<div class="day-date" style="font-size:9px; color:#9ca3af; margin-top:1px;">{cups}</div>
							</div>
						{/each}
					</div>
				</div>
				<div class="bar-legend-row">
					<div class="legend-row" style="margin-bottom:0; font-size:11px;">
						<div class="legend-dot" style="background:#0ea5e9;"></div>
						<span>≥ 6 أكواب</span>
					</div>
					<div class="legend-row" style="margin-bottom:0; font-size:11px;">
						<div class="legend-dot" style="background:#7dd3fc;"></div>
						<span>3–5 أكواب</span>
					</div>
					<div class="legend-row" style="margin-bottom:0; font-size:11px;">
						<div class="legend-dot" style="background:#bae6fd;"></div>
						<span>1–2 أكواب</span>
					</div>
				</div>
			</div>
		{/if}

		<!-- Weight Trend Card — independent of week navigation, shows all records -->
		{#if allWeightHistory.length > 0}
			<div class="card" style="margin-bottom:16px;">
				<div class="card-title">تتبع الوزن</div>
				<div class="weight-stat-row">
					{#if wStartWeight != null}
						<div class="weight-stat-item">
							<span class="weight-stat-label">الوزن الأول</span>
							<span class="weight-stat-value">{(wStartWeight as number).toFixed(1)}<span class="weight-stat-unit"> كغ</span></span>
						</div>
					{/if}
					{#if wCurrentWeight != null}
						<div class="weight-stat-item">
							<span class="weight-stat-label">الوزن الحالي</span>
							<span class="weight-stat-value">{(wCurrentWeight as number).toFixed(1)}<span class="weight-stat-unit"> كغ</span></span>
						</div>
					{/if}
					{#if wDelta != null}
						<div class="weight-stat-item">
							<span class="weight-stat-label">التغيير</span>
							<span class="weight-delta-badge" style="background:{(wDelta as number) < 0 ? '#ecfdf5' : (wDelta as number) > 0 ? '#fef2f2' : '#f3f4f6'}; color:{(wDelta as number) < 0 ? '#059669' : (wDelta as number) > 0 ? '#dc2626' : '#6b7280'};">
								{(wDelta as number) < 0 ? '↓' : (wDelta as number) > 0 ? '↑' : '→'} {Math.abs(wDelta as number).toFixed(1)} كغ
							</span>
						</div>
					{/if}
					<div class="weight-stat-item" style="margin-right:auto;">
						<span class="weight-stat-label">السجلات</span>
						<span class="weight-stat-value" style="font-size:18px;">{allWeightHistory.length}</span>
					</div>
				</div>

				{#if allWeightHistory.length >= 1}
					{@const wDrawH = WCH - WCPAD - WCPAD_B}
					<div class="weight-chart-wrap" style="position:relative;">
						<svg
							width="100%"
							viewBox="0 0 {WCW} {WCH}"
							preserveAspectRatio="xMidYMid meet"
							aria-hidden="true"
							style="display:block;"
						>
							<line x1={WCPAD} y1={WCPAD} x2={WCW - WCPAD} y2={WCPAD} stroke="#e2e8f0" stroke-width="0.5" stroke-dasharray="3,3"/>
							<line x1={WCPAD} y1={WCPAD + wDrawH / 2} x2={WCW - WCPAD} y2={WCPAD + wDrawH / 2} stroke="#e2e8f0" stroke-width="0.5" stroke-dasharray="3,3"/>
							<line x1={WCPAD} y1={WCPAD + wDrawH} x2={WCW - WCPAD} y2={WCPAD + wDrawH} stroke="#e2e8f0" stroke-width="0.5"/>
							<path d={weightChart().area} fill="url(#wGrad)" opacity="0.6"/>
							<path d={weightChart().path} fill="none" stroke="#1f8f54" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
							{#each weightChart().dots as dot, i}
								{@const isLast = i === weightChart().dots.length - 1}
								{@const isHovered = hoveredDot === dot}
								<!-- svelte-ignore a11y_no_static_element_interactions -->
								<g
									onmouseenter={() => hoveredDot = dot}
									onmouseleave={() => hoveredDot = null}
									style="cursor:pointer;"
								>
									<circle cx={dot.x} cy={dot.y} r="12" fill="transparent"/>
									<circle
										cx={dot.x} cy={dot.y}
										r={isHovered ? 6 : isLast ? 5 : 3}
										fill={isHovered || isLast ? '#1f8f54' : '#fff'}
										stroke="#1f8f54"
										stroke-width={isHovered ? 2.5 : isLast ? 2 : 1.5}
										style="transition: r 0.1s ease;"
									/>
								</g>
							{/each}
							{#each weightChart().labels as lbl}
								<text x={lbl.x} y={WCH - 6} text-anchor="middle" font-size="8" fill="#8b909a" font-family="Tajawal,sans-serif">{lbl.text}</text>
							{/each}
							<defs>
								<linearGradient id="wGrad" x1="0" y1="0" x2="0" y2="1">
									<stop offset="0%" stop-color="#1f8f54" stop-opacity="0.25"/>
									<stop offset="100%" stop-color="#1f8f54" stop-opacity="0.02"/>
								</linearGradient>
							</defs>
						</svg>
						{#if hoveredDot}
							{@const svgW = WCW}
							{@const pct = hoveredDot.x / svgW}
							<div
								class="weight-tooltip"
								style="left:{pct * 100}%; top:{(hoveredDot.y / WCH) * 100}%;"
							>
								<span class="weight-tooltip-val">{(hoveredDot.w as number).toFixed(1)} كغ</span>
								<span class="weight-tooltip-date">{hoveredDot.date}</span>
							</div>
						{/if}
					</div>
				{/if}
			</div>
		{/if}

		{#if data.planType === 'weekly'}
			<!-- Charts -->
			<div class="charts-row">
					<!-- Donut -->
					<div class="card">
						<div class="card-title">توزيع حالة الوجبات</div>
						<div class="donut-block">
							<div style="position: relative; flex-shrink: 0;">
								<svg width="100" height="100" viewBox="0 0 100 100" aria-hidden="true">
									<circle cx="50" cy="50" r="38" fill="none" stroke="#f0f2f5" stroke-width="13" />
									{#each donutSegments() as seg}
										<path d={seg.d} fill="none" stroke={seg.color} stroke-width="13" stroke-linecap="butt" />
									{/each}
									<text
										x="50"
										y="45"
										text-anchor="middle"
										fill="#12151c"
										font-size="15"
										font-weight="800"
										font-family="Tajawal,sans-serif">{td.adherenceRate}%</text>
									<text
										x="50"
										y="59"
										text-anchor="middle"
										fill="#8b909a"
										font-size="8.5"
										font-family="Tajawal,sans-serif">التزام</text>
								</svg>
							</div>
							<div class="donut-legends">
								<div class="legend-row">
									<div class="legend-dot" style="background:#3cb96b;"></div>
									<span>مُتناول</span>
									<span class="legend-count">{td.eaten}</span>
								</div>
								<div class="legend-row">
									<div class="legend-dot" style="background:#f59e0b;"></div>
									<span>تم التخطي</span>
									<span class="legend-count">{td.skipped}</span>
								</div>
								<div class="legend-row">
									<div class="legend-dot" style="background:#e8eaed; border:1px solid #d1d5db;"></div>
									<span>بلا سجل</span>
									<span class="legend-count">{td.notEaten}</span>
								</div>
							</div>
						</div>
					</div>

					<!-- Daily bars -->
					<div class="card">
						<div class="card-title">{data.planType === 'weekly' ? 'الأداء الأسبوعي' : 'الأداء اليومي'}</div>
						{#if td.dayStats.length === 0}
							<p class="empty-chart">لا توجد بيانات أيام</p>
						{:else}
							<div class="day-bar-scroll">
								<div class="day-bar-wrap">
									{#each td.dayStats as day}
										{@const eH = day.total > 0 ? (day.eaten / day.total) * 100 : 0}
										{@const sH = day.total > 0 ? (day.skipped / day.total) * 100 : 0}
										{@const nH = day.total > 0 ? (day.notEaten / day.total) * 100 : 0}
										<div class="day-bar-col">
											<div class="day-stacked" style="height:{Math.max(6, eH + sH + nH)}px; min-height:6px;">
												<div style="width:100%; height:{eH}px; background:#3cb96b;"></div>
												<div style="width:100%; height:{sH}px; background:#f59e0b;"></div>
												<div style="width:100%; height:{nH}px; background:#e8eaed;"></div>
											</div>
											<div class="day-label">{day.label}</div>
											{#if day.date}<div class="day-date">{day.date.slice(5)}</div>{/if}
										</div>
									{/each}
								</div>
							</div>
							<div class="bar-legend-row">
								<div class="legend-row" style="margin-bottom: 0; font-size: 11px;">
									<div class="legend-dot" style="background:#3cb96b;"></div>
									<span>متناول</span>
								</div>
								<div class="legend-row" style="margin-bottom: 0; font-size: 11px;">
									<div class="legend-dot" style="background:#f59e0b;"></div>
									<span>متخطي</span>
								</div>
								<div class="legend-row" style="margin-bottom: 0; font-size: 11px;">
									<div class="legend-dot" style="background:#e8eaed; border:1px solid #d1d5db;"></div>
									<span>بلا سجل</span>
								</div>
							</div>
						{/if}
					</div>
				</div>

				<!-- Meal type breakdown -->
				{#if Object.keys(td.mealTypeStats).length > 0}
					<div class="card" style="margin-bottom:14px;">
						<div class="card-title">الالتزام حسب نوع الوجبة</div>
						{#each Object.entries(td.mealTypeStats) as [type, stats]}
							{@const pct = stats.total > 0 ? Math.round((stats.eaten / stats.total) * 100) : 0}
							{@const fillColor = pct >= 70 ? '#3cb96b' : pct >= 40 ? '#f59e0b' : '#ef4444'}
							<div class="type-row">
								<div class="type-label">{mealTypeLabel(type)}</div>
								<div>
									<div class="bar-track">
										<div class="bar-fill" style="width:{pct}%; background:{fillColor};"></div>
									</div>
									<div class="type-stats">
										<span style="color:#3cb96b; font-weight:600;">{stats.eaten} ✓</span>
										<span style="color:#f59e0b; font-weight:600;">{stats.skipped} ✗</span>
										<span>{stats.notEaten} —</span>
									</div>
								</div>
								<div class="bar-pct" style="color:{fillColor};">{pct}%</div>
							</div>
						{/each}
					</div>
				{/if}
			{/if}

			<!-- Replacement notes (read-only; patient logs from app) -->
			<div class="card replacement-card">
				<div class="card-title">ملاحظات البدائل</div>
				{#if td.skipped > 0}
					<div class="replacement-section replacement-summary-box">
						<div class="replacement-summary-title">ملخص</div>
						<p class="replacement-summary">
							<span style="color:#6366f1;font-weight:700;">{td.withReplacement}</span> وجبة متخطاة لديها بديل مسجّل.
							{#if (td.skippedWithoutReplacement ?? 0) > 0}
								<span class="replacement-warn">{td.skippedWithoutReplacement} متخطاة بدون ملاحظة بديل.</span>
							{/if}
						</p>
					</div>
				{/if}
				<div class="replacement-section replacement-list-wrap">
					<div class="replacement-list-head">
						{#if replNotes.length > REPL_NOTES_PER_PAGE}
							<div class="replacement-pager" data-testid="replacement-pager">
								<button
									type="button"
									class="pager-btn"
									disabled={replPageClamped <= 0}
									onclick={() => goReplPage(-1)}
									aria-label="الصفحة السابقة"
								>
									السابق
								</button>
								<span class="pager-meta">صفحة {replPageClamped + 1} من {replTotalPages}</span>
								<button
									type="button"
									class="pager-btn"
									disabled={replPageClamped >= replTotalPages - 1}
									onclick={() => goReplPage(1)}
									aria-label="الصفحة التالية"
								>
									التالي
								</button>
							</div>
						{/if}
					</div>
					{#if replNotes.length > 0}
						<div class="replacement-notes-list">
							{#each replSlice() as note}
								<div class="note-item">
									<div style="margin-bottom:6px;">
										<span class="note-tag">{mealTypeLabel(note.mealType)}</span>
									</div>
									<div class="note-body">{note.note}</div>
								</div>
							{/each}
						</div>
						{#if replNotes.length > REPL_NOTES_PER_PAGE}
							<div class="replacement-pager replacement-pager-bottom">
								<button
									type="button"
									class="pager-btn"
									disabled={replPageClamped <= 0}
									onclick={() => goReplPage(-1)}
									aria-label="الصفحة السابقة"
								>
									السابق
								</button>
								<span class="pager-meta">صفحة {replPageClamped + 1} من {replTotalPages}</span>
								<button
									type="button"
									class="pager-btn"
									disabled={replPageClamped >= replTotalPages - 1}
									onclick={() => goReplPage(1)}
									aria-label="الصفحة التالية"
								>
									التالي
								</button>
							</div>
						{/if}
					{:else}
						<p class="replacement-empty">لا توجد ملاحظات بديل مسجّلة بعد في هذه الفترة.</p>
					{/if}
				</div>
			</div>
		{/if}
	</div>
</div>
