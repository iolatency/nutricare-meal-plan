<script lang="ts">
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();
</script>

<svelte:head>
	<link
		href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;600;700&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

<div class="patient-root" dir="rtl">
	{@render children()}
</div>

<style>
	.patient-root {
		min-height: 100vh;
		font-family: 'Tajawal', sans-serif;
		background: #f3f5f2;
		color: #121816;
	}
</style>
