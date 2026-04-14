import { db } from '$lib/server/db';
import { foodItems, externalFoodCatalog, userFoodImports } from '$lib/server/db/schema';
import { like, or, eq, and, ne, inArray, sql, isNotNull } from 'drizzle-orm';
import { fetchNutrients, flattenNutrients, searchEdamam } from '$lib/server/edamam';
import type { EdamamNutrientResponse } from '$lib/server/edamam';

const PROVIDER_EDAMAM = 'edamam' as const;

function nutrientsWithLabelsFromFood(f: {
	nutrients: Record<string, number>;
	healthLabels?: string[];
	cautions?: string[];
	dietLabels?: string[];
}): Record<string, number | string[]> {
	const nutrientsWithLabels: Record<string, number | string[]> = { ...f.nutrients };
	if (f.healthLabels?.length) nutrientsWithLabels._health_labels = f.healthLabels;
	if (f.cautions?.length) nutrientsWithLabels._cautions = f.cautions;
	if (f.dietLabels?.length) nutrientsWithLabels._diet_labels = f.dietLabels;
	return nutrientsWithLabels;
}

/** Upsert catalog row from Edamam search hint (no user side effects). */
function upsertCatalogFromSearchHint(h: (Awaited<ReturnType<typeof searchEdamam>>)[number]) {
	const f = h.food;
	const nut = f.nutrients;
	const nutrientsWithLabels = nutrientsWithLabelsFromFood({
		nutrients: nut,
		healthLabels: f.healthLabels,
		cautions: f.cautions,
		dietLabels: f.dietLabels
	});
	const fullNutrientsStr = JSON.stringify(nutrientsWithLabels);

	db.insert(externalFoodCatalog)
		.values({
			provider: PROVIDER_EDAMAM,
			providerFoodId: f.foodId,
			name: f.label,
			nameAr: f.knownAs && f.knownAs !== f.label ? f.knownAs : null,
			calories: Math.round(nut['ENERC_KCAL'] ?? 0),
			protein: Math.round((nut['PROCNT'] ?? 0) * 10) / 10,
			carbs: Math.round((nut['CHOCDF'] ?? 0) * 10) / 10,
			fat: Math.round((nut['FAT'] ?? 0) * 10) / 10,
			fiber: Math.round((nut['FIBTG'] ?? 0) * 10) / 10,
			unit: 'g',
			portionSize: 100,
			imageUrl: f.image ?? null,
			fullNutrients: fullNutrientsStr,
			externalParserFoodJson: JSON.stringify(f),
			externalParserMeasuresJson: JSON.stringify(h.measures),
			externalNutrientsJson: null
		})
		.onConflictDoUpdate({
			target: [externalFoodCatalog.provider, externalFoodCatalog.providerFoodId],
			set: {
				name: sql`excluded.name`,
				nameAr: sql`excluded.name_ar`,
				calories: sql`excluded.calories`,
				protein: sql`excluded.protein`,
				carbs: sql`excluded.carbs`,
				fat: sql`excluded.fat`,
				fiber: sql`excluded.fiber`,
				imageUrl: sql`excluded.image_url`,
				fullNutrients: sql`excluded.full_nutrients`,
				externalParserFoodJson: sql`excluded.external_parser_food_json`,
				externalParserMeasuresJson: sql`excluded.external_parser_measures_json`
			}
		})
		.run();
}

export function searchFoodsForApi(params: {
	q: string;
	source: string;
	ownerOnly: boolean;
	excludeEdamam: boolean;
	maxResults: number;
	userId: number;
}) {
	const { q, source, ownerOnly, excludeEdamam, maxResults, userId } = params;
	if (q.length < 2) return [] as unknown[];

	const nameCond = or(like(foodItems.name, `%${q}%`), like(foodItems.nameAr, `%${q}%`));
	const dbConds = [nameCond];
	if (ownerOnly) dbConds.push(eq(foodItems.createdBy, userId));
	if (excludeEdamam)
		dbConds.push(or(ne(foodItems.source, 'edamam'), eq(foodItems.createdBy, userId))!);
	const ownerCond = dbConds.length === 1 ? dbConds[0]! : and(...dbConds);

	const internal = db
		.select()
		.from(foodItems)
		.where(ownerCond!)
		.limit(20)
		.all()
		.map((f) => ({ ...f, _source: 'internal' as const }));

	if (source === 'internal') return internal;

	if (source === 'all' && internal.length >= 5) {
		return internal;
	}

	return { internal, needsEdamam: true as const, hintsMax: source === 'edamam' ? maxResults : Math.min(maxResults, 40) };
}

