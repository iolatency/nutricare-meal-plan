<script lang="ts">
	import UserAvatarFallback from '$lib/components/UserAvatarFallback.svelte';
	import type { ChatConversation } from '$lib/features/chat/services/chat-api';

	type Props = {
		conversations: ChatConversation[];
		selectedId: number | null;
		mode: 'dietitian' | 'patient';
		onSelect: (c: ChatConversation) => void;
		avatarByUserId?: Record<number, string | null | undefined>;
	};

	let {
		conversations,
		selectedId,
		mode,
		onSelect,
		avatarByUserId = {}
	}: Props = $props();

	let q = $state('');

	function displayUser(u: { name?: string; phone: string | null } | null): string {
		if (!u) return '—';
		const name = (u.name ?? '').trim();
		return name || u.phone || '—';
	}

	const list = $derived.by(() => {
		const term = q.trim().toLowerCase();
		const base = [...conversations].sort((a, b) =>
			(b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? '')
		);
		if (!term) return base;
		return base.filter((c) => {
			const peer = mode === 'dietitian' ? c.clientUser : c.dietitianUser;
			const s = `${displayUser(peer)} ${peer?.phone ?? ''}`.toLowerCase();
			return s.includes(term);
		});
	});

	function peerOf(c: ChatConversation) {
		return mode === 'dietitian' ? c.clientUser : c.dietitianUser;
	}

	function avatarFor(c: ChatConversation): string | null {
		const peer = peerOf(c);
		const id = peer?.id;
		if (id == null) return null;
		const v = avatarByUserId[id];
		return v === undefined || v === null ? null : v;
	}
</script>

<div class="conv-list" dir="rtl">
	<div class="conv-search">
		<input class="conv-input" type="search" bind:value={q} placeholder="بحث في الرسائل…" />
	</div>
	<div class="conv-scroll">
		{#if list.length === 0}
			<div class="conv-empty">لا توجد محادثات بعد</div>
		{/if}
		{#each list as c (c.id)}
			<button
				type="button"
				class="conv-item"
				class:active={selectedId === c.id}
				onclick={() => onSelect(c)}
			>
				<div class="conv-row">
					<div class="conv-left">
						{#if avatarFor(c)}
							<img src={avatarFor(c)!} alt="" class="conv-avatar" class:active={selectedId === c.id} />
						{:else}
							<UserAvatarFallback name={displayUser(peerOf(c))} px={40} active={selectedId === c.id} />
						{/if}
						<div class="conv-text">
							<div class="conv-name-row">
								<span class="conv-name">{displayUser(peerOf(c))}</span>
								{#if c.unreadCount > 0}
									<span class="conv-badge">{c.unreadCount}</span>
								{/if}
							</div>
							<p class="conv-preview">{c.lastMessageBody ?? 'ابدأ المحادثة الآن'}</p>
						</div>
					</div>
					<div class="conv-time" dir="ltr">
						{c.lastMessageAt
							? new Date(c.lastMessageAt).toLocaleTimeString('en-US', {
									hour: '2-digit',
									minute: '2-digit'
								})
							: ''}
					</div>
				</div>
			</button>
		{/each}
	</div>
</div>

<style>
	/* Tokens aligned with dietitian foods / recipes pages */
	.conv-list {
		--fp-ink: #121816;
		--fp-muted: #5c6560;
		--fp-line: #e2e8e4;
		--fp-surface: #ffffff;
		--fp-accent: #2a9d62;
		--fp-warm: #faf9f6;
		--fp-accent-soft: #e6f4eb;

		display: flex;
		flex-direction: column;
		background: var(--fp-surface);
		border: 1px solid var(--fp-line);
		border-radius: 16px;
		box-shadow: 0 4px 24px rgba(18, 24, 22, 0.04);
		overflow: hidden;
		min-height: 200px;
		font-family: 'Tajawal', sans-serif;
	}
	.conv-search {
		padding: 12px 14px;
		border-bottom: 1px solid var(--fp-line);
		background: var(--fp-warm);
	}
	.conv-input {
		width: 100%;
		height: 42px;
		border: 1.5px solid var(--fp-line);
		border-radius: 12px;
		padding: 0 14px;
		font-family: inherit;
		font-size: 14px;
		color: var(--fp-ink);
		background: var(--fp-surface);
		transition:
			border-color 0.15s ease,
			box-shadow 0.15s ease;
	}
	.conv-input::placeholder {
		color: #94a3b8;
	}
	.conv-input:hover {
		border-color: #cbd5e1;
	}
	.conv-input:focus {
		outline: none;
		border-color: var(--fp-accent);
		box-shadow: 0 0 0 3px rgba(42, 157, 98, 0.12);
	}
	.conv-scroll {
		flex: 1;
		overflow: auto;
		max-height: min(62vh, 560px);
		-webkit-overflow-scrolling: touch;
	}
	@media (max-width: 899px) {
		.conv-scroll {
			max-height: min(48vh, 420px);
		}
	}
	@media (max-width: 480px) {
		.conv-scroll {
			max-height: min(42vh, 360px);
		}
	}
	.conv-empty {
		padding: 28px 20px;
		text-align: center;
		font-size: 13.5px;
		color: var(--fp-muted);
	}
	.conv-item {
		width: 100%;
		text-align: start;
		padding: 12px 16px;
		border: none;
		border-bottom: 1px solid rgba(226, 232, 228, 0.85);
		background: var(--fp-surface);
		cursor: pointer;
		font: inherit;
		transition: background 0.12s ease;
	}
	.conv-item:last-child {
		border-bottom: none;
	}
	.conv-item:hover {
		background: rgba(250, 249, 246, 0.85);
	}
	.conv-item.active {
		background: linear-gradient(
			180deg,
			rgba(220, 245, 232, 0.95) 0%,
			rgba(198, 230, 212, 0.88) 100%
		);
		box-shadow: inset 0 0 0 1px rgba(42, 157, 98, 0.28);
	}
	.conv-item.active:hover {
		background: linear-gradient(
			180deg,
			rgba(210, 240, 225, 0.98) 0%,
			rgba(186, 222, 200, 0.92) 100%
		);
		box-shadow: inset 0 0 0 1px rgba(42, 157, 98, 0.35);
	}
	.conv-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}
	.conv-left {
		display: flex;
		align-items: center;
		gap: 12px;
		min-width: 0;
	}
	.conv-avatar {
		width: 40px;
		height: 40px;
		border-radius: 999px;
		object-fit: cover;
		border: 1px solid var(--fp-line);
		flex-shrink: 0;
	}
	.conv-avatar.active {
		box-shadow: 0 0 0 2px rgba(42, 157, 98, 0.35);
	}
	.conv-text {
		min-width: 0;
	}
	.conv-name-row {
		display: flex;
		align-items: center;
		gap: 8px;
		min-width: 0;
	}
	.conv-name {
		font-weight: 700;
		font-size: 14px;
		color: var(--fp-ink);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.conv-badge {
		flex-shrink: 0;
		min-width: 24px;
		height: 24px;
		padding: 0 8px;
		border-radius: 999px;
		background: linear-gradient(165deg, #34b16f 0%, var(--fp-accent) 50%, #1f7a4a 100%);
		color: #fff;
		font-size: 11px;
		font-weight: 700;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border: 1px solid #1f7a4a;
		box-shadow: 0 2px 8px rgba(42, 157, 98, 0.22);
	}
	.conv-preview {
		margin: 4px 0 0;
		font-size: 12.5px;
		color: var(--fp-muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.conv-time {
		flex-shrink: 0;
		font-size: 11px;
		color: var(--fp-muted);
	}
</style>
