<script lang="ts">
	import type { PageData } from './$types';
	import type { SessionRow } from './+page.server';
	import { formatArDayMonthYear } from '$lib/date/ar-format';

	let { data }: { data: PageData } = $props();

	const totalSessions = $derived(data.history.length + data.current.length + data.upcoming.length);

	function formatDate(iso: string): string {
		return formatArDayMonthYear(iso);
	}

	function statusLabel(status: SessionRow['status']): string {
		if (status === 'active') return 'نشطة';
		if (status === 'completed') return 'مكتملة';
		return 'مسودة';
	}

	function adherenceColor(score: number | null): string {
		if (score == null) return '#b0b8b4';
		if (score >= 80) return '#2a9d62';
		if (score >= 50) return '#f4a826';
		return '#e05555';
	}

	function adherenceLabel(score: number | null): string {
		if (score == null) return 'لا يوجد بيانات';
		if (score >= 80) return 'ممتاز';
		if (score >= 50) return 'متوسط';
		return 'ضعيف';
	}

	// Radial progress (SVG donut)
	function donutPath(pct: number, r = 22, cx = 28, cy = 28) {
		const circ = 2 * Math.PI * r;
		const used = (pct / 100) * circ;
		return { dashArray: `${used} ${circ}`, dashOffset: circ * 0.25 };
	}
</script>

<svelte:head>
	<title>الجلسات والخطط — نيوتريكير</title>
	<link
		href="https://fonts.googleapis.com/css2?family=El+Messiri:wght@500;600;700&family=Tajawal:wght@400;500;600;700;800&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

