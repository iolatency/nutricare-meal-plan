<script lang="ts">
	import type { PageData } from './$types';
	import ConversationList from '$lib/features/chat/components/ConversationList.svelte';
	import ChatShell from '$lib/features/chat/components/ChatShell.svelte';
	import {
		getOrCreateConversation,
		listConversations,
		listMessages,
		type ChatConversation,
		type ChatMessage
	} from '$lib/features/chat/services/chat-api';
	import { invalidateAll } from '$app/navigation';

	let { data }: { data: PageData } = $props();

	let selectedClientId = $state<number | null>(null);
	let activeConversation = $state<ChatConversation | null>(null);
	let messages = $state<ChatMessage[]>([]);
	let msgLoading = $state(false);
	let msgError = $state<string | null>(null);

	const safeConversations = $derived(data.conversations ?? []);
	const safePatients = $derived(data.patients ?? []);

	const clientsById = $derived.by(() => {
		const m = new Map<number, (typeof safePatients)[0]>();
		for (const c of safePatients) m.set(c.id, c);
		return m;
	});

	const mergedConversations = $derived.by((): ChatConversation[] => {
		const byClientId = new Map<number, ChatConversation>();
		for (const conv of safeConversations) byClientId.set(conv.clientId, conv);

		const out: ChatConversation[] = [];
		for (const client of safePatients) {
			const existing = byClientId.get(client.id);
			if (existing) {
				out.push(existing);
			} else {
				out.push({
					id: -client.id,
					dietitianId: -1,
					clientId: client.id,
					clientUser: {
						id: client.id,
						phone: client.phone,
						name: client.name
					},
					dietitianUser: null,
					lastMessageBody: null,
					lastMessageAt: null,
					unreadCount: 0,
					createdAt: '',
					updatedAt: ''
				});
			}
		}
		for (const conv of safeConversations) {
			if (!clientsById.has(conv.clientId)) out.push(conv);
		}
		return out;
	});

	const effectiveSelected = $derived.by((): ChatConversation | null => {
		if (activeConversation) return activeConversation;
		if (selectedClientId == null) return null;
		return mergedConversations.find((c) => c.clientId === selectedClientId) ?? null;
	});

	const selectedPeerName = $derived.by(() => {
		const conv = effectiveSelected;
		const u = conv?.clientUser;
		if (u) {
			const n = (u.name ?? '').trim();
			return n || u.phone || 'رسائل';
		}
		const client = selectedClientId ? clientsById.get(selectedClientId) : null;
		if (client) {
			const n = (client.name ?? '').trim();
			return n || client.phone || 'رسائل';
		}
		return 'رسائل';
	});

	const isChatOpen = $derived(!!effectiveSelected);

	async function refreshMessages(convId: number) {
		msgLoading = true;
		msgError = null;
		try {
			const page = await listMessages(convId, { limit: 50, offset: 0 });
			messages = page.results;
		} catch {
			msgError = 'تعذر تحميل الرسائل';
			messages = [];
		} finally {
			msgLoading = false;
		}
	}

	async function onSelectConversation(c: ChatConversation) {
		selectedClientId = c.clientId;
		msgError = null;
		if (c.id < 0) {
			try {
				const conv = await getOrCreateConversation({ clientId: c.clientId });
				activeConversation = conv;
				await refreshMessages(conv.id);
				void listConversations().then(() => invalidateAll());
			} catch {
				msgError = 'تعذر فتح المحادثة';
				activeConversation = null;
			}
		} else {
			activeConversation = c;
			await refreshMessages(c.id);
		}
	}

	function closeMobileChat() {
		activeConversation = null;
		selectedClientId = null;
		msgError = null;
	}
</script>

<svelte:head>
	<title>الرسائل — نيوتريكير</title>
	<link
		href="https://fonts.googleapis.com/css2?family=El+Messiri:wght@500;600;700&family=Tajawal:wght@400;500;600;700;800&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

