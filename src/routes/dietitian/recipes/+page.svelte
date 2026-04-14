<script lang="ts">
	import DietitianRecipesPage from '$lib/features/recipes/components/DietitianRecipesPage.svelte';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<DietitianRecipesPage {data} {form} />
