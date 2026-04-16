<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import type { PageData, ActionData } from './$types';
	import UserAvatarFallback from '$lib/components/UserAvatarFallback.svelte';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let search = $state('');
	let submittingPatientId = $state<number | null>(null);
	let activateEmail = $state('');
	let activatingPatient = $state(false);
	let activateDialogEl = $state<HTMLDialogElement | null>(null);

	const filtered = $derived(
		data.patients.filter((p) => {
			if (!search) return true;
			const q = search.toLowerCase();
			return (
				p.name.toLowerCase().includes(q) ||
				p.email.toLowerCase().includes(q) ||
				(p.phone ?? '').includes(q)
			);
		})
	);

	function relativeDate(dateStr: string | null | undefined) {
		if (!dateStr) return null;
		const d = new Date(dateStr);
		if (isNaN(d.getTime())) return dateStr;
		const now = new Date();
		const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
		if (diffDays === 0) return 'اليوم';
		if (diffDays === 1) return 'أمس';
		if (diffDays === 2) return 'منذ يومين';
		if (diffDays < 7) return `منذ ${diffDays} أيام`;
		const weeks = Math.floor(diffDays / 7);
		if (weeks === 1) return 'منذ أسبوع';
		if (weeks === 2) return 'منذ أسبوعين';
		if (weeks < 5) return `منذ ${weeks} أسابيع`;
		const months = Math.floor(diffDays / 30);
		if (months === 1) return 'منذ شهر';
		if (months === 2) return 'منذ شهرين';
		if (months < 12) return `منذ ${months} أشهر`;
		const years = Math.floor(diffDays / 365);
		if (years === 1) return 'منذ سنة';
		return `منذ ${years} سنوات`;
	}
</script>

<svelte:head>
	<title>الخطة الغذائية — نيوتريكير</title>
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
	<link
		href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

