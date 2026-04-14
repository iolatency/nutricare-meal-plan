<script lang="ts">
	import type { PageData } from './$types';
	import ChatShell from '$lib/features/chat/components/ChatShell.svelte';
	import { invalidateAll } from '$app/navigation';

	let { data }: { data: PageData } = $props();

	const peerName = $derived.by(() => {
		const u = data.conversation?.dietitianUser;
		if (!u) return 'أخصائي التغذية';
		const n = (u.name ?? '').trim();
		return n || u.phone || 'أخصائي التغذية';
	});
</script>

<svelte:head>
	<title>الرسائل — نيوتريكير</title>
	<link
		href="https://fonts.googleapis.com/css2?family=El+Messiri:wght@500;600;700&family=Tajawal:wght@400;500;600;700;800&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

<div class="page" dir="rtl">
	{#if data.chatError}
		<div class="err-box">
			<p class="err-title">تعذر فتح الرسائل</p>
			<p class="err-msg">{data.chatError}</p>
			<p class="err-hint">تحتاج إلى خطة غذائية نشطة أو مسودة مع أخصائي مرتبط بحسابك.</p>
			<a class="back" href="/">العودة للرئيسية</a>
		</div>
	{:else if data.conversation && data.user}
		<div class="page-header">
			<div>
				<h1 class="page-title">الرسائل</h1>
				<p class="page-subtitle">محادثتك مع <strong>{peerName}</strong></p>
			</div>
		</div>
		<ChatShell
			conversationId={data.conversation.id}
			currentUserId={data.user.id}
			title={peerName}
			initialMessages={data.initialMessages}
			onMarkRead={() => invalidateAll()}
		/>
	{/if}
</div>

<style>
	.page {
		--fp-ink: #121816;
		--fp-muted: #5c6560;
		--fp-line: #e2e8e4;
		--fp-surface: #ffffff;
		--fp-accent: #2a9d62;
		--font-display: 'El Messiri', 'Tajawal', serif;

		max-width: 720px;
		margin: 0 auto;
		padding: 28px 20px 40px;
		font-family: 'Tajawal', sans-serif;
		animation: pt-msg-in 0.55s cubic-bezier(0.22, 1, 0.36, 1) both;
	}
	@keyframes pt-msg-in {
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
		margin-bottom: 22px;
	}
	.page-title {
		font-family: var(--font-display);
		font-size: clamp(1.5rem, 4vw, 1.85rem);
		font-weight: 700;
		color: var(--fp-ink);
		margin: 0 0 8px;
		line-height: 1.15;
	}
	.page-subtitle {
		margin: 0;
		font-size: 13.5px;
		color: var(--fp-muted);
		line-height: 1.5;
	}
	.page-subtitle strong {
		font-weight: 800;
		color: var(--fp-accent);
	}
	.err-box {
		background: var(--fp-surface);
		border: 1px solid var(--fp-line);
		border-radius: 16px;
		padding: 28px 20px;
		text-align: center;
		box-shadow: 0 4px 24px rgba(18, 24, 22, 0.04);
	}
	.err-title {
		margin: 0 0 8px;
		font-weight: 700;
		font-size: 17px;
	}
	.err-msg {
		margin: 0 0 12px;
		color: var(--fp-muted);
		font-size: 14px;
	}
	.err-hint {
		margin: 0 0 20px;
		font-size: 13px;
		color: var(--fp-muted);
		opacity: 0.92;
	}
	.back {
		display: inline-block;
		color: #2a9d62;
		font-weight: 600;
		text-decoration: none;
	}
	.back:hover {
		text-decoration: underline;
	}
</style>
