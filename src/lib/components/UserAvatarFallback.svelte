<script lang="ts">
	import { avatarFallbackColors, avatarInitial } from '$lib/ui/user-avatar';

	let {
		name,
		px = 40,
		active = false
	}: {
		name: string;
		px?: number;
		active?: boolean;
	} = $props();

	const colors = $derived(avatarFallbackColors(name));
	const letter = $derived(avatarInitial(name));
	const fontPx = $derived(Math.max(12, Math.round(px * 0.38)));
</script>

<div
	class="uaf"
	class:uaf-active={active}
	style:width="{px}px"
	style:height="{px}px"
	style:background={colors.bg}
	style:color={colors.text}
	style:font-size="{fontPx}px"
	aria-hidden="true"
>
	{letter}
</div>

<style>
	.uaf {
		border-radius: 999px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 700;
		flex-shrink: 0;
		border: 1px solid rgba(15, 23, 42, 0.08);
		font-family: 'Tajawal', sans-serif;
		line-height: 1;
		box-sizing: border-box;
	}
	.uaf-active {
		box-shadow: 0 0 0 2px rgba(42, 157, 98, 0.35);
	}
</style>