export async function searchFoodsForApiComplete(params: {
	q: string;
	source: string;
	ownerOnly: boolean;
	excludeEdamam: boolean;
	maxResults: number;
	userId: number;
}) {
	const partial = searchFoodsForApi(params);
	if (Array.isArray(partial)) return partial;

	const { internal, hintsMax } = partial;
	const hints = await searchEdamam(params.q, hintsMax);
	if (hints.length === 0) return internal;

	for (const h of hints) {
		upsertCatalogFromSearchHint(h);
	}

	const foodIds = hints.map((h) => h.food.foodId);
	const importedRows =
		foodIds.length > 0
			? db
					.select({ food: foodItems })
					.from(userFoodImports)
					.innerJoin(externalFoodCatalog, eq(userFoodImports.externalFoodId, externalFoodCatalog.id))
					.innerJoin(foodItems, eq(userFoodImports.foodItemId, foodItems.id))
					.where(
						and(
							eq(userFoodImports.userId, params.userId),
							inArray(externalFoodCatalog.providerFoodId, foodIds),
							isNotNull(userFoodImports.foodItemId)
						)!
					)
					.all()
					.map((r) => ({ ...r.food, _source: 'internal' as const }))
			: [];

	const byExternal = new Map(importedRows.filter((r) => r.externalId).map((r) => [r.externalId!, r]));
	const savedEdamam = hints
		.map((h) => byExternal.get(h.food.foodId))
		.filter((x): x is NonNullable<typeof x> => x !== undefined);

	if (params.source === 'edamam') return savedEdamam;

	const internalIds = new Set(internal.map((f) => f.id));
	const newItems = savedEdamam.filter((e) => !internalIds.has(e.id));

	return [...internal, ...newItems.slice(0, Math.max(0, 15 - internal.length))];
}

export function localSearchFoodsForApi(params: { q: string; ownerOnly: boolean; userId: number }) {
	const { q, ownerOnly, userId } = params;
	if (q.length < 2) return [];

	const nameCond = or(like(foodItems.name, `%${q}%`), like(foodItems.nameAr, `%${q}%`));

	if (ownerOnly) {
		return db
			.select()
			.from(foodItems)
			.where(and(nameCond, eq(foodItems.createdBy, userId))!)
			.limit(30)
			.all();
	}

	const catNameMatch = or(
		like(externalFoodCatalog.name, `%${q}%`),
		like(externalFoodCatalog.nameAr, `%${q}%`)
	);
	const foodNameMatch = or(like(foodItems.name, `%${q}%`), like(foodItems.nameAr, `%${q}%`));
	const nameMatch = or(catNameMatch, foodNameMatch);

	return db
		.select({
			id: foodItems.id,
			name: sql<string>`coalesce(${foodItems.name}, ${externalFoodCatalog.name})`,
			nameAr: sql<string | null>`coalesce(${foodItems.nameAr}, ${externalFoodCatalog.nameAr})`,
			imageUrl: sql<string | null>`coalesce(${foodItems.imageUrl}, ${externalFoodCatalog.imageUrl})`,
			calories: sql<number>`coalesce(${foodItems.calories}, ${externalFoodCatalog.calories})`,
			protein: sql<number>`coalesce(${foodItems.protein}, ${externalFoodCatalog.protein})`,
			carbs: sql<number>`coalesce(${foodItems.carbs}, ${externalFoodCatalog.carbs})`,
			fat: sql<number>`coalesce(${foodItems.fat}, ${externalFoodCatalog.fat})`,
			fiber: sql<number>`coalesce(${foodItems.fiber}, ${externalFoodCatalog.fiber})`,
			unit: sql<string>`coalesce(${foodItems.unit}, ${externalFoodCatalog.unit})`,
			portionSize: sql<number>`coalesce(${foodItems.portionSize}, ${externalFoodCatalog.portionSize})`,
			source: sql<string>`'edamam'`,
			fullNutrients: sql<string | null>`coalesce(${foodItems.fullNutrients}, ${externalFoodCatalog.fullNutrients})`,
			createdBy: sql<number | null>`${userId}`,
			externalParserFoodJson: sql<string | null>`coalesce(${foodItems.externalParserFoodJson}, ${externalFoodCatalog.externalParserFoodJson})`,
			externalParserMeasuresJson: sql<string | null>`coalesce(${foodItems.externalParserMeasuresJson}, ${externalFoodCatalog.externalParserMeasuresJson})`,
			externalNutrientsJson: sql<string | null>`coalesce(${foodItems.externalNutrientsJson}, ${externalFoodCatalog.externalNutrientsJson})`
		})
		.from(userFoodImports)
		.innerJoin(externalFoodCatalog, eq(userFoodImports.externalFoodId, externalFoodCatalog.id))
		.innerJoin(foodItems, eq(userFoodImports.foodItemId, foodItems.id))
		.where(and(eq(userFoodImports.userId, userId), nameMatch, isNotNull(userFoodImports.foodItemId))!)
		.limit(30)
		.all();
}

