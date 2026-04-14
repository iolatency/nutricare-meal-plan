import { env } from '$env/dynamic/private';

export interface EdamamFood {
	foodId: string;
	label: string;
	knownAs?: string;
	brand?: string;
	category?: string;
	categoryLabel?: string;
	foodContentsLabel?: string;
	nutrients: Record<string, number>;
	image?: string;
	healthLabels?: string[];
	cautions?: string[];
	dietLabels?: string[];
	servingSizes?: { uri: string; label: string; quantity: number }[];
	servingsPerContainer?: number;
}

export interface EdamamMeasure {
	uri: string;
	label: string;
	weight: number;
	qualified?: { qualifiers: { uri: string; label: string }[]; weight: number }[];
}

export interface EdamamHint {
	food: EdamamFood;
	measures: EdamamMeasure[];
}

export interface EdamamNutrientResponse {
	uri: string;
	calories: number;
	totalWeight: number;
	dietLabels: string[];
	healthLabels: string[];
	cautions: string[];
	totalNutrients: Record<string, { label: string; quantity: number; unit: string }>;
	totalDaily: Record<string, { label: string; quantity: number; unit: string }>;
	ingredients: { parsed: { foodId: string; food: string; quantity: number; measure: string; weight: number; nutrients: Record<string, { label: string; quantity: number; unit: string }> }[] }[];
}

function getCredentials() {
	return {
		appId: env.EDAMAM_APP_ID ?? '',
		appKey: env.EDAMAM_APP_KEY ?? ''
	};
}

export async function searchEdamam(q: string, maxResults = 100): Promise<EdamamHint[]> {
	const { appId, appKey } = getCredentials();
	if (!appId || !appKey) return [];
	try {
		const all: EdamamHint[] = [];
		let nextUrl: string | null = `https://api.edamam.com/api/food-database/v2/parser?ingr=${encodeURIComponent(q)}&app_id=${appId}&app_key=${appKey}`;
		let safety = 0;

		while (nextUrl && all.length < maxResults && safety < 12) {
			const res: Response = await fetch(nextUrl);
			if (!res.ok) break;
			const data: { hints?: EdamamHint[]; _links?: { next?: { href?: string } } } = await res.json();
			const hints = (data.hints ?? []) as EdamamHint[];
			all.push(...hints);
			nextUrl = data?._links?.next?.href ?? null;
			safety++;
		}

		return all.slice(0, maxResults);
	} catch {
		return [];
	}
}

/**
 * Fetch full nutrient breakdown for a food item from Edamam Nutrients API (step 2).
 * Uses the default 100g measure when no measureURI is provided.
 */
export async function fetchNutrients(
	foodId: string,
	measureURI?: string,
	quantity = 100
): Promise<EdamamNutrientResponse | null> {
	const { appId, appKey } = getCredentials();
	if (!appId || !appKey) return null;
	try {
		const body = {
			ingredients: [
				{
					quantity,
					measureURI: measureURI ?? `http://www.edamam.com/ontologies/edamam.owl#Measure_gram`,
					foodId
				}
			]
		};
		const res = await fetch(
			`https://api.edamam.com/api/food-database/v2/nutrients?app_id=${appId}&app_key=${appKey}`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			}
		);
		if (!res.ok) return null;
		return (await res.json()) as EdamamNutrientResponse;
	} catch {
		return null;
	}
}

/**
 * Flatten the totalNutrients map from a nutrients response into a simple { key: value } record
 * suitable for storing alongside the existing fullNutrients format.
 */
export function flattenNutrients(
	nr: EdamamNutrientResponse
): Record<string, number | string[]> {
	const flat: Record<string, number | string[]> = {};
	for (const [key, entry] of Object.entries(nr.totalNutrients)) {
		flat[key] = Math.round(entry.quantity * 100) / 100;
	}
	if (nr.healthLabels?.length) flat._health_labels = nr.healthLabels;
	if (nr.cautions?.length) flat._cautions = nr.cautions;
	if (nr.dietLabels?.length) flat._diet_labels = nr.dietLabels;
	return flat;
}
