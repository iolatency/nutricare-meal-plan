import type { RequestHandler } from '@sveltejs/kit';
import { json, error } from '@sveltejs/kit';
import { requireUser } from '$lib/server/authz/policy';
import { db } from '$lib/server/db';
import {
	mealPlanSessions,
	mealPlans,
	mealDays,
	meals,
	recipes,
	recipeIngredients,
	foodItems
} from '$lib/server/db/schema';
import { eq, desc, and, inArray, isNotNull } from 'drizzle-orm';

export interface PatientRecipeIngredient {
	id: number;
	customText: string | null;
	foodName: string | null;
	quantity: number;
	unit: string;
}

export interface PatientRecipeDTO {
	id: number;
	name: string;
	imageUrl: string | null;
	calories: number;
	protein: number;
	carbs: number;
	fat: number;
	steps: string | null;
	ingredients: PatientRecipeIngredient[];
	sessionId: number;
	sessionStartDate: string;
	sessionEndDate: string;
	sessionStatus: 'draft' | 'active' | 'completed';
	lastUsedDate: string | null;
}

export const GET: RequestHandler = async ({ locals, url }) => {
	const user = requireUser(locals.user);
	if (user.role !== 'patient') throw error(403, 'هذا المسار للمرضى فقط');

	const filterSessionId = url.searchParams.get('sessionId')
		? parseInt(url.searchParams.get('sessionId')!)
		: null;

	// Get all patient sessions (optionally filtered)
	const sessionQuery = db
		.select({
			id: mealPlanSessions.id,
			startDate: mealPlanSessions.startDate,
			endDate: mealPlanSessions.endDate,
			status: mealPlanSessions.status
		})
		.from(mealPlanSessions)
		.where(
			filterSessionId
				? and(
						eq(mealPlanSessions.clientId, user.id),
						eq(mealPlanSessions.id, filterSessionId)
					)
				: eq(mealPlanSessions.clientId, user.id)
		)
		.orderBy(desc(mealPlanSessions.id))
		.all() as Array<{
			id: number;
			startDate: string;
			endDate: string;
			status: 'draft' | 'active' | 'completed';
		}>;

	if (!sessionQuery.length) return json([]);

	// Map: recipeId → first session it appears in (for dedup)
	const recipeToSession = new Map<
		number,
		{ sessionId: number; startDate: string; endDate: string; status: 'draft' | 'active' | 'completed'; lastUsedDate: string | null }
	>();

	for (const session of sessionQuery) {
		// Get the latest plan for this session
		const plan = db
			.select({ id: mealPlans.id })
			.from(mealPlans)
			.where(eq(mealPlans.sessionId, session.id))
			.orderBy(desc(mealPlans.version))
			.limit(1)
			.get();

		if (!plan) continue;

		// Get all meal days for this plan
		const days = db
			.select({ id: mealDays.id, date: mealDays.date })
			.from(mealDays)
			.where(eq(mealDays.mealPlanId, plan.id))
			.all();

		if (!days.length) continue;

		const dayIds = days.map((d) => d.id);
		const dateByDayId = new Map(days.map((d) => [d.id, d.date]));

		// Get all meals in this plan that reference a recipe
		const mealRows = db
			.select({ recipeId: meals.recipeId, mealDayId: meals.mealDayId })
			.from(meals)
			.where(and(inArray(meals.mealDayId, dayIds), isNotNull(meals.recipeId)))
			.all();

		for (const meal of mealRows) {
			if (!meal.recipeId) continue;
			const date = dateByDayId.get(meal.mealDayId) ?? null;

			if (!recipeToSession.has(meal.recipeId)) {
				// First time we see this recipe — record its session info
				recipeToSession.set(meal.recipeId, {
					sessionId: session.id,
					startDate: session.startDate,
					endDate: session.endDate,
					status: session.status,
					lastUsedDate: date
				});
			} else {
				// Update lastUsedDate if this date is more recent
				const existing = recipeToSession.get(meal.recipeId)!;
				if (date && (!existing.lastUsedDate || date > existing.lastUsedDate)) {
					existing.lastUsedDate = date;
				}
			}
		}
	}

	if (!recipeToSession.size) return json([]);

	const recipeIds = [...recipeToSession.keys()];

	// Fetch canonical recipe data (no duplicate fields)
	const recipeRows = db
		.select({
			id: recipes.id,
			name: recipes.name,
			nameAr: recipes.nameAr,
			imageUrl: recipes.imageUrl,
			nutrients: recipes.nutrients,
			steps: recipes.steps
		})
		.from(recipes)
		.where(inArray(recipes.id, recipeIds))
		.all();

	// Fetch ingredients for all recipes
	const ingredientRows = db
		.select({
			id: recipeIngredients.id,
			recipeId: recipeIngredients.recipeId,
			foodItemId: recipeIngredients.foodItemId,
			customText: recipeIngredients.customText,
			quantity: recipeIngredients.quantity,
			unit: recipeIngredients.unit
		})
		.from(recipeIngredients)
		.where(inArray(recipeIngredients.recipeId, recipeIds))
		.all();

	// Fetch food names for ingredient food item IDs
	const foodIds = [...new Set(ingredientRows.filter((i) => i.foodItemId).map((i) => i.foodItemId!))];
	const foodMap = foodIds.length
		? new Map(
				db
					.select({ id: foodItems.id, name: foodItems.name, nameAr: foodItems.nameAr })
					.from(foodItems)
					.where(inArray(foodItems.id, foodIds))
					.all()
					.map((f) => [f.id, f.nameAr ?? f.name])
			)
		: new Map<number, string>();

	// Group ingredients by recipe
	const ingredientsByRecipe = new Map<number, PatientRecipeIngredient[]>();
	for (const ing of ingredientRows) {
		const list = ingredientsByRecipe.get(ing.recipeId) ?? [];
		list.push({
			id: ing.id,
			customText: ing.customText ?? null,
			foodName: ing.foodItemId ? (foodMap.get(ing.foodItemId) ?? null) : null,
			quantity: ing.quantity,
			unit: ing.unit
		});
		ingredientsByRecipe.set(ing.recipeId, list);
	}

	// Build output — one entry per recipe (deduplicated)
	const result: PatientRecipeDTO[] = recipeRows.map((recipe) => {
		const sessionInfo = recipeToSession.get(recipe.id)!;
		let calories = 0, protein = 0, carbs = 0, fat = 0;
		try {
			const n = JSON.parse(recipe.nutrients ?? '{}');
			calories = n.calories ?? 0;
			protein = n.protein ?? 0;
			carbs = n.carbs ?? 0;
			fat = n.fat ?? 0;
		} catch {
			// ignore malformed
		}

		return {
			id: recipe.id,
			name: recipe.nameAr ?? recipe.name,
			imageUrl: recipe.imageUrl ?? null,
			calories,
			protein,
			carbs,
			fat,
			steps: recipe.steps ?? null,
			ingredients: ingredientsByRecipe.get(recipe.id) ?? [],
			sessionId: sessionInfo.sessionId,
			sessionStartDate: sessionInfo.startDate,
			sessionEndDate: sessionInfo.endDate,
			sessionStatus: sessionInfo.status,
			lastUsedDate: sessionInfo.lastUsedDate
		};
	});

	return json(result);
};