export type ImportFoodBody = {
	foodId: string;
	name: string;
	nameAr?: string;
	calories?: number;
	protein?: number;
	carbs?: number;
	fat?: number;
	fiber?: number;
	image?: string;
	fullNutrients?: string;
	parserFoodJson?: string;
	parserMeasuresJson?: string;
};

export type ImportFoodResult =
	| { ok: true; id: number; already: boolean }
	| { ok: false; status: number; message: string };

export async function importFoodFromEdamam(params: {
	userId: number;
	body: ImportFoodBody;
}): Promise<ImportFoodResult> {
	const { userId, body } = params;
	const {
		foodId,
		name,
		nameAr,
		calories,
		protein,
		carbs,
		fat,
		fiber,
		image,
		fullNutrients,
		parserFoodJson,
		parserMeasuresJson
	} = body;

	if (!foodId || !name) return { ok: false, status: 400, message: 'Missing required fields' };

	const nutrientsToCheck: [number | undefined, string][] = [
		[calories, 'calories'],
		[protein, 'protein'],
		[carbs, 'carbs'],
		[fat, 'fat']
	];
	for (const [val, field] of nutrientsToCheck) {
		const n = val ?? 0;
		if (n < 0) return { ok: false, status: 400, message: `${field} cannot be negative` };
		if (n > 10_000) return { ok: false, status: 400, message: `${field} value is unreasonably high` };
	}

	let nutrientsJson: string | null = null;
	let resolvedFullNutrients = fullNutrients ?? null;
	try {
		const nr = await fetchNutrients(foodId);
		if (nr) {
			nutrientsJson = JSON.stringify(nr);
			resolvedFullNutrients = JSON.stringify(flattenNutrients(nr));
		}
	} catch {
		/* non-critical */
	}

	db.insert(externalFoodCatalog)
		.values({
			provider: PROVIDER_EDAMAM,
			providerFoodId: foodId,
			name,
			nameAr: nameAr && nameAr !== name ? nameAr : null,
			calories: calories ?? 0,
			protein: protein ?? 0,
			carbs: carbs ?? 0,
			fat: fat ?? 0,
			fiber: fiber ?? 0,
			unit: 'g',
			portionSize: 100,
			imageUrl: image ?? null,
			fullNutrients: resolvedFullNutrients,
			externalParserFoodJson: parserFoodJson ?? null,
			externalParserMeasuresJson: parserMeasuresJson ?? null,
			externalNutrientsJson: nutrientsJson
		})
		.onConflictDoUpdate({
			target: [externalFoodCatalog.provider, externalFoodCatalog.providerFoodId],
			set: {
				name: sql`excluded.name`,
				nameAr: sql`excluded.name_ar`,
				calories: sql`excluded.calories`,
				protein: sql`excluded.protein`,
				carbs: sql`excluded.carbs`,
				fat: sql`excluded.fat`,
				fiber: sql`excluded.fiber`,
				imageUrl: sql`excluded.image_url`,
				fullNutrients: sql`COALESCE(excluded.full_nutrients, ${externalFoodCatalog.fullNutrients})`,
				externalParserFoodJson: sql`COALESCE(excluded.external_parser_food_json, ${externalFoodCatalog.externalParserFoodJson})`,
				externalParserMeasuresJson: sql`COALESCE(excluded.external_parser_measures_json, ${externalFoodCatalog.externalParserMeasuresJson})`,
				externalNutrientsJson: sql`COALESCE(excluded.external_nutrients_json, ${externalFoodCatalog.externalNutrientsJson})`
			}
		})
		.run();

	const catalogRow = db
		.select({ id: externalFoodCatalog.id })
		.from(externalFoodCatalog)
		.where(and(eq(externalFoodCatalog.provider, PROVIDER_EDAMAM), eq(externalFoodCatalog.providerFoodId, foodId)))
		.get();
	if (!catalogRow) return { ok: false, status: 500, message: 'Failed to resolve catalog row' };

	const existingImport = db
		.select()
		.from(userFoodImports)
		.where(and(eq(userFoodImports.userId, userId), eq(userFoodImports.externalFoodId, catalogRow.id)))
		.get();

	if (existingImport?.foodItemId) {
		const fid = existingImport.foodItemId;
		const fi = db.select().from(foodItems).where(eq(foodItems.id, fid)).get();
		if (fi && !fi.externalNutrientsJson && nutrientsJson) {
			try {
				db.update(foodItems)
					.set({
						externalNutrientsJson: nutrientsJson,
						fullNutrients: resolvedFullNutrients ?? fi.fullNutrients
					})
					.where(eq(foodItems.id, fid))
					.run();
			} catch {
				/* non-critical */
			}
		}
		return { ok: true, id: fid, already: true };
	}

	if (existingImport && !existingImport.foodItemId) {
		try {
			const [createdFood] = db
				.insert(foodItems)
				.values({
					name,
					nameAr: nameAr && nameAr !== name ? nameAr : null,
					calories: calories ?? 0,
					protein: protein ?? 0,
					carbs: carbs ?? 0,
					fat: fat ?? 0,
					fiber: fiber ?? 0,
					unit: 'g',
					portionSize: 100,
					source: 'edamam',
					externalId: foodId,
					imageUrl: image ?? null,
					fullNutrients: resolvedFullNutrients,
					externalParserFoodJson: parserFoodJson ?? null,
					externalParserMeasuresJson: parserMeasuresJson ?? null,
					externalNutrientsJson: nutrientsJson,
					createdBy: userId
				})
				.returning()
				.all();
			db.update(userFoodImports)
				.set({ foodItemId: createdFood.id })
				.where(eq(userFoodImports.id, existingImport.id))
				.run();
			return { ok: true, id: createdFood.id, already: false };
		} catch {
			/* fall through to standard insert path */
		}
	}

	try {
		const [createdFood] = db
			.insert(foodItems)
			.values({
				name,
				nameAr: nameAr && nameAr !== name ? nameAr : null,
				calories: calories ?? 0,
				protein: protein ?? 0,
				carbs: carbs ?? 0,
				fat: fat ?? 0,
				fiber: fiber ?? 0,
				unit: 'g',
				portionSize: 100,
				source: 'edamam',
				externalId: foodId,
				imageUrl: image ?? null,
				fullNutrients: resolvedFullNutrients,
				externalParserFoodJson: parserFoodJson ?? null,
				externalParserMeasuresJson: parserMeasuresJson ?? null,
				externalNutrientsJson: nutrientsJson,
				createdBy: userId
			})
			.returning()
			.all();

		db.insert(userFoodImports)
			.values({
				userId,
				externalFoodId: catalogRow.id,
				foodItemId: createdFood.id
			})
			.run();

		return { ok: true, id: createdFood.id, already: false };
	} catch {
		const row = db
			.select({ id: foodItems.id })
			.from(foodItems)
			.where(and(eq(foodItems.externalId, foodId), eq(foodItems.createdBy, userId)))
			.get();
		if (row) {
			db.insert(userFoodImports)
				.values({ userId, externalFoodId: catalogRow.id, foodItemId: row.id })
				.onConflictDoNothing({ target: [userFoodImports.userId, userFoodImports.externalFoodId] })
				.run();
			return { ok: true, id: row.id, already: true };
		}
		return { ok: false, status: 500, message: 'Failed to import food' };
	}
}