<div class="page">
	<!-- Header -->
	<div class="header">
		<div class="header-copy">
			<h1 class="title">الخطة الغذائية</h1>
			<p class="subtitle"><span class="subtitle-stat">{data.patients.length}</span> عميل مسجل</p>
		</div>
	</div>

	<div class="search-toolbar" dir="rtl">
		<div class="activate-wrap">
			<button type="button" class="activate-open-btn" onclick={() => activateDialogEl?.showModal()}>
				تفعيل مريض
			</button>
			<dialog bind:this={activateDialogEl} class="activate-dialog" dir="rtl">
				<button
					type="button"
					class="activate-dialog__close"
					onclick={() => activateDialogEl?.close()}
					aria-label="إغلاق"
				>
					×
				</button>
				<form
					method="POST"
					action="?/activatePatient"
					class="activate-dialog__form"
					use:enhance={() => {
						activatingPatient = true;
						return async ({ result, update }) => {
							await update({ reset: false });
							activatingPatient = false;
							if (
								result.type === 'success' &&
								'data' in result &&
								result.data &&
								typeof result.data === 'object' &&
								'success' in result.data &&
								result.data.success
							) {
								activateEmail = '';
								activateDialogEl?.close();
								await invalidateAll();
							}
						};
					}}
				>
					<div class="activate-dialog__inner">
						<label class="activate-dialog__label" for="activate-patient-email">البريد الإلكتروني للمريض</label>
						<input
							id="activate-patient-email"
							type="email"
							name="patientEmail"
							bind:value={activateEmail}
							autocomplete="email"
							placeholder="name@example.com"
							class="activate-dialog__input"
							dir="ltr"
							spellcheck="false"
							required
						/>
						<button
							type="submit"
							class="activate-dialog__submit"
							disabled={activatingPatient}
							aria-busy={activatingPatient}
						>
							{activatingPatient ? 'جاري التفعيل…' : 'تفعيل الوصول'}
						</button>
					</div>
				</form>
			</dialog>
		</div>
		<div class="search-wrapper">
			<svg class="search-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0" />
			</svg>
			<input type="text" bind:value={search} placeholder="ابحث بالاسم، البريد، أو رقم الهاتف..." class="search-input" />
			{#if search}
				<button class="search-clear" onclick={() => search = ''} aria-label="مسح البحث">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
				</button>
			{/if}
		</div>
	</div>

	{#if form && 'success' in form && form.success && 'message' in form}
		<div class="success-banner" role="status">{form.message}</div>
	{/if}

	{#if form?.error}
		<div class="error-banner">{form.error}</div>
	{/if}

	{#if data.patients.length === 0}
		<div class="empty-state">
			<div class="empty-icon">
				<svg width="32" height="32" fill="none" stroke="#3cb96b" stroke-width="1.5" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
				</svg>
			</div>
			<p class="empty-title">لا يوجد عملاء</p>
			<p class="empty-desc">أضف عملاء لبدء إنشاء الخطط الغذائية</p>
		</div>
	{:else if filtered.length === 0}
		<div class="empty-state empty-state--small">
			<svg width="24" height="24" fill="none" stroke="#8b909a" stroke-width="1.5" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0" />
			</svg>
			<p class="empty-desc">لا توجد نتائج مطابقة لـ "{search}"</p>
		</div>
	{:else}
		{#if search && filtered.length !== data.patients.length}
			<p class="results-count">{filtered.length} من {data.patients.length} عميل</p>
		{/if}

		<div class="list">
			{#each filtered as patient, i}
				<form
					method="POST"
					action="?/createSession"
					use:enhance={() => {
						submittingPatientId = patient.id;
						return async ({ update }) => {
							try {
								await update();
							} finally {
								submittingPatientId = null;
							}
						};
					}}
				>
					<input type="hidden" name="clientId" value={patient.id} />
					<button type="submit" class="list-row" disabled={submittingPatientId === patient.id}>
						<UserAvatarFallback name={patient.name} px={40} />

						<!-- Main info -->
						<div class="row-main">
							<p class="row-name">
								{patient.name}
								{#if patient.canAccessPatientApp === false}
									<span class="badge-pending">بانتظار التفعيل</span>
								{/if}
							</p>
							<p class="row-email">{patient.email}</p>
						</div>

						<!-- Phone -->
						{#if patient.phone}
							<div class="row-meta row-phone">
								<svg class="meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
								</svg>
								<span dir="ltr">{patient.phone}</span>
							</div>
						{/if}

						<!-- Last meal plan update -->
						<div class="row-meta row-date">
							<svg class="meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
							</svg>
							{#if patient.latestSession}
								<span>آخر تحديث: {relativeDate(patient.latestSession.lastUpdatedAt ?? patient.latestSession.startDate)}</span>
							{:else if patient.lastTouchSession}
								<span>آخر تحديث: {relativeDate(patient.lastTouchSession.lastUpdatedAt ?? patient.lastTouchSession.startDate)}</span>
							{:else}
								<span class="no-plan">لا توجد خطة</span>
							{/if}
						</div>

						<!-- Action arrow -->
						<div class="row-action">
							<span class="action-label">
								{#if patient.latestSession == null}
									خطة جديدة
								{:else}
									متابعة
								{/if}
							</span>
							<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<path d="M15 19l-7-7 7-7"/>
							</svg>
						</div>
					</button>
				</form>
			{/each}
		</div>
	{/if}
</div>

<style>
	.page {
		--mp-ink: #121816;
		--mp-muted: #5c6560;
		--mp-accent: #2a9d62;
		--font-display: 'El Messiri', 'Tajawal', serif;

		padding: 24px 32px;
		max-width: 1120px;
		margin: 0 auto;
		font-family: 'Tajawal', sans-serif;
	}

	/* Header */
	.header {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		margin-bottom: 26px;
		flex-wrap: wrap;
		gap: 18px;
	}
	.header-copy {
		max-width: min(100%, 420px);
	}
	.title {
		font-family: var(--font-display);
		font-size: clamp(1.65rem, 4vw, 2rem);
		font-weight: 700;
		color: var(--mp-ink);
		margin: 0 0 8px;
		line-height: 1.15;
		letter-spacing: -0.02em;
	}
	.subtitle {
		font-size: 13.5px;
		color: var(--mp-muted);
		margin: 0;
	}
	.subtitle-stat {
		font-weight: 800;
		color: var(--mp-accent);
		margin-inline-end: 6px;
	}

	/* Search + activate (one row) */
	.search-toolbar {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: 12px 16px;
		margin-bottom: 20px;
		flex-wrap: wrap;
	}

	.search-wrapper {
		position: relative;
		flex: 1 1 220px;
		min-width: 0;
		max-width: min(100%, 560px);
	}
	.search-icon {
		position: absolute;
		right: 13px;
		top: 50%;
		transform: translateY(-50%);
		width: 16px;
		height: 16px;
		color: #8b909a;
		pointer-events: none;
	}
	.search-input {
		width: 100%;
		border: 1px solid #e8eaed;
		border-radius: 10px;
		padding: 10px 42px 10px 36px;
		font-size: 14px;
		font-family: 'Tajawal', sans-serif;
		outline: none;
		box-sizing: border-box;
		transition: border .15s, box-shadow .15s;
		background: #fff;
		color: #1a1d23;
	}
	.search-input:focus {
		border-color: #3cb96b;
		box-shadow: 0 0 0 3px rgba(60, 185, 107, 0.1);
	}
	.search-input::placeholder { color: #b0b5c0; }
	.search-clear {
		position: absolute;
		left: 10px;
		top: 50%;
		transform: translateY(-50%);
		width: 24px;
		height: 24px;
		border: none;
		background: #f4f6f9;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		color: #8b909a;
		transition: all .15s;
	}
	.search-clear:hover { background: #e8eaed; color: #4b5563; }

	@keyframes activatePanelIn {
		from {
			opacity: 0;
			transform: translateY(16px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.activate-wrap {
		position: relative;
		flex: 0 0 auto;
		display: flex;
		align-items: center;
	}

	/*
	 * Mobile: avoid flex-basis 220px on column main axis (it became min-height ~220px
	 * under column-reverse and blew up the search area). Use column + order so search stays on top.
	 */
	@media (max-width: 560px) {
		.search-toolbar {
			flex-direction: column;
			align-items: stretch;
			gap: 10px;
			padding: 12px 14px;
			background: #fff;
			border: 1px solid #e8eaed;
			border-radius: 14px;
			margin-bottom: 16px;
			box-shadow: 0 2px 12px rgba(18, 24, 22, 0.04);
		}
		.search-wrapper {
			order: -1;
			flex: 0 1 auto;
			width: 100%;
			max-width: none;
			min-height: 0;
		}
		.activate-wrap {
			align-self: stretch;
			order: 0;
		}
		.activate-open-btn {
			width: 100%;
			min-height: 46px;
			box-sizing: border-box;
			display: inline-flex;
			align-items: center;
			justify-content: center;
		}
		.search-input {
			min-height: 46px;
			box-sizing: border-box;
		}
	}

	.activate-open-btn {
		font-family: 'IBM Plex Sans Arabic', 'Tajawal', system-ui, sans-serif;
		font-size: 14px;
		font-weight: 700;
		padding: 10px 20px;
		border: none;
		border-radius: 12px;
		cursor: pointer;
		color: #fff;
		background: linear-gradient(168deg, #22b077 0%, #0a5a3c 52%, #073c28 100%);
		box-shadow: 0 4px 14px rgba(10, 90, 60, 0.22);
		transition: transform 0.15s ease, filter 0.15s ease, box-shadow 0.15s ease;
	}

	.activate-open-btn:hover {
		transform: translateY(-1px);
		filter: brightness(1.03);
		box-shadow: 0 8px 22px rgba(10, 90, 60, 0.28);
	}

	.activate-open-btn:active {
		transform: translateY(0);
	}

	.activate-dialog {
		position: relative;
		margin: auto;
		border: 1px solid rgba(15, 35, 28, 0.1);
		border-radius: 20px;
		padding: 0;
		width: min(100vw - 32px, 400px);
		max-width: calc(100vw - 32px);
		box-shadow:
			0 4px 6px -1px rgba(15, 22, 18, 0.06),
			0 24px 48px -12px rgba(15, 22, 18, 0.2);
		background: #fff;
		overflow: hidden;
	}

	.activate-dialog::backdrop {
		background: rgba(12, 18, 15, 0.45);
		backdrop-filter: blur(2px);
	}

	.activate-dialog__close {
		position: absolute;
		inset-block-start: 10px;
		inset-inline-end: 10px;
		z-index: 1;
		width: 40px;
		height: 40px;
		border: none;
		border-radius: 12px;
		background: rgba(243, 244, 246, 0.9);
		color: #4b5563;
		font-size: 20px;
		line-height: 1;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: background 0.15s ease, color 0.15s ease;
	}

	.activate-dialog__close:hover {
		background: #e5e7eb;
		color: #111827;
	}

	.activate-dialog__form {
		margin: 0;
		padding: 0;
	}

	.activate-dialog__inner {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: 10px;
		padding: 52px 22px 22px;
		box-sizing: border-box;
	}

	.activate-dialog__label {
		font-family: 'IBM Plex Sans Arabic', 'Tajawal', system-ui, sans-serif;
		font-size: 13px;
		font-weight: 600;
		color: #374151;
		margin: 0;
		padding-inline-start: 2px;
	}

	.activate-dialog__input {
		width: 100%;
		box-sizing: border-box;
		border: 1px solid #d1d5db;
		border-radius: 12px;
		padding: 12px 14px;
		font-size: 14px;
		font-family: ui-monospace, 'Cascadia Code', 'Segoe UI Mono', monospace;
		background: #fafafa;
		color: #0c1611;
		outline: none;
		transition:
			border-color 0.15s ease,
			box-shadow 0.15s ease,
			background 0.15s ease;
	}

	.activate-dialog__input:hover {
		border-color: #bfc5ce;
		background: #fff;
	}

	.activate-dialog__input:focus {
		border-color: #22b077;
		background: #fff;
		box-shadow: 0 0 0 3px rgba(34, 176, 119, 0.2);
	}

	.activate-dialog__input::placeholder {
		color: #9ca3af;
	}

	.activate-dialog__submit {
		margin-top: 4px;
		width: 100%;
		box-sizing: border-box;
		padding: 12px 20px;
		border: none;
		border-radius: 12px;
		cursor: pointer;
		font-family: 'IBM Plex Sans Arabic', 'Tajawal', system-ui, sans-serif;
		font-size: 15px;
		font-weight: 700;
		color: #fff;
		line-height: 1.35;
		background: linear-gradient(168deg, #22b077 0%, #0a5a3c 100%);
		box-shadow: 0 2px 8px rgba(10, 90, 60, 0.25);
		transition: transform 0.12s ease, filter 0.12s ease, box-shadow 0.12s ease;
	}

	.activate-dialog__submit:hover:not(:disabled) {
		filter: brightness(1.04);
		box-shadow: 0 4px 14px rgba(10, 90, 60, 0.3);
	}

	.activate-dialog__submit:active:not(:disabled) {
		transform: scale(0.99);
	}

	.activate-dialog__submit:disabled {
		opacity: 0.75;
		cursor: wait;
	}

	.success-banner {
		background: linear-gradient(105deg, #ecfdf5, #e8faf0);
		border: 1px solid rgba(34, 176, 119, 0.35);
		color: #0f3d28;
		padding: 14px 18px;
		border-radius: 14px;
		margin-bottom: 18px;
		font-size: 13.5px;
		font-weight: 500;
		line-height: 1.55;
		box-shadow: 0 6px 20px rgba(15, 61, 40, 0.06);
		animation: activatePanelIn 0.45s cubic-bezier(0.22, 1, 0.36, 1) both;
	}

	.badge-pending {
		display: inline-block;
		margin-inline-start: 8px;
		padding: 2px 8px;
		font-size: 10px;
		font-weight: 700;
		vertical-align: middle;
		border-radius: 6px;
		background: #fef3c7;
		color: #92400e;
	}

	/* Error */
	.error-banner {
		background: #fef2f2;
		border: 1px solid #fecaca;
		color: #dc2626;
		padding: 12px 16px;
		border-radius: 10px;
		margin-bottom: 16px;
		font-size: 13px;
	}

	/* Empty state */
	.empty-state {
		text-align: center;
		padding: 60px 20px;
		color: #8b909a;
	}
	.empty-state--small { padding: 40px 20px; }
	.empty-icon {
		width: 64px;
		height: 64px;
		background: linear-gradient(135deg, #edf9f2, #d1fae5);
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		margin: 0 auto 16px;
	}
	.empty-title {
		font-size: 16px;
		font-weight: 600;
		color: #4b5563;
		margin: 0 0 6px;
	}
	.empty-desc {
		font-size: 13px;
		margin: 8px 0 0;
		color: #8b909a;
	}

	/* Results count */
	.results-count {
		font-size: 12px;
		color: #8b909a;
		margin: 0 0 10px;
	}

	/* List */
	.list {
		background: #fff;
		border: 1px solid #e8eaed;
		border-radius: 14px;
		overflow: hidden;
	}

	/* Row */
	.list-row {
		display: flex;
		align-items: center;
		gap: 14px;
		width: 100%;
		padding: 14px 18px;
		text-align: right;
		background: transparent;
		border: none;
		border-bottom: 1px solid #f0f2f5;
		font-family: 'Tajawal', sans-serif;
		cursor: pointer;
		transition: background .15s;
	}
	form:last-child .list-row {
		border-bottom: none;
	}
	.list-row:hover {
		background: #f9fafb;
	}
	.list-row:active {
		background: #f0f2f5;
	}
	.list-row:disabled {
		opacity: 0.65;
		cursor: wait;
	}

	/* Main info */
	.row-main {
		flex: 1;
		min-width: 0;
	}
	.row-name {
		font-size: 14px;
		font-weight: 600;
		color: #1a1d23;
		margin: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.row-email {
		font-size: 12px;
		color: #8b909a;
		margin: 2px 0 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* Meta columns */
	.row-meta {
		display: flex;
		align-items: center;
		gap: 5px;
		font-size: 12.5px;
		color: #6b7280;
		flex-shrink: 0;
		white-space: nowrap;
	}
	.row-phone { min-width: 130px; }
	.row-date { min-width: 160px; }
	.meta-icon {
		width: 13px;
		height: 13px;
		flex-shrink: 0;
		opacity: 0.5;
	}
	.no-plan { color: #b0b5c0; }

	/* Action */
	.row-action {
		display: flex;
		align-items: center;
		gap: 4px;
		color: #3cb96b;
		flex-shrink: 0;
	}
	.action-label {
		font-size: 12px;
		font-weight: 600;
	}
	.list-row:hover .row-action {
		color: #1a9e60;
	}

	/* Responsive: hide phone/date on small screens */
	@media (max-width: 640px) {
		.row-phone { display: none; }
		.row-date { display: none; }
		.action-label { display: none; }
	}
</style>
