export type SearchRecipeFood = {
	id: number | null;       // null = Edamam result not yet imported
	edamamFoodId?: string;   // present when id is null, used for auto-import on select
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

type ExternalSearchFood = {
	foodId: string;
	dbId: number | null;
	label: string;
	knownAs: string | null;
	calories: number;
	protein: number;
	carbs: number;
	fat: number;
	fiber: number;
	image?: string | null;
	fullNutrients?: string | null;
};

function mapExternalToRecipeFood(food: ExternalSearchFood): SearchRecipeFood {
	const imported = typeof food.dbId === 'number';
	return {
		id: imported ? food.dbId : null,
		edamamFoodId: imported ? undefined : food.foodId,
		name: food.label,
		nameAr: food.knownAs ?? null,
		calories: Number(food.calories ?? 0),
		protein: Number(food.protein ?? 0),
		carbs: Number(food.carbs ?? 0),
		fat: Number(food.fat ?? 0),
		fiber: Number(food.fiber ?? 0),
		unit: 'g',
		portionSize: 100
	};
}

export async function searchRecipeFoods(query: string): Promise<SearchRecipeFood[]> {
	const q = encodeURIComponent(query);

	// external-search: checks catalog DB first, then calls Edamam API if nothing cached
	const response = await fetch(`/api/foods/external-search?q=${q}`);
	if (!response.ok) return [];

	const raw = (await response.json()) as ExternalSearchFood[];
	return raw.map(mapExternalToRecipeFood);
}

export async function importEdamamFood(
	foodId: string,
	data: { name: string; nameAr?: string; calories: number; protein: number; carbs: number; fat: number; fiber: number }
): Promise<number | null> {
	const response = await fetch('/api/foods/import', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ foodId, ...data })
	});
	if (!response.ok) return null;
	const result = (await response.json()) as { id: number };
	return result.id;
}

export async function generateRecipeWithAi(payload: Record<string, unknown>) {
	return fetch('/api/ai/recipe', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(payload)
	});
}
