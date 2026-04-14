export type SearchRecipeFood = {
	id: number;
	name: string;
	nameAr: string | null;
	calories: number;
	protein: number;
	carbs: number;
	fat: number;
	fiber: number;
	unit: string;
	portionSize: number;
};

export async function searchRecipeFoods(query: string): Promise<SearchRecipeFood[]> {
	const response = await fetch(
		`/api/foods/search?q=${encodeURIComponent(query)}&source=internal&owner=1&excludeEdamam=1`
	);
	if (!response.ok) return [];
	return (await response.json()) as SearchRecipeFood[];
}

export async function generateRecipeWithAi(payload: Record<string, unknown>) {
	return fetch('/api/ai/recipe', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(payload)
	});
}
