<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import UserAvatarFallback from '$lib/components/UserAvatarFallback.svelte';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: any } = $props();

	let accountOpen = $state(false);

	afterNavigate(() => {
		accountOpen = false;
	});

	function closeAccount() {
		accountOpen = false;
	}

	function toggleAccount() {
		accountOpen = !accountOpen;
	}

	const navItems = [
		{
			href: '/dietitian/meal-plan',
			label: 'الخطة الغذائية',
			shortLabel: 'الخطة',
			icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />`
		},
		{
			href: '/dietitian/recipes',
			label: 'الوصفات',
			shortLabel: 'الوصفات',
			icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />`
		},
		{
			href: '/dietitian/messages',
			label: 'الرسائل',
			shortLabel: 'رسائل',
			icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />`
		}
	];

	function isActive(href: string) {
		return page.url.pathname.startsWith(href);
	}
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && closeAccount()} />

<svelte:head>
	<link
		href="https://fonts.googleapis.com/css2?family=El+Messiri:wght@500;600;700&family=Tajawal:wght@400;500;600;700;800&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

<style>
	.layout-shell {
		--nc-ink: #121816;
		--nc-muted: #5a635e;
		--nc-line: #e4e9e4;
		--nc-surface: #ffffff;
		--nc-bg: #f3f5f2;
		--nc-bg-warm: #faf9f6;
		--nc-accent: #2a9d62;
		--nc-accent-hover: #248a56;
		--nc-accent-soft: #e6f4eb;
		--nc-accent-glow: rgba(42, 157, 98, 0.22);
		--nc-radius: 12px;
		--nc-shadow-sm: 0 1px 2px rgba(18, 24, 22, 0.05);
		--nc-shadow-md: 0 8px 30px rgba(18, 24, 22, 0.07);
		--font-display: 'El Messiri', 'Tajawal', serif;
		--font-ui: 'Tajawal', sans-serif;

		display: flex;
		min-height: 100vh;
		min-height: 100dvh;
		font-family: var(--font-ui);
		color: var(--nc-ink);
		background: var(--nc-bg);
		background-image:
			radial-gradient(ellipse 120% 80% at 100% 0%, rgba(42, 157, 98, 0.06), transparent 50%),
			radial-gradient(ellipse 90% 60% at 0% 100%, rgba(30, 100, 80, 0.04), transparent 45%);
	}

	/* ─── SIDEBAR (DESKTOP) ─── */
	.sidebar {
		width: 228px;
		background: var(--nc-surface);
		border-left: 1px solid var(--nc-line);
		display: flex;
		flex-direction: column;
		flex-shrink: 0;
		box-shadow: var(--nc-shadow-sm);
		position: sticky;
		top: 0;
		height: 100vh;
		height: 100dvh;
		overflow-y: auto;
	}

	.brand-block {
		padding: 18px 14px 16px;
		min-height: 96px;
		border-bottom: 1px solid rgba(228, 233, 228, 0.85);
		display: flex;
		justify-content: center;
		align-items: center;
		background: linear-gradient(180deg, var(--nc-surface) 0%, var(--nc-bg-warm) 100%);
	}

	.brand-link {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		border-radius: 12px;
		padding: 6px;
		transition: background 0.18s ease, transform 0.18s ease, box-shadow 0.18s ease;
	}

	.brand-link:hover {
		background: rgba(42, 157, 98, 0.08);
		box-shadow: 0 6px 20px rgba(42, 157, 98, 0.15);
		transform: translateY(-1px);
	}

	.brand-link:focus-visible {
		outline: 2px solid var(--nc-accent);
		outline-offset: 2px;
	}

	.brand-logo {
		height: 52px;
		width: auto;
		max-width: 196px;
		object-fit: contain;
	}

	.nav-area {
		flex: 1;
		padding: 14px 10px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.nav-link {
		position: relative;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 14px;
		border-radius: var(--nc-radius);
		text-decoration: none;
		font-size: 13.5px;
		font-weight: 500;
		color: var(--nc-muted);
		background: transparent;
		transition:
			color 0.2s ease,
			background 0.2s ease,
			transform 0.15s ease;
	}

	.nav-link:hover {
		color: var(--nc-ink);
		background: rgba(42, 157, 98, 0.06);
	}

	.nav-link:focus-visible {
		outline: 2px solid var(--nc-accent);
		outline-offset: 2px;
	}

	.nav-link.active {
		color: var(--nc-accent);
		font-weight: 700;
		background: var(--nc-accent-soft);
		border-inline-start: 3px solid var(--nc-accent);
	}

	.nav-link.active svg {
		opacity: 1;
		color: var(--nc-accent);
	}

	.nav-link svg {
		flex-shrink: 0;
		opacity: 0.72;
		transition: opacity 0.2s ease;
	}

	.user-block {
		padding: 14px 10px 18px;
		border-top: 1px solid var(--nc-line);
		background: linear-gradient(0deg, var(--nc-bg-warm) 0%, var(--nc-surface) 100%);
	}

	.user-row {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 12px;
		margin-bottom: 8px;
	}

	.logout-btn {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		padding: 8px;
		border-radius: 10px;
		border: none;
		background: transparent;
		cursor: pointer;
		font-size: 12.5px;
		color: var(--nc-muted);
		font-family: var(--font-ui);
		transition:
			background 0.15s ease,
			color 0.15s ease;
	}

	.logout-btn:hover {
		background: rgba(18, 24, 22, 0.05);
		color: var(--nc-ink);
	}

	.logout-btn:focus-visible {
		outline: 2px solid var(--nc-accent);
		outline-offset: 2px;
	}

	/* ─── BOTTOM NAV (MOBILE) ─── */
	.bottom-nav {
		display: none;
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		background: rgba(255, 255, 255, 0.92);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		border-top: 1px solid var(--nc-line);
		z-index: 400;
		padding: 6px 0 max(8px, env(safe-area-inset-bottom));
		box-shadow: 0 -12px 40px rgba(18, 24, 22, 0.06);
	}

	.bottom-nav-inner {
		display: flex;
		justify-content: space-around;
		align-items: center;
		max-width: 420px;
		margin: 0 auto;
	}

	.bottom-nav-item {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 3px;
		padding: 8px 14px;
		text-decoration: none;
		font-size: 10px;
		font-weight: 500;
		color: var(--nc-muted);
		transition:
			color 0.2s ease,
			transform 0.2s ease;
		border-radius: 12px;
		min-width: 64px;
	}

	.bottom-nav-item:active {
		transform: scale(0.96);
	}

	.bottom-nav-item:focus-visible {
		outline: 2px solid var(--nc-accent);
		outline-offset: 2px;
	}

	.bottom-nav-item.active {
		color: var(--nc-accent);
		font-weight: 700;
		background: var(--nc-accent-soft);
	}

	.bottom-nav-item.active svg {
		transform: translateY(-1px);
	}

	.main-content {
		flex: 1;
		overflow: auto;
		scroll-behavior: smooth;
		min-width: 0;
	}

	/* ─── MOBILE CHROME (≤900px) ─── */
	.mobile-top {
		display: none;
	}

	.mobile-top-inner {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		max-width: 100%;
		padding-inline: 14px;
		padding-block: 10px;
		min-height: 56px;
	}

	.mobile-brand {
		display: flex;
		align-items: center;
		gap: 10px;
		min-width: 0;
	}

	.mobile-brand img {
		height: 32px;
		width: auto;
		max-width: 132px;
		object-fit: contain;
	}

	.account-trigger {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 10px 6px 8px;
		border-radius: 999px;
		border: 1px solid rgba(228, 233, 228, 0.95);
		background: linear-gradient(165deg, #fff 0%, var(--nc-bg-warm) 100%);
		box-shadow: var(--nc-shadow-sm);
		cursor: pointer;
		font-family: var(--font-ui);
		transition:
			border-color 0.2s ease,
			box-shadow 0.2s ease,
			transform 0.15s ease;
	}

	.account-trigger:hover {
		border-color: rgba(42, 157, 98, 0.35);
		box-shadow: 0 4px 18px var(--nc-accent-glow);
	}

	.account-trigger:active {
		transform: scale(0.98);
	}

	.account-trigger:focus-visible {
		outline: 2px solid var(--nc-accent);
		outline-offset: 2px;
	}

	.account-trigger[aria-expanded='true'] {
		border-color: rgba(42, 157, 98, 0.45);
		background: var(--nc-accent-soft);
	}

	.chevron {
		display: flex;
		color: var(--nc-muted);
		transition: transform 0.25s cubic-bezier(0.22, 1, 0.36, 1);
	}

	.account-trigger[aria-expanded='true'] .chevron {
		transform: rotate(-180deg);
		color: var(--nc-accent);
	}

	.drawer-backdrop {
		display: none;
		position: fixed;
		inset: 0;
		background: rgba(18, 24, 22, 0.38);
		backdrop-filter: blur(4px);
		-webkit-backdrop-filter: blur(4px);
		z-index: 449;
		opacity: 0;
		pointer-events: none;
		transition: opacity 0.28s ease;
		border: none;
		padding: 0;
		margin: 0;
		cursor: pointer;
		appearance: none;
		-webkit-appearance: none;
	}

	.drawer-backdrop.visible {
		opacity: 1;
		pointer-events: auto;
	}

	.account-drawer {
		display: none;
		position: fixed;
		left: 0;
		top: 0;
		bottom: 0;
		width: min(300px, 88vw);
		max-width: 100%;
		background: var(--nc-surface);
		z-index: 460;
		box-shadow: 16px 0 48px rgba(18, 24, 22, 0.12);
		border-inline-end: 1px solid var(--nc-line);
		flex-direction: column;
		padding: calc(12px + env(safe-area-inset-top, 0px)) 16px max(20px, env(safe-area-inset-bottom, 0px));
		transform: translateX(-100%);
		transition: transform 0.32s cubic-bezier(0.22, 1, 0.36, 1);
		visibility: hidden;
	}

	.account-drawer.open {
		transform: translateX(0);
		visibility: visible;
	}

	.drawer-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 20px;
		padding-bottom: 14px;
		border-bottom: 1px solid rgba(228, 233, 228, 0.85);
	}

	.drawer-title {
		margin: 0;
		font-family: var(--font-display);
		font-size: 1.1rem;
		font-weight: 700;
		color: var(--nc-ink);
	}

	.drawer-close {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		border: none;
		border-radius: 12px;
		background: rgba(18, 24, 22, 0.05);
		color: var(--nc-muted);
		cursor: pointer;
		transition:
			background 0.15s ease,
			color 0.15s ease;
	}

	.drawer-close:hover {
		background: rgba(42, 157, 98, 0.1);
		color: var(--nc-ink);
	}

	.drawer-close:focus-visible {
		outline: 2px solid var(--nc-accent);
		outline-offset: 2px;
	}

	.drawer-user {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px;
		border-radius: var(--nc-radius);
		background: linear-gradient(135deg, var(--nc-bg-warm) 0%, #fff 100%);
		border: 1px solid rgba(228, 233, 228, 0.9);
		margin-bottom: auto;
	}

	.drawer-user-meta {
		flex: 1;
		min-width: 0;
	}

	.drawer-user-name {
		margin: 0;
		font-size: 14px;
		font-weight: 800;
		color: var(--nc-ink);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.drawer-user-email {
		margin: 4px 0 0;
		font-size: 12px;
		color: var(--nc-muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.drawer-logout {
		margin-top: 18px;
	}

	.drawer-logout .logout-btn {
		border: 1px solid var(--nc-line);
		background: var(--nc-surface);
		padding-block: 12px;
		font-weight: 600;
	}

	.drawer-logout .logout-btn:hover {
		border-color: rgba(42, 157, 98, 0.35);
		background: rgba(42, 157, 98, 0.06);
	}

	@media (min-width: 901px) {
		.mobile-top,
		.drawer-backdrop,
		.account-drawer {
			display: none !important;
		}
	}

	@media (max-width: 900px) {
		.mobile-top {
			display: block;
			position: fixed;
			top: 0;
			left: 0;
			right: 0;
			z-index: 380;
			padding-top: env(safe-area-inset-top, 0px);
			background: rgba(255, 255, 255, 0.88);
			backdrop-filter: blur(14px);
			-webkit-backdrop-filter: blur(14px);
			border-bottom: 1px solid rgba(228, 233, 228, 0.75);
			box-shadow: 0 8px 28px rgba(18, 24, 22, 0.05);
		}

		.mobile-top::after {
			content: '';
			display: block;
			height: 2px;
			margin-inline: 14px;
			margin-top: -1px;
			border-radius: 2px;
			background: linear-gradient(
				90deg,
				transparent,
				var(--nc-accent) 35%,
				var(--nc-accent) 65%,
				transparent
			);
			opacity: 0.35;
		}

		.drawer-backdrop {
			display: block;
		}

		.account-drawer {
			display: flex;
		}

		.sidebar {
			display: none;
		}
		.bottom-nav {
			display: block;
		}
		.main-content {
			padding-top: calc(74px + env(safe-area-inset-top, 0px));
			padding-bottom: calc(76px + env(safe-area-inset-bottom, 0px));
			padding-inline: max(12px, env(safe-area-inset-left, 0px)) max(12px, env(safe-area-inset-right, 0px));
		}

		.bottom-nav-inner {
			max-width: none;
			padding-inline: 4px;
		}

		.bottom-nav-item {
			min-width: 0;
			flex: 1;
			padding: 10px 6px;
			font-size: 10.5px;
			min-height: 48px;
			justify-content: center;
		}

		.bottom-nav-item span {
			max-width: 100%;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}
	}

</style>

<div dir="rtl" class="layout-shell">
	<header class="mobile-top" aria-label="شريط التطبيق">
		<div class="mobile-top-inner">
			<div class="mobile-brand">
				<img src="/logo-name.png" alt="نيوتريكير" />
			</div>
			<button
				type="button"
				class="account-trigger"
				onclick={toggleAccount}
				aria-expanded={accountOpen}
				aria-controls="dietitian-account-drawer"
				aria-label="الحساب والإعدادات"
			>
				<UserAvatarFallback name={data.user.name} px={32} />
				<span class="chevron" aria-hidden="true">
					<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2.2"
							d="M19 9l-7 7-7-7"
						/>
					</svg>
				</span>
			</button>
		</div>
	</header>

	<!-- Sidebar (hidden on mobile) -->
	<aside class="sidebar">
		<div class="brand-block">
			<a href="/dietitian/meal-plan" class="brand-link" aria-label="الذهاب إلى الخطة الغذائية">
				<img src="/logo-name.png" alt="نيوتريكير" class="brand-logo" />
			</a>
		</div>

		<nav class="nav-area" aria-label="التنقل الرئيسي">
			{#each navItems as item}
				{@const active = isActive(item.href)}
				<a href={item.href} class="nav-link" class:active>
					<svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						{@html item.icon}
					</svg>
					{item.label}
				</a>
			{/each}
		</nav>

		<div class="user-block">
			<div class="user-row">
				<UserAvatarFallback name={data.user.name} px={36} />
				<div style="flex:1; min-width:0;">
					<p
						style="font-size:13px; font-weight:700; color:var(--nc-ink); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin:0;"
					>
						{data.user.name}
					</p>
					<p
						style="font-size:11px; color:var(--nc-muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin:2px 0 0;"
					>
						{data.user.email}
					</p>
				</div>
			</div>
			<form method="POST" action="/logout">
				<button type="submit" class="logout-btn">
					<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
						/>
					</svg>
					تسجيل الخروج
				</button>
			</form>
		</div>
	</aside>

	<!-- Main content -->
	<main class="main-content">
		{@render children()}
	</main>

	<!-- Bottom nav (mobile only) -->
	<nav class="bottom-nav" dir="rtl" aria-label="التنقل السفلي">
		<div class="bottom-nav-inner">
			{#each navItems as item}
				{@const active = isActive(item.href)}
				<a href={item.href} class="bottom-nav-item" class:active>
					<svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="opacity:{active ? '1' : '0.6'};">
						{@html item.icon}
					</svg>
					<span>{item.shortLabel}</span>
				</a>
			{/each}
		</div>
	</nav>

	<button
		type="button"
		class="drawer-backdrop"
		class:visible={accountOpen}
		onclick={closeAccount}
		aria-label="إغلاق القائمة"
		aria-hidden={!accountOpen}
		tabindex={accountOpen ? 0 : -1}
	></button>

	<aside
		id="dietitian-account-drawer"
		class="account-drawer"
		class:open={accountOpen}
		aria-hidden={!accountOpen}
	>
		<div class="drawer-head">
			<h2 class="drawer-title">حسابك</h2>
			<button type="button" class="drawer-close" onclick={closeAccount} aria-label="إغلاق">
				<svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M6 18L18 6M6 6l12 12"
					/>
				</svg>
			</button>
		</div>
		<div class="drawer-user">
			<UserAvatarFallback name={data.user.name} px={44} />
			<div class="drawer-user-meta">
				<p class="drawer-user-name">{data.user.name}</p>
				<p class="drawer-user-email">{data.user.email}</p>
			</div>
		</div>
		<div class="drawer-logout">
			<form method="POST" action="/logout">
				<button type="submit" class="logout-btn">
					<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
						/>
					</svg>
					تسجيل الخروج
				</button>
			</form>
		</div>
	</aside>
</div>
