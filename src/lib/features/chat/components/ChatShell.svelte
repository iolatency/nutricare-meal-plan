<script lang="ts">
	import UserAvatarFallback from '$lib/components/UserAvatarFallback.svelte';
	import type { ChatMessage } from '$lib/features/chat/services/chat-api';
	import {
		listMessages,
		markRead,
		openChatEventSource,
		sendMessage,
		type ChatSseEvent
	} from '$lib/features/chat/services/chat-api';

	type OnlineStatus = {
		online: boolean;
		lastSeenAt: string | null;
	};

	type Props = {
		conversationId: number;
		currentUserId: number;
		title: string;
		titleHref?: string | null;
		avatarUrl?: string | null;
		/** Pixel size for avatar + fallback (match conversation list). */
		avatarPx?: number;
		initialMessages: ChatMessage[];
		onMarkRead?: () => void;
		/** Shown only on small screens (CSS); e.g. return to conversation list. */
		onBack?: (() => void) | null;
		/** Online/offline presence of the peer. When provided, shows a presence dot in the header. */
		onlineStatus?: OnlineStatus | null;
	};

	let {
		conversationId,
		currentUserId,
		title,
		titleHref = null,
		avatarUrl = null,
		avatarPx = 40,
		initialMessages,
		onMarkRead,
		onBack = null,
		onlineStatus = null
	}: Props = $props();

	let messages = $state<ChatMessage[]>([]);
	let draft = $state('');
	let isSending = $state(false);
	let bottomVisible = $state(false);
	let enterKeySends = $state(true);

	let listEl = $state<HTMLDivElement | undefined>(undefined);
	let bottomEl = $state<HTMLDivElement | undefined>(undefined);
	let draftEl = $state<HTMLTextAreaElement | undefined>(undefined);

	let lastReadMarkAt = 0;
	let markReadInFlight = false;

	$effect(() => {
		messages = [...initialMessages];
	});

	$effect(() => {
		if (typeof window === 'undefined') return;
		const mq = window.matchMedia('(min-width: 768px) and (pointer: fine)');
		const fn = () => (enterKeySends = mq.matches);
		fn();
		mq.addEventListener('change', fn);
		return () => mq.removeEventListener('change', fn);
	});

	function mergeById(prev: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
		const map = new Map<number, ChatMessage>();
		for (const m of prev) map.set(m.id, m);
		for (const m of incoming) map.set(m.id, m);
		return Array.from(map.values()).sort((a, b) =>
			a.createdAt > b.createdAt ? -1 : a.createdAt < b.createdAt ? 1 : 0
		);
	}

	function handleSseEvent(ev: ChatSseEvent) {
		if (ev.type === 'message.created') {
			const m = ev.message;
			messages = mergeById(messages, [
				{
					id: m.id,
					conversationId: m.conversationId,
					senderUserId: m.senderUserId,
					body: m.body,
					createdAt: m.createdAt,
					readAt: m.readAt
				}
			]);
			queueMicrotask(() => bottomEl?.scrollIntoView({ behavior: 'smooth', block: 'end' }));
		}
		if (ev.type === 'message.read.updated') {
			if (ev.readerUserId !== currentUserId) {
				messages = messages.map((m) =>
					m.senderUserId === currentUserId && m.readAt == null ? { ...m, readAt: ev.readAt } : m
				);
			}
		}
	}

	$effect(() => {
		const cid = conversationId;
		const { close } = openChatEventSource(cid, handleSseEvent);

		const poll = window.setInterval(async () => {
			try {
				const page = await listMessages(cid, { limit: 50, offset: 0 });
				messages = mergeById(messages, page.results);
			} catch {
				// ignore
			}
		}, 4000);

		return () => {
			close();
			window.clearInterval(poll);
		};
	});

	function formatTime(iso: string): string {
		const d = new Date(iso);
		if (Number.isNaN(d.getTime())) return '';
		return d.toLocaleTimeString('ar-EG-u-nu-arab', { hour: '2-digit', minute: '2-digit' });
	}

	function formatDay(iso: string): string {
		const d = new Date(iso);
		if (Number.isNaN(d.getTime())) return '';
		return d.toLocaleDateString('ar-EG-u-nu-arab', { weekday: 'long', month: 'short', day: 'numeric' });
	}

	function dayKey(iso: string): string {
		const d = new Date(iso);
		if (Number.isNaN(d.getTime())) return iso;
		return d.toISOString().slice(0, 10);
	}

	const grouped = $derived.by(() => {
		type Row =
			| { kind: 'day'; key: string; label: string }
			| { kind: 'msg'; msg: ChatMessage };
		const out: Row[] = [];
		let lastDay: string | null = null;
		const asc = [...messages].sort((a, b) => (a.createdAt > b.createdAt ? 1 : -1));
		for (const m of asc) {
			const dk = dayKey(m.createdAt);
			if (dk !== lastDay) {
				out.push({ kind: 'day', key: dk, label: formatDay(m.createdAt) });
				lastDay = dk;
			}
			out.push({ kind: 'msg', msg: m });
		}
		return out;
	});

	const lastMyMessageId = $derived.by(() => {
		const last = [...messages]
			.filter((m) => m.senderUserId === currentUserId)
			.sort((a, b) => (a.createdAt > b.createdAt ? 1 : -1))
			.at(-1);
		return last?.id ?? null;
	});

	async function markReadIfNeeded() {
		const now = Date.now();
		if (now - lastReadMarkAt < 800) return;
		const hasUnreadIncoming = messages.some(
			(m) => m.senderUserId !== currentUserId && m.readAt == null
		);
		if (!hasUnreadIncoming) return;
		if (markReadInFlight) return;
		lastReadMarkAt = now;
		markReadInFlight = true;
		try {
			const res = await markRead(conversationId);
			messages = messages.map((m) =>
				m.senderUserId !== currentUserId && m.readAt == null ? { ...m, readAt: res.readAt } : m
			);
			onMarkRead?.();
		} catch {
			// ignore
		} finally {
			markReadInFlight = false;
		}
	}

	$effect(() => {
		const root = listEl;
		const target = bottomEl;
		if (!root || !target) return;
		const obs = new IntersectionObserver(
			(entries) => {
				bottomVisible = entries.some((e) => e.isIntersecting);
			},
			{ root, threshold: 0.25 }
		);
		obs.observe(target);
		return () => obs.disconnect();
	});

	$effect(() => {
		if (!bottomVisible) return;
		void messages.length;
		void markReadIfNeeded();
	});

	async function send() {
		const body = draft.trim();
		if (!body || isSending) return;
		isSending = true;
		try {
			const msg = await sendMessage(conversationId, body);
			messages = mergeById(messages, [msg]);
			draft = '';
			queueMicrotask(() => bottomEl?.scrollIntoView({ behavior: 'smooth', block: 'end' }));
			draftEl?.focus();
		} catch {
			// keep draft
		} finally {
			isSending = false;
		}
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key !== 'Enter' || e.shiftKey) return;
		if (!enterKeySends) return;
		e.preventDefault();
		void send();
	}