const MIN_CATALOG_NUMERIC_NUTRIENT_KEYS = 20;

function countCatalogNumericNutrientKeys(fullNutrientsJson: string | null): number {
	if (!fullNutrientsJson) return 0;
	try {
		const o = JSON.parse(fullNutrientsJson) as Record<string, unknown>;
		let n = 0;
		for (const [k, v] of Object.entries(o)) {
			if (k.startsWith('_')) continue;
			if (typeof v === 'number') n++;
		}
		return n;
	} catch {
		return 0;
	}
}

function macrosFromNutrientFlatRecord(flat: Record<string, number | string[]>) {
	return {
		calories: Math.round(Number(flat['ENERC_KCAL']) || 0),
		protein: Math.round((Number(flat['PROCNT']) || 0) * 10) / 10,
		carbs: Math.round((Number(flat['CHOCDF']) || 0) * 10) / 10,
		fat: Math.round((Number(flat['FAT']) || 0) * 10) / 10,
		fiber: Math.round((Number(flat['FIBTG']) || 0) * 10) / 10
	};
}

export type ExternalCatalogNutrientsPayload = {
	fullNutrients: string | null;
	calories: number;
	protein: number;
	carbs: number;
	fat: number;
	fiber: number;
};

/**
 * Ensures catalog `full_nutrients` matches Edamam Nutrients API (same as import path) when the row
 * only has sparse parser data. Uses cached `external_nutrients_json` when present (no extra API call).
 */
