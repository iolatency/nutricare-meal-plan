export type LocalSearchFood = {
	id: number;
	name: string;
	nameAr: string | null;
	imageUrl: string | null;
	calories: number;
	protein: number;
	carbs: number;
	fat: number;
	fiber: number;
	unit: string;
	portionSize: number;
	source: string;
	fullNutrients: string | null;
	createdBy: number | null;
};

export async function searchLocalFoods(query: string): Promise<LocalSearchFood[]> {
	const response = await fetch(`/api/foods/local-search?q=${encodeURIComponent(query)}`);
	if (!response.ok) return [];
	return (await response.json()) as LocalSearchFood[];
}

export async function searchExternalFoods<T>(query: string): Promise<T[]> {
	const response = await fetch(`/api/foods/external-search?q=${encodeURIComponent(query)}`);
	if (!response.ok) return [];
	return (await response.json()) as T[];
}

/** Full nutrient breakdown (Nutrients API) for a catalog food — same enrichment as import, without creating a user food. */
export async function fetchExternalFoodDetail(foodId: string): Promise<{
	fullNutrients: string | null;
	calories: number;
	protein: number;
	carbs: number;
	fat: number;
	fiber: number;
} | null> {
	const response = await fetch(`/api/foods/external-detail?foodId=${encodeURIComponent(foodId)}`);
	if (!response.ok) return null;
	return (await response.json()) as {
		fullNutrients: string | null;
		calories: number;
		protein: number;
		carbs: number;
		fat: number;
		fiber: number;
	};
}

export async function importExternalFood(payload: Record<string, unknown>) {
	return fetch('/api/foods/import', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(payload)
	});
}