</script>

<div class="chat-shell" dir="rtl">
	<div class="chat-head">
		{#if onBack}
			<button type="button" class="chat-back-btn" onclick={onBack} aria-label="العودة للمحادثات">
				<svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
				</svg>
			</button>
		{/if}
		<div class="chat-head-main">
			<div class="chat-title-row">
				{#if titleHref}
					<a href={titleHref} class="chat-title-link">
						{#if avatarUrl}
							<img
								src={avatarUrl}
								alt=""
								class="chat-avatar"
								style:width="{avatarPx}px"
								style:height="{avatarPx}px"
							/>
						{:else}
							<UserAvatarFallback name={title} px={avatarPx} />
						{/if}
						<span class="chat-title">{title}</span>
					</a>
				{:else}
					<div class="chat-title-inline">
						{#if avatarUrl}
							<img
								src={avatarUrl}
								alt=""
								class="chat-avatar"
								style:width="{avatarPx}px"
								style:height="{avatarPx}px"
							/>
						{:else}
							<UserAvatarFallback name={title} px={avatarPx} />
						{/if}
						<span class="chat-title">{title}</span>
					</div>
				{/if}

				{#if onlineStatus != null}
					<span
						class="presence-dot-chat"
						class:presence-online={onlineStatus.online}
						class:presence-offline={!onlineStatus.online}
						title={onlineStatus.online ? 'متصل الآن' : onlineStatus.lastSeenAt ? `آخر ظهور: ${new Date(onlineStatus.lastSeenAt).toLocaleTimeString('ar-EG-u-nu-arab', { hour: '2-digit', minute: '2-digit' })}` : 'غير متصل'}
						aria-label={onlineStatus.online ? 'متصل' : 'غير متصل'}
					></span>
				{/if}
			</div>
			{#if onlineStatus != null}
				<p class="presence-label-chat">
					{onlineStatus.online ? 'متصل الآن' : 'غير متصل'}
				</p>
			{/if}
		</div>
	</div>

	<div class="chat-list" bind:this={listEl}>
		{#each grouped as it (it.kind === 'day' ? `d-${it.key}` : `m-${it.msg.id}`)}
			{#if it.kind === 'day'}
				<div class="chat-day-wrap">
					<span class="chat-day-pill">{it.label}</span>
				</div>
			{:else}
				{@const m = it.msg}
				{@const mine = m.senderUserId === currentUserId}
				<div class="chat-row" class:mine class:theirs={!mine}>
					<div class="chat-bubble" class:mine class:theirs={!mine}>
						<p class="chat-body">{m.body}</p>
						<div class="chat-meta">
							<span class="chat-time">{formatTime(m.createdAt)}</span>
							{#if mine && m.id === lastMyMessageId}
								<span class="chat-read">{m.readAt ? 'تمت القراءة' : 'تم الإرسال'}</span>
							{/if}
						</div>
					</div>
				</div>
			{/if}
		{/each}
		<div bind:this={bottomEl}></div>
	</div>

	<div class="chat-input">
		<textarea
			bind:this={draftEl}
			bind:value={draft}
			class="chat-textarea"
			rows="2"
			placeholder="اكتب رسالة…"
			autocomplete="off"
			onkeydown={onKeydown}
		></textarea>
		<button type="button" class="chat-send" disabled={isSending} onclick={() => void send()}>
			{isSending ? '…' : 'إرسال'}
		</button>
	</div>
	<p class="chat-hint">
		{#if enterKeySends}
			Enter يرسل الرسالة · Shift+Enter سطر جديد
		{:else}
			اضغط «إرسال» لإرسال الرسالة
		{/if}
	</p>
</div>

<style>
	.chat-shell {
		--fp-ink: #121816;
		--fp-muted: #5c6560;
		--fp-line: #e2e8e4;
		--fp-surface: #ffffff;
		--fp-accent: #2a9d62;
		--fp-accent-deep: #1f7a4a;
		--fp-warm: #faf9f6;
		--font-display: 'El Messiri', 'Tajawal', serif;

		display: flex;
		flex-direction: column;
		background: var(--fp-surface);
		border: 1px solid var(--fp-line);
		border-radius: 16px;
		box-shadow: 0 4px 24px rgba(18, 24, 22, 0.04);
		overflow: hidden;
		min-height: min(420px, 52dvh);
		height: min(70vh, 640px);
		font-family: 'Tajawal', sans-serif;
		color: var(--fp-ink);
		min-width: 0;
	}
	@media (max-width: 899px) {
		.chat-shell {
			/* Height comes from parent flex on dietitian messages when chat is open */
			flex: 1 1 auto;
			min-height: 0;
			height: auto;
			max-height: none;
			border-radius: 12px;
			box-shadow: 0 2px 14px rgba(18, 24, 22, 0.06);
		}
	}
	.chat-head {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 12px 14px;
		border-bottom: 1px solid var(--fp-line);
		background: var(--fp-surface);
		box-shadow: 0 1px 0 rgba(18, 24, 22, 0.04);
	}
	.chat-head-main {
		flex: 1;
		min-width: 0;
	}
	.chat-back-btn {
		display: none;
	}
	@media (max-width: 899px) {
		.chat-back-btn {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			width: 44px;
			height: 44px;
			padding: 0;
			border-radius: 12px;
			border: 1px solid var(--fp-line);
			background: var(--fp-warm);
			color: var(--fp-muted);
			cursor: pointer;
			flex-shrink: 0;
			font: inherit;
			transition:
				background 0.15s ease,
				border-color 0.15s ease,
				color 0.15s ease;
		}
		.chat-back-btn:hover {
			background: var(--fp-surface);
			border-color: rgba(42, 157, 98, 0.35);
			color: var(--fp-ink);
		}
		.chat-back-btn:focus-visible {
			outline: 2px solid var(--fp-accent);
			outline-offset: 2px;
		}
	}
	@media (min-width: 900px) {
		.chat-back-btn {
			display: none !important;
		}
	}
	.chat-title-row {
		display: flex;
		align-items: center;
		gap: 10px;
		min-width: 0;
		flex-wrap: wrap;
	}
	.chat-title-link,
	.chat-title-inline {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		min-width: 0;
		text-decoration: none;
		color: inherit;
	}
	.chat-title-link:hover .chat-title {
		text-decoration: underline;
	}
	.chat-avatar {
		border-radius: 999px;
		object-fit: cover;
		border: 1px solid var(--fp-line);
		flex-shrink: 0;
	}
	.presence-dot-chat {
		display: inline-block;
		width: 9px;
		height: 9px;
		border-radius: 50%;
		flex-shrink: 0;
		margin-inline-start: 6px;
		transition: background 0.4s ease;
		vertical-align: middle;
	}
	.presence-dot-chat.presence-online {
		background: #2a9d62;
		box-shadow: 0 0 0 2px rgba(42, 157, 98, 0.2);
	}
	.presence-dot-chat.presence-offline { background: #b0b8b4; }
	.presence-label-chat {
		margin: 2px 0 0;
		font-size: 10.5px;
		color: var(--fp-muted);
	}
	.chat-title {
		font-family: var(--font-display);
		font-weight: 700;
		font-size: clamp(0.95rem, 2.6vw, 1.08rem);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--fp-ink);
		letter-spacing: -0.02em;
	}
	.chat-list {
		flex: 1;
		min-height: 0;
		overflow: auto;
		padding: 14px 16px;
		background: var(--fp-warm);
		-webkit-overflow-scrolling: touch;
	}
	@media (max-width: 899px) {
		.chat-list {
			padding: 10px 10px;
		}
	}
	.chat-day-wrap {
		display: flex;
		justify-content: center;
		padding: 6px 0;
	}
	.chat-day-pill {
		font-size: 10px;
		font-weight: 600;
		color: var(--fp-muted);
		background: var(--fp-surface);
		border: 1px solid var(--fp-line);
		padding: 4px 10px;
		border-radius: 999px;
		box-shadow: 0 1px 2px rgba(18, 24, 22, 0.04);
	}
	.chat-row {
		display: flex;
		margin-bottom: 5px;
	}
	.chat-row.mine {
		justify-content: flex-start;
	}
	.chat-row.theirs {
		justify-content: flex-end;
	}
	.chat-bubble {
		max-width: min(88%, 30rem);
		border-radius: 14px;
		padding: 7px 11px;
		border: 1px solid var(--fp-line);
		box-shadow: 0 1px 6px rgba(18, 24, 22, 0.04);
	}
	@media (max-width: 899px) {
		.chat-bubble {
			padding: 8px 12px;
			border-radius: 14px;
		}
	}
	.chat-bubble.mine {
		background: linear-gradient(165deg, #34b16f 0%, var(--fp-accent) 45%, var(--fp-accent-deep) 100%);
		color: #fff;
		border-color: rgba(31, 122, 74, 0.45);
		border-bottom-left-radius: 5px;
		box-shadow: 0 3px 10px rgba(42, 157, 98, 0.18);
	}
	.chat-bubble.theirs {
		background: var(--fp-surface);
		color: var(--fp-ink);
		border-bottom-right-radius: 5px;
	}
	.chat-body {
		margin: 0;
		font-size: 13px;
		line-height: 1.38;
		white-space: pre-wrap;
	}
	@media (max-width: 899px) {
		.chat-body {
			font-size: 13px;
			line-height: 1.4;
		}
	}
	.chat-meta {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 6px;
		margin-top: 4px;
	}
	.chat-time {
		font-size: 10px;
		opacity: 0.85;
	}
	.chat-bubble.theirs .chat-time {
		color: var(--fp-muted);
	}
	.chat-read {
		font-size: 10px;
		opacity: 0.9;
	}
	.chat-input {
		display: flex;
		align-items: flex-end;
		gap: 12px;
		padding: 14px 16px;
		padding-bottom: max(14px, env(safe-area-inset-bottom, 0px));
		border-top: 1px solid var(--fp-line);
		background: var(--fp-surface);
		flex-wrap: wrap;
	}
	@media (max-width: 480px) {
		.chat-input {
			flex-direction: row;
			align-items: flex-end;
			flex-wrap: nowrap;
			padding: 10px 12px;
			padding-bottom: max(10px, env(safe-area-inset-bottom, 0px));
		}
		.chat-send {
			width: auto;
			min-width: 4.5rem;
			height: 48px;
			padding: 0 16px;
		}
		.chat-textarea {
			min-height: 44px;
			max-height: 100px;
		}
		.chat-hint {
			padding: 0 12px 8px;
			font-size: 11px;
			line-height: 1.35;
		}
	}
	.chat-textarea {
		flex: 1;
		min-height: 48px;
		max-height: 120px;
		resize: none;
		border: 1.5px solid var(--fp-line);
		border-radius: 12px;
		padding: 12px 14px;
		font-family: inherit;
		font-size: 14px;
		line-height: 1.45;
		color: var(--fp-ink);
		transition:
			border-color 0.15s ease,
			box-shadow 0.15s ease;
	}
	.chat-textarea:hover {
		border-color: #cbd5e1;
	}
	.chat-textarea:focus {
		outline: none;
		border-color: var(--fp-accent);
		box-shadow: 0 0 0 3px rgba(42, 157, 98, 0.12);
	}
	.chat-send {
		flex-shrink: 0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 48px;
		height: 48px;
		padding: 0 22px;
		border: 1px solid var(--fp-accent-deep);
		border-radius: 12px;
		background: linear-gradient(165deg, #34b16f 0%, var(--fp-accent) 45%, var(--fp-accent-deep) 100%);
		color: #fff;
		font-weight: 600;
		font-size: 13.5px;
		line-height: 1;
		cursor: pointer;
		font-family: inherit;
		box-shadow: 0 4px 16px rgba(42, 157, 98, 0.28);
		transition:
			box-shadow 0.2s ease,
			transform 0.15s ease;
	}
	.chat-send:hover:not(:disabled) {
		box-shadow: 0 8px 28px rgba(42, 157, 98, 0.35);
	}
	.chat-send:active:not(:disabled) {
		transform: scale(0.98);
	}
	.chat-send:disabled {
		opacity: 0.65;
		cursor: default;
	}
	.chat-hint {
		margin: 0;
		padding: 0 16px 12px;
		font-size: 12px;
		color: var(--fp-muted);
	}
	@media (max-width: 420px) {
		.chat-hint {
			display: none;
		}
	}
</style>