<div class="page" dir="rtl">
	<div class="page-header">
		<div>
			<h1 class="page-title">الجلسات والخطط الغذائية</h1>
		</div>
	</div>

	{#if totalSessions === 0}
		<div class="empty-state">
			<p class="empty-title">لا توجد جلسات غذائية</p>
			<p class="empty-hint">سيقوم أخصائي التغذية بإنشاء خطتك الغذائية قريباً.</p>
		</div>
	{:else}
		<div class="timeline-root">

			<!-- Current -->
			{#if data.current.length > 0}
				<section class="timeline-section current">
					<div class="section-header">
						<div class="section-dot current-dot pulsing"></div>
						<h2 class="section-title">الحالية</h2>
						<span class="section-count current-count">{data.current.length}</span>
					</div>
					<div class="cards-col">
						{#each data.current as session (session.id)}
							<div class="session-card current-card">
								{@render SessionCard({
									session,
									formatDate,
									statusLabel,
									adherenceColor,
									adherenceLabel,
									donutPath
								})}
							</div>
						{/each}
					</div>
				</section>

				<div class="timeline-connector"></div>
			{/if}

			<!-- History -->
			{#if data.history.length > 0}
				<section class="timeline-section history">
					<div class="section-header">
						<div class="section-dot history-dot"></div>
						<h2 class="section-title">السابقة</h2>
						<span class="section-count">{data.history.length}</span>
					</div>
					<div class="cards-col">
						{#each data.history as session (session.id)}
							<div class="session-card history-card">
								{@render SessionCard({
									session,
									formatDate,
									statusLabel,
									adherenceColor,
									adherenceLabel,
									donutPath
								})}
							</div>
						{/each}
					</div>
				</section>
			{/if}

		</div>
	{/if}
</div>

<!-- Inline sub-component via snippet -->
{#snippet SessionCard(props: {
	session: SessionRow;
	formatDate: (s: string) => string;
	statusLabel: (s: SessionRow['status']) => string;
	adherenceColor: (n: number | null) => string;
	adherenceLabel: (n: number | null) => string;
	donutPath: (pct: number) => { dashArray: string; dashOffset: number };
})}
	{@const s = props.session}
	{@const pct = s.avgAdherence ?? 0}
	{@const dp = props.donutPath(pct)}
	{@const color = props.adherenceColor(s.avgAdherence)}

	<div class="card-inner">
		<div class="card-top">
			<div class="card-info">
				<div class="card-dates">
					{props.formatDate(s.startDate)} — {props.formatDate(s.endDate)}
				</div>
				<div class="card-meta-row">
					<span class="status-badge status-{s.status}">{props.statusLabel(s.status)}</span>
					{#if s.dietitianName}
						<span class="card-dietitian">· {s.dietitianName}</span>
					{/if}
				</div>
				{#if s.targetCalories}
					<div class="card-calories">
						<svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="opacity:0.6">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
						</svg>
						الهدف: {s.targetCalories.toLocaleString('ar')} سعرة
					</div>
				{/if}
			</div>

			<!-- Adherence ring -->
			<div class="adherence-ring" title="{props.adherenceLabel(s.avgAdherence)}">
				<svg width="56" height="56" viewBox="0 0 56 56">
					<circle cx="28" cy="28" r="22" fill="none" stroke="#e4e9e4" stroke-width="4" />
					{#if s.avgAdherence != null}
						<circle
							cx="28" cy="28" r="22"
							fill="none"
							stroke={color}
							stroke-width="4"
							stroke-linecap="round"
							stroke-dasharray={dp.dashArray}
							stroke-dashoffset={-dp.dashOffset}
							style="transition: stroke-dasharray 0.6s ease"
						/>
					{/if}
					<text x="28" y="33" text-anchor="middle" font-size="12" font-weight="700" fill={color}>
						{s.avgAdherence != null ? `${s.avgAdherence}%` : '—'}
					</text>
				</svg>
			</div>
		</div>

		{#if s.status !== 'completed'}
			<a href="/patient/dashboard/{s.id}" class="card-cta">
				{s.status === 'active' ? 'تتبع اليوم' : 'عرض الخطة'}
				<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
				</svg>
			</a>
		{:else}
			<a href="/patient/dashboard/{s.id}" class="card-cta secondary">
				عرض التفاصيل
				<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
				</svg>
			</a>
		{/if}
	</div>
{/snippet}

<style>
	.page {
		--fp-ink: #121816;
		--fp-muted: #5c6560;
		--fp-line: #e2e8e4;
		--fp-surface: #ffffff;
		--fp-accent: #2a9d62;
		--fp-bg: #f3f5f2;
		--font-display: 'El Messiri', 'Tajawal', serif;

		max-width: 680px;
		margin: 0 auto;
		padding: 32px 20px 60px;
		font-family: 'Tajawal', sans-serif;
		animation: page-in 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
	}
	@keyframes page-in {
		from { opacity: 0; transform: translateY(10px); }
		to { opacity: 1; transform: translateY(0); }
	}
	.page-header { margin-bottom: 32px; }
	.page-title {
		font-family: var(--font-display);
		font-size: clamp(1.5rem, 4vw, 1.9rem);
		font-weight: 700;
		color: var(--fp-ink);
		margin: 0 0 6px;
	}
	.page-subtitle { margin: 0; font-size: 13.5px; color: var(--fp-muted); }

	.empty-state {
		text-align: center;
		padding: 60px 20px;
	}
	.empty-title { font-size: 16px; font-weight: 700; color: var(--fp-ink); margin: 0 0 8px; }
	.empty-hint { font-size: 13.5px; color: var(--fp-muted); margin: 0; }

	/* ─── TIMELINE ─── */
	.timeline-root { display: flex; flex-direction: column; }

	.timeline-section { display: flex; flex-direction: column; gap: 12px; }

	.section-header {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-bottom: 4px;
	}
	.section-dot {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		flex-shrink: 0;
	}
	.upcoming-dot { background: #6b9ff5; }
	.current-dot { background: #2a9d62; }
	.history-dot { background: #b0b8b4; }
	.pulsing {
		box-shadow: 0 0 0 0 rgba(42, 157, 98, 0.4);
		animation: pulse-ring 2s infinite;
	}
	@keyframes pulse-ring {
		0% { box-shadow: 0 0 0 0 rgba(42, 157, 98, 0.4); }
		70% { box-shadow: 0 0 0 8px rgba(42, 157, 98, 0); }
		100% { box-shadow: 0 0 0 0 rgba(42, 157, 98, 0); }
	}
	.section-title {
		font-family: var(--font-display);
		font-size: 1.05rem;
		font-weight: 700;
		color: var(--fp-ink);
		margin: 0;
	}
	.section-count {
		font-size: 11px;
		font-weight: 700;
		color: var(--fp-muted);
		background: var(--fp-line);
		padding: 2px 8px;
		border-radius: 999px;
	}
	.current-count { background: rgba(42, 157, 98, 0.15); color: var(--fp-accent); }

	.timeline-connector {
		width: 2px;
		height: 28px;
		background: linear-gradient(to bottom, var(--fp-line), transparent);
		margin: 8px 0 8px 5px;
		align-self: flex-start;
	}

	.cards-col { display: flex; flex-direction: column; gap: 10px; }

	/* ─── SESSION CARD ─── */
	.session-card {
		background: var(--fp-surface);
		border: 1px solid var(--fp-line);
		border-radius: 14px;
		overflow: hidden;
		box-shadow: 0 2px 12px rgba(18, 24, 22, 0.04);
		transition: box-shadow 0.2s ease, transform 0.15s ease;
	}
	.session-card:hover { box-shadow: 0 6px 24px rgba(18, 24, 22, 0.08); transform: translateY(-1px); }

	.current-card {
		border-color: rgba(42, 157, 98, 0.3);
		box-shadow: 0 2px 14px rgba(42, 157, 98, 0.1);
	}
	.upcoming-card { border-color: rgba(107, 159, 245, 0.3); }
	.history-card { opacity: 0.88; }

	.card-inner { padding: 16px; }
	.card-top { display: flex; gap: 14px; align-items: flex-start; margin-bottom: 14px; }
	.card-info { flex: 1; min-width: 0; }
	.card-dates {
		font-size: 13px;
		font-weight: 700;
		color: var(--fp-ink);
		margin-bottom: 6px;
	}
	.card-meta-row {
		display: flex;
		align-items: center;
		gap: 6px;
		flex-wrap: wrap;
		margin-bottom: 6px;
	}
	.status-badge {
		font-size: 11px;
		font-weight: 700;
		padding: 2px 9px;
		border-radius: 999px;
	}
	.status-active { background: rgba(42, 157, 98, 0.15); color: #2a9d62; }
	.status-completed { background: rgba(18, 24, 22, 0.08); color: var(--fp-muted); }
	.status-draft { background: rgba(107, 159, 245, 0.15); color: #4a7fd4; }

	.card-dietitian { font-size: 11.5px; color: var(--fp-muted); }
	.card-calories {
		display: flex;
		align-items: center;
		gap: 4px;
		font-size: 11.5px;
		color: var(--fp-muted);
	}

	.adherence-ring { flex-shrink: 0; }

	.card-cta {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		width: 100%;
		padding: 10px;
		border-radius: 10px;
		border: 1px solid rgba(42, 157, 98, 0.35);
		background: linear-gradient(165deg, #34b16f 0%, #2a9d62 45%, #1f7a4a 100%);
		color: #fff;
		font-family: 'Tajawal', sans-serif;
		font-size: 13px;
		font-weight: 700;
		text-decoration: none;
		cursor: pointer;
		transition: box-shadow 0.2s ease, transform 0.15s ease;
		box-shadow: 0 3px 12px rgba(42, 157, 98, 0.25);
	}
	.card-cta:hover { box-shadow: 0 6px 20px rgba(42, 157, 98, 0.32); transform: scale(1.01); }
	.card-cta.secondary {
		background: var(--fp-bg);
		color: var(--fp-muted);
		border-color: var(--fp-line);
		box-shadow: none;
	}
	.card-cta.secondary:hover { background: var(--fp-surface); color: var(--fp-ink); }
</style>
