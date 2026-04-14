<script lang="ts">
	import DietitianFoodsPage from '$lib/features/foods/components/DietitianFoodsPage.svelte';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<DietitianFoodsPage {data} {form} />
