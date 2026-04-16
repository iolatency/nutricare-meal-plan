<script lang="ts">
	import type { PageData } from './$types';
	import ChatShell from '$lib/features/chat/components/ChatShell.svelte';
	import { invalidateAll } from '$app/navigation';

	let { data }: { data: PageData } = $props();

	const peerName = $derived.by(() => {
		const u = data.conversation?.dietitianUser;
		if (!u) return data.dietitianName ?? 'أخصائي التغذية';
		const n = (u.name ?? '').trim();
		return n || u.phone || 'أخصائي التغذية';
	});

	// Presence polling
	let onlineStatus = $state<{ online: boolean; lastSeenAt: string | null } | null>(null);

	async function pollPresence() {
		if (!data.dietitianId) return;
		try {
			const res = await fetch(`/api/users/${data.dietitianId}/presence`);
			if (res.ok) {
				const body = await res.json();
				onlineStatus = { online: body.online ?? false, lastSeenAt: body.lastSeenAt ?? null };
			}
		} catch {
			// ignore
		}
	}

	$effect(() => {
		pollPresence();
		const interval = setInterval(pollPresence, 30_000);
		return () => clearInterval(interval);
	});
</script>

<svelte:head>
	<title>الرسائل — نيوتريكير</title>
	<link
		href="https://fonts.googleapis.com/css2?family=El+Messiri:wght@500;600;700&family=Tajawal:wght@400;500;600;700;800&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

<div class="chat-page" dir="rtl">
	{#if data.chatError}
		<div class="err-box">
			<p class="err-title">تعذر فتح الرسائل</p>
			<p class="err-msg">{data.chatError}</p>
			<p class="err-hint">تحتاج إلى خطة غذائية نشطة أو مسودة مع أخصائي مرتبط بحسابك.</p>
			<a class="back" href="/patient">العودة للرئيسية</a>
		</div>
	{:else if data.conversation && data.user}
		<ChatShell
			conversationId={data.conversation.id}
			currentUserId={data.user.id}
			title={peerName}
			initialMessages={data.initialMessages}
			onMarkRead={() => invalidateAll()}
			onlineStatus={onlineStatus}
		/>
	{/if}
</div>

<style>
	.chat-page {
		--fp-ink: #121816;
		--fp-muted: #5c6560;
		--fp-line: #e2e8e4;
		--fp-surface: #ffffff;
		--fp-accent: #2a9d62;

		display: flex;
		flex-direction: column;
		max-width: none;
		padding: 0;
		margin: 0;
		font-family: 'Tajawal', sans-serif;
	}

	/* Mobile: fill the space between the top bar and bottom nav, edge-to-edge */
	@media (max-width: 899px) {
		.chat-page {
			height: calc(
				100dvh
				- 56px - env(safe-area-inset-top, 0px)
				- 76px - env(safe-area-inset-bottom, 0px)
			);
			margin-inline: -12px;
		}
	}

	/* Desktop: constrain width nicely */
	@media (min-width: 900px) {
		.chat-page {
			max-width: 820px;
			margin: 0 auto;
			height: calc(100dvh - 48px);
			padding: 12px 0;
		}
	}

	.err-box {
		background: var(--fp-surface);
		border: 1px solid var(--fp-line);
		border-radius: 16px;
		padding: 28px 20px;
		margin: 28px 20px;
		text-align: center;
		box-shadow: 0 4px 24px rgba(18, 24, 22, 0.04);
	}
	.err-title { margin: 0 0 8px; font-weight: 700; font-size: 17px; }
	.err-msg { margin: 0 0 12px; color: var(--fp-muted); font-size: 14px; }
	.err-hint { margin: 0 0 20px; font-size: 13px; color: var(--fp-muted); opacity: 0.92; }
	.back { display: inline-block; color: #2a9d62; font-weight: 600; text-decoration: none; }
	.back:hover { text-decoration: underline; }
</style>