export async function enrichExternalCatalogNutrientsForApi(
	foodId: string
): Promise<{ ok: true; data: ExternalCatalogNutrientsPayload } | { ok: false; status: 404; message: string }> {
	const row = db
		.select()
		.from(externalFoodCatalog)
		.where(
			and(eq(externalFoodCatalog.provider, PROVIDER_EDAMAM), eq(externalFoodCatalog.providerFoodId, foodId))!
		)
		.get();
	if (!row) return { ok: false, status: 404, message: 'Catalog row not found' };

	const respondFromRow = (): ExternalCatalogNutrientsPayload => ({
		fullNutrients: row.fullNutrients,
		calories: row.calories,
		protein: row.protein,
		carbs: row.carbs,
		fat: row.fat,
		fiber: row.fiber
	});

	if (row.externalNutrientsJson) {
		try {
			const nr = JSON.parse(row.externalNutrientsJson) as EdamamNutrientResponse;
			const flat = flattenNutrients(nr);
			const newStr = JSON.stringify(flat);
			const m = macrosFromNutrientFlatRecord(flat);
			db.update(externalFoodCatalog)
				.set({
					fullNutrients: newStr,
					calories: m.calories,
					protein: m.protein,
					carbs: m.carbs,
					fat: m.fat,
					fiber: m.fiber
				})
				.where(eq(externalFoodCatalog.id, row.id))
				.run();
			return { ok: true, data: { fullNutrients: newStr, ...m } };
		} catch {
			/* fall through */
		}
	}

	if (countCatalogNumericNutrientKeys(row.fullNutrients) >= MIN_CATALOG_NUMERIC_NUTRIENT_KEYS) {
		return { ok: true, data: respondFromRow() };
	}

	const nr = await fetchNutrients(foodId);
	if (!nr) {
		return { ok: true, data: respondFromRow() };
	}

	const flat = flattenNutrients(nr);
	const nutrientsJson = JSON.stringify(nr);
	const newStr = JSON.stringify(flat);
	const m = macrosFromNutrientFlatRecord(flat);
	db.update(externalFoodCatalog)
		.set({
			fullNutrients: newStr,
			externalNutrientsJson: nutrientsJson,
			calories: m.calories,
			protein: m.protein,
			carbs: m.carbs,
			fat: m.fat,
			fiber: m.fiber
		})
		.where(eq(externalFoodCatalog.id, row.id))
		.run();

	return { ok: true, data: { fullNutrients: newStr, ...m } };
}

