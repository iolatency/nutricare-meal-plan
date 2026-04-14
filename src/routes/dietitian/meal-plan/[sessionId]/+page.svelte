<script lang="ts">
	import DietitianMealPlanSessionPage from '$lib/features/meal-plan/components/DietitianMealPlanSessionPage.svelte';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<DietitianMealPlanSessionPage {data} {form} />