<div class="page" class:page--chat-open={isChatOpen} dir="rtl">
	<div class="page-header">
		<div>
			<h1 class="page-title">الرسائل</h1>
			<p class="page-subtitle">
				<strong>{mergedConversations.length}</strong>
				عميل · كل محادثاتك في مكان واحد
			</p>
		</div>
	</div>

	<div class="msg-grid" class:chat-open={isChatOpen}>
		<div class="msg-sidebar" class:hidden-mobile={isChatOpen}>
			<ConversationList
				conversations={mergedConversations}
				selectedId={effectiveSelected?.id ?? null}
				mode="dietitian"
				onSelect={onSelectConversation}
			/>
		</div>

		<div class="msg-main" class:hidden-mobile={!isChatOpen}>
			{#if !effectiveSelected}
				<div class="msg-placeholder">
					<div class="msg-placeholder-icon" aria-hidden="true">
						<svg
							width="36"
							height="36"
							fill="none"
							stroke="currentColor"
							stroke-width="1.5"
							viewBox="0 0 24 24"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
							/>
						</svg>
					</div>
					<p class="msg-placeholder-title">اختر عميلًا من القائمة</p>
					<p class="msg-placeholder-desc">ستظهر المحادثة هنا لإرسال الرسائل ومتابعة التقدم.</p>
				</div>
			{:else if msgLoading}
				<div class="msg-loading">جارٍ التحميل…</div>
			{:else if msgError}
				<div class="msg-err">
					<p>{msgError}</p>
					<button
						type="button"
						class="msg-retry"
						onclick={() => effectiveSelected && refreshMessages(effectiveSelected.id)}
					>
						إعادة المحاولة
					</button>
				</div>
			{:else if effectiveSelected.id > 0 && data.user}
				<ChatShell
					conversationId={effectiveSelected.id}
					currentUserId={data.user.id}
					title={selectedPeerName}
					initialMessages={messages}
					onMarkRead={() => invalidateAll()}
					onBack={closeMobileChat}
				/>
			{/if}
		</div>
	</div>
</div>

<style>
	.page {
		--fp-ink: #121816;
		--fp-muted: #5c6560;
		--fp-line: #e2e8e4;
		--fp-surface: #ffffff;
		--fp-accent: #2a9d62;
		--fp-accent-deep: #1f7a4a;
		--fp-warm: #faf9f6;
		--font-display: 'El Messiri', 'Tajawal', serif;

		padding: 28px 32px 40px;
		max-width: 1120px;
		margin: 0 auto;
		font-family: 'Tajawal', sans-serif;
		animation: msg-page-in 0.55s cubic-bezier(0.22, 1, 0.36, 1) both;
		min-width: 0;
	}
	@keyframes msg-page-in {
		from {
			opacity: 0;
			transform: translateY(8px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.page-header {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		margin-bottom: 26px;
		flex-wrap: wrap;
		gap: 18px;
	}
	.page-title {
		font-family: var(--font-display);
		font-size: clamp(1.65rem, 4vw, 2rem);
		font-weight: 700;
		color: var(--fp-ink);
		margin: 0 0 8px;
		line-height: 1.15;
	}
	.page-subtitle {
		font-size: 13.5px;
		color: var(--fp-muted);
		margin: 0;
		line-height: 1.5;
	}
	.page-subtitle strong {
		font-weight: 800;
		color: var(--fp-accent);
		margin-inline-end: 6px;
	}

	.msg-grid {
		display: grid;
		grid-template-columns: 1fr;
		gap: 22px;
	}
	@media (min-width: 900px) {
		.msg-grid {
			grid-template-columns: minmax(260px, 32vw) minmax(0, 1fr);
			min-height: min(calc(100dvh - 180px), 720px);
			gap: 18px;
		}
	}
	.msg-sidebar {
		display: flex;
		flex-direction: column;
		gap: 0;
		min-height: 0;
	}
	.msg-sidebar.hidden-mobile {
		display: none;
	}
	@media (min-width: 900px) {
		.msg-sidebar.hidden-mobile {
			display: flex;
		}
	}
	.msg-main {
		min-height: 0;
	}
	.msg-main.hidden-mobile {
		display: none;
	}
	@media (min-width: 900px) {
		.msg-main.hidden-mobile {
			display: block;
		}
	}
	.msg-placeholder {
		border: 1px solid var(--fp-line);
		border-radius: 16px;
		padding: 48px 28px;
		text-align: center;
		background: var(--fp-surface);
		box-shadow: 0 4px 24px rgba(18, 24, 22, 0.04);
		min-height: min(360px, 50vh);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 10px;
	}
	.msg-placeholder-icon {
		width: 72px;
		height: 72px;
		border-radius: 18px;
		background: var(--fp-warm);
		border: 1px solid rgba(226, 232, 228, 0.95);
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--fp-accent);
		margin-bottom: 4px;
	}
	.msg-placeholder-title {
		margin: 0;
		font-family: var(--font-display);
		font-size: 1.15rem;
		font-weight: 700;
		color: var(--fp-ink);
	}
	.msg-placeholder-desc {
		margin: 0;
		max-width: 22rem;
		font-size: 13.5px;
		line-height: 1.55;
		color: var(--fp-muted);
	}
	.msg-loading,
	.msg-err {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 220px;
		color: var(--fp-muted);
		flex-direction: column;
		gap: 12px;
		border: 1px solid var(--fp-line);
		border-radius: 16px;
		background: var(--fp-surface);
		box-shadow: 0 4px 24px rgba(18, 24, 22, 0.04);
	}
	.msg-retry {
		border: 1px solid var(--fp-accent-deep);
		background: linear-gradient(
			165deg,
			#34b16f 0%,
			var(--fp-accent) 45%,
			var(--fp-accent-deep) 100%
		);
		color: #fff;
		padding: 10px 20px;
		border-radius: 12px;
		font-size: 13.5px;
		font-weight: 600;
		cursor: pointer;
		font-family: inherit;
		box-shadow: 0 4px 16px rgba(42, 157, 98, 0.28);
	}
	.msg-retry:hover {
		box-shadow: 0 8px 28px rgba(42, 157, 98, 0.35);
	}

	@media (max-width: 899px) {
		.page {
			padding: 16px max(12px, env(safe-area-inset-right, 0px)) 28px
				max(12px, env(safe-area-inset-left, 0px));
		}
		.page-header {
			margin-bottom: 16px;
		}
		.msg-grid {
			gap: 14px;
		}
		.msg-placeholder {
			padding: 32px 18px;
			min-height: min(280px, 42vh);
		}

		/* Open chat: cancel main horizontal padding so thread uses full width; match mobile chrome from layout */
		.page.page--chat-open {
			--main-pad-start: max(12px, env(safe-area-inset-left, 0px));
			--main-pad-end: max(12px, env(safe-area-inset-right, 0px));
			margin-inline-start: calc(-1 * var(--main-pad-start));
			margin-inline-end: calc(-1 * var(--main-pad-end));
			width: calc(100% + var(--main-pad-start) + var(--main-pad-end));
			max-width: none;
			padding: 4px max(8px, env(safe-area-inset-right, 0px)) 2px
				max(8px, env(safe-area-inset-left, 0px));
			display: flex;
			flex-direction: column;
			min-height: calc(
				100dvh - 56px - 76px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)
			);
			box-sizing: border-box;
		}
		.page.page--chat-open .page-header {
			display: none;
		}
		.page.page--chat-open .msg-grid {
			flex: 1;
			min-height: 0;
			display: flex;
			flex-direction: column;
			gap: 8px;
		}
		.page.page--chat-open .msg-main {
			flex: 1;
			min-height: 0;
			display: flex;
			flex-direction: column;
			gap: 8px;
		}
		.page.page--chat-open :global(.chat-shell) {
			flex: 1;
			min-height: 0 !important;
			height: auto !important;
			max-height: none !important;
			align-self: stretch;
		}
	}
</style>
