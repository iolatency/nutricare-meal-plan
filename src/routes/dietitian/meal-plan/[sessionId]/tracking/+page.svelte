<script lang="ts">
	import UserAvatarFallback from '$lib/components/UserAvatarFallback.svelte';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();

	function toLocalYmd(d: Date) {
		const y = d.getFullYear();
		const m = String(d.getMonth() + 1).padStart(2, '0');
		const day = String(d.getDate()).padStart(2, '0');
		return `${y}-${m}-${day}`;
	}

	function shiftDate(dateStr: string, days: number) {
		const d = new Date(dateStr + 'T00:00:00');
		d.setDate(d.getDate() + days);
		return toLocalYmd(d);
	}
	function prevDate(dateStr: string, type: string) {
		return shiftDate(dateStr, type === 'daily' ? -1 : -7);
	}
	function nextDate(dateStr: string, type: string) {
		return shiftDate(dateStr, type === 'daily' ? 1 : 7);
	}

	const AR_DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
	const AR_MONTHS = [
		'يناير',
		'فبراير',
		'مارس',
		'أبريل',
		'مايو',
		'يونيو',
		'يوليو',
		'أغسطس',
		'سبتمبر',
		'أكتوبر',
		'نوفمبر',
		'ديسمبر'
	];

	function fmtDate(dateStr: string) {
		const d = new Date(dateStr + 'T00:00:00');
		return `${AR_DAYS[d.getDay()]} ${d.getDate()} ${AR_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
	}

	function navLabel() {
		if (data.planType === 'daily') return fmtDate(data.dateFrom);
		const from = new Date(data.dateFrom + 'T00:00:00');
		const to = new Date(data.dateTo + 'T00:00:00');
		return `${AR_DAYS[from.getDay()]} ${from.getDate()} ${AR_MONTHS[from.getMonth()]} — ${AR_DAYS[to.getDay()]} ${to.getDate()} ${AR_MONTHS[to.getMonth()]} ${to.getFullYear()}`;
	}

	const MEAL_ICONS: Record<string, string> = {
		breakfast: '🌅',
		morning_snack: '🍎',
		lunch: '☀️',
		afternoon_snack: '🍊',
		dinner: '🌙',
		other: '🍽️'
	};

	const td = $derived(data.trackingData);

	function donutPath(value: number, total: number, startAngle: number, r = 38) {
		if (total === 0) return '';
		const pct = value / total;
		const angle = pct * 2 * Math.PI;
		const cx = 50,
			cy = 50;
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
		if (td.eaten > 0) {
			segs.push({ d: donutPath(td.eaten, total, angle), color: '#3cb96b' });
			angle += (td.eaten / total) * 2 * Math.PI;
		}
		if (td.skipped > 0) {
			segs.push({ d: donutPath(td.skipped, total, angle), color: '#f59e0b' });
			angle += (td.skipped / total) * 2 * Math.PI;
		}
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

<div class="page">
	<!-- Topbar -->
	<div class="topbar">
		<a href="/dietitian/meal-plan/{data.session.id}" class="back-link topbar-back">
			<svg
				width="15"
				height="15"
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
				aria-hidden="true"
			>
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
			</svg>
			الخطة الغذائية
		</a>
		<div class="topbar-divider" aria-hidden="true"></div>
		<div class="topbar-main">
			<div class="topbar-user">
				<UserAvatarFallback name={data.patient.name} px={36} />
				<div class="topbar-user-text">
					<div class="topbar-name">{data.patient.name}</div>
					<div class="topbar-meta">
						{data.planType === 'daily' ? data.dateFrom : `${data.dateFrom} — ${data.dateTo}`}
					</div>
				</div>
			</div>
			<div class="topbar-toggles">
				<a
					href="?type=daily&date={data.dateFrom}"
					class="toggle-pill"
					class:on={data.planType === 'daily'}
					class:off={data.planType !== 'daily'}
				>
					يومية
				</a>
				<a
					href="?type=weekly&date={data.dateFrom}"
					class="toggle-pill"
					class:on={data.planType === 'weekly'}
					class:off={data.planType !== 'weekly'}
				>
					أسبوعية
				</a>
			</div>
		</div>
		<div class="badge-tracker topbar-badge">
			<svg
				width="13"
				height="13"
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
				aria-hidden="true"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
				/>
			</svg>
			<span>لوحة التتبع</span>
		</div>
	</div>

	<div class="content">
		<!-- Date navigation -->
		<div class="week-nav">
			<a
				class="week-nav-arrow"
				href="?type={data.planType}&date={prevDate(data.dateFrom, data.planType)}"
				title="السابق"
			>
				<svg
					width="18"
					height="18"
					fill="none"
					stroke="currentColor"
					stroke-width="2.2"
					viewBox="0 0 24 24"
					><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" /></svg
				>
			</a>
			<div class="week-nav-center" aria-live="polite">
				<span>{navLabel()}</span>
			</div>
			<a
				class="week-nav-arrow"
				href="?type={data.planType}&date={nextDate(data.dateFrom, data.planType)}"
				title="التالي"
			>
				<svg
					width="18"
					height="18"
					fill="none"
					stroke="currentColor"
					stroke-width="2.2"
					viewBox="0 0 24 24"
					><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" /></svg
				>
			</a>
		</div>

		{#if !td}
			<div class="empty-box">
				<div
					style="width:64px; height:64px; background:#edf9f2; border-radius:50%; display:flex; align-items:center; justify-content:center;"
				>
					<svg width="28" height="28" fill="none" stroke="#3cb96b" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="1.5"
							d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
						/>
					</svg>
				</div>
				<p style="font-size:16px; font-weight:600; color:#1a1d23; margin:0;">
					لا توجد خطة غذائية بعد
				</p>
				<p style="font-size:13px; color:#8b909a; margin:0;">
					أنشئ الخطة أولاً ثم ستظهر بيانات التتبع هنا
				</p>
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
						<span
							>{td.skipped > 0 ? Math.round((td.withReplacement / td.skipped) * 100) : 0}% من
							الوجبات المتخطاة لديها ملاحظة</span
						>
					</div>
				</div>
			</div>

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
									<path
										d={seg.d}
										fill="none"
										stroke={seg.color}
										stroke-width="13"
										stroke-linecap="butt"
									/>
								{/each}
								<text
									x="50"
									y="45"
									text-anchor="middle"
									fill="#12151c"
									font-size="15"
									font-weight="800"
									font-family="Tajawal,sans-serif">{td.adherenceRate}%</text
								>
								<text
									x="50"
									y="59"
									text-anchor="middle"
									fill="#8b909a"
									font-size="8.5"
									font-family="Tajawal,sans-serif">التزام</text
								>
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
					<div class="card-title">الأداء اليومي</div>
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
										<div class="day-stacked" style="height:{eH + sH + nH}px; min-height:4px;">
											<div style="width:100%; height:{eH}px; background:#3cb96b;"></div>
											<div style="width:100%; height:{sH}px; background:#f59e0b;"></div>
											<div style="width:100%; height:{nH}px; background:#e8eaed;"></div>
										</div>
										<div class="day-label">{day.label.slice(0, 3)}</div>
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
							<div class="type-label">{MEAL_ICONS[type] ?? '🍽️'} {td.MEAL_NAMES[type] ?? type}</div>
							<div>
								<div class="bar-track">
									<div class="bar-fill" style="width:{pct}%; background:{fillColor};"></div>
								</div>
								<div style="display:flex; gap:10px; font-size:10px; color:#8b909a; margin-top:3px;">
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

			<!-- Replacement notes -->
			{#if td.replacementNotes.length > 0}
				<div class="card">
					<div class="card-title">ملاحظات البدائل</div>
					{#each td.replacementNotes as note}
						<div class="note-item">
							<div style="margin-bottom:6px;">
								<span class="note-tag">📅 {note.date}</span>
								<span class="note-tag"
									>{MEAL_ICONS[note.mealType] ?? '🍽️'}
									{td.MEAL_NAMES[note.mealType] ?? note.mealType}</span
								>
							</div>
							<div style="font-size:13px; color:#4b5563; line-height:1.5;">{note.note}</div>
						</div>
					{/each}
				</div>
			{:else if td.skipped > 0}
				<div class="card">
					<div class="card-title">ملاحظات البدائل</div>
					<p style="color:#8b909a; font-size:13px; text-align:center; padding:16px 0;">
						لا توجد ملاحظات بديل للوجبات المتخطاة
					</p>
				</div>
			{/if}
		{/if}
	</div>
</div>

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
		/* mobile: row1 = back + badge, row2 = user + toggles */
		grid-template-columns: minmax(0, 1fr) auto;
		grid-template-areas:
			'back badge'
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
		justify-content: space-between;
		gap: 10px;
		min-width: 0;
	}

	.topbar-badge {
		grid-area: badge;
		justify-self: end;
		flex-shrink: 0;
	}

	.topbar-divider {
		display: none;
		width: 1px;
		height: 18px;
		background: var(--nc-line);
		flex-shrink: 0;
	}

	.topbar-user {
		display: flex;
		align-items: center;
		gap: 10px;
		flex: 1;
		min-width: 0;
	}

	.topbar-user-text {
		min-width: 0;
	}

	.topbar-name {
		font-size: clamp(12px, 3.2vw, 14px);
		font-weight: 700;
		color: var(--nc-ink);
		line-height: 1.25;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: min(52vw, 220px);
	}

	.topbar-meta {
		font-size: 11px;
		color: var(--nc-muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: min(60vw, 260px);
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
		transition:
			background 0.15s,
			color 0.15s,
			border-color 0.15s;
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

	.badge-tracker {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		background: linear-gradient(135deg, #e8f8f0, #f0fdf4);
		border: 1px solid #bfe8d0;
		border-radius: 10px;
		padding: 5px 10px;
		flex-shrink: 0;
	}

	.badge-tracker span {
		font-size: 12px;
		font-weight: 700;
		color: var(--nc-accent);
		font-family: var(--font-display);
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
		grid-template-columns: repeat(3, 1fr);
		gap: clamp(10px, 2.5vw, 14px);
		margin-bottom: 16px;
	}

	.stat-card {
		background: var(--nc-surface);
		border-radius: var(--nc-radius);
		border: 1px solid var(--nc-line);
		box-shadow: var(--nc-shadow);
		padding: clamp(14px, 3vw, 20px) clamp(14px, 3vw, 20px);
		transition:
			transform 0.2s ease,
			box-shadow 0.2s ease;
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
		padding: 0 4px 6px;
	}

	.day-bar-wrap {
		display: flex;
		align-items: flex-end;
		justify-content: center;
		gap: clamp(4px, 1.5vw, 8px);
		height: clamp(88px, 22vw, 118px);
		width: max-content;
		min-width: 100%;
		padding-inline: 2px;
	}

	.day-bar-col {
		flex: 0 0 clamp(26px, 7vw, 36px);
		min-width: 26px;
		max-width: 40px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
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
		font-size: clamp(9px, 2.4vw, 10px);
		color: var(--nc-muted);
		white-space: nowrap;
	}

	.day-date {
		font-size: 8px;
		color: #c4c9d4;
	}

	.type-row {
		display: grid;
		grid-template-columns: minmax(72px, 100px) 1fr 40px;
		align-items: center;
		gap: 10px;
		margin-bottom: 14px;
	}

	.type-label {
		font-size: clamp(11px, 3vw, 12px);
		color: #374151;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
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

	.week-nav-center:hover {
		border-color: var(--nc-accent-2);
		background: #f7fdf9;
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
		justify-content: center;
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

	@media (max-width: 640px) {
		.stat-grid {
			grid-template-columns: 1fr 1fr;
		}

		.stat-card:last-child {
			grid-column: 1 / -1;
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
	}

	@media (max-width: 400px) {
		.stat-grid {
			grid-template-columns: 1fr;
		}

		.stat-card:last-child {
			grid-column: auto;
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
			grid-template-columns: auto 1px minmax(0, 1fr) auto;
			grid-template-areas: 'back divider main badge';
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

		.badge-tracker {
			padding: 6px 12px;
		}
	}
</style>