export async function externalSearchFoodsForApi(params: { q: string; userId: number }) {
	const { q, userId } = params;
	if (q.length < 2) return [];

	const hints = await searchEdamam(q, 50);
	if (hints.length === 0) return [];

	for (const h of hints) {
		upsertCatalogFromSearchHint(h);
	}

	const foodIds = hints.map((h) => h.food.foodId);
	const importLinks =
		foodIds.length > 0
			? db
					.select({
						providerFoodId: externalFoodCatalog.providerFoodId,
						foodItemId: userFoodImports.foodItemId
					})
					.from(userFoodImports)
					.innerJoin(externalFoodCatalog, eq(userFoodImports.externalFoodId, externalFoodCatalog.id))
					.where(
						and(
							eq(userFoodImports.userId, userId),
							inArray(externalFoodCatalog.providerFoodId, foodIds),
							isNotNull(userFoodImports.foodItemId)
						)!
					)
					.all()
			: [];

	const importMap = new Map(
		importLinks.map((l) => [l.providerFoodId, l.foodItemId] as [string, number])
	);

	const catalogRows =
		foodIds.length > 0
			? db
					.select()
					.from(externalFoodCatalog)
					.where(
						and(eq(externalFoodCatalog.provider, PROVIDER_EDAMAM), inArray(externalFoodCatalog.providerFoodId, foodIds))!
					)
					.all()
			: [];
	const catalogByFoodId = new Map(catalogRows.map((c) => [c.providerFoodId, c]));

	return hints.map((h) => {
		const f = h.food;
		const nut = f.nutrients;
		const nutrientsWithLabels = nutrientsWithLabelsFromFood({
			nutrients: nut,
			healthLabels: f.healthLabels,
			cautions: f.cautions,
			dietLabels: f.dietLabels
		});
		const cat = catalogByFoodId.get(f.foodId);
		const fullNutrientsStr = cat?.fullNutrients ?? JSON.stringify(nutrientsWithLabels);
		const dbId = importMap.get(f.foodId) ?? null;
		return {
			foodId: f.foodId,
			label: f.label,
			knownAs: f.knownAs ?? null,
			brand: f.brand ?? null,
			category: f.category ?? null,
			categoryLabel: f.categoryLabel ?? null,
			foodContentsLabel: f.foodContentsLabel ?? null,
			image: f.image ?? null,
			calories: Math.round(nut['ENERC_KCAL'] ?? 0),
			protein: Math.round((nut['PROCNT'] ?? 0) * 10) / 10,
			carbs: Math.round((nut['CHOCDF'] ?? 0) * 10) / 10,
			fat: Math.round((nut['FAT'] ?? 0) * 10) / 10,
			fiber: Math.round((nut['FIBTG'] ?? 0) * 10) / 10,
			fullNutrients: fullNutrientsStr,
			healthLabels: f.healthLabels ?? [],
			cautions: f.cautions ?? [],
			dietLabels: f.dietLabels ?? [],
			measures: h.measures.map((m) => ({ label: m.label, weight: m.weight })),
			alreadyImported: dbId !== null,
			dbId
		};
	});
}
