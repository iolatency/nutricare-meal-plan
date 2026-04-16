import type { PageServerLoad } from './$types';
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

export interface RecipeIngredient {
	id: number;
	customText: string | null;
	foodName: string | null;
	quantity: number;
	unit: string;
}

export interface PatientRecipe {
	id: number;
	name: string;
	imageUrl: string | null;
	calories: number;
	protein: number;
	carbs: number;
	fat: number;
	steps: string | null;
	ingredients: RecipeIngredient[];
	sessionId: number;
	sessionStartDate: string;
	sessionEndDate: string;
	sessionStatus: 'draft' | 'active' | 'completed';
	lastUsedDate: string | null;
}

export type RecipePhase = 'history' | 'current' | 'upcoming';

export interface RecipeGroup {
	sessionId: number;
	sessionStartDate: string;
	sessionEndDate: string;
	sessionStatus: 'draft' | 'active' | 'completed';
	phase: RecipePhase;
	recipes: PatientRecipe[];
}

function classifyPhase(
	status: 'draft' | 'active' | 'completed',
	startDate: string,
	endDate: string
): RecipePhase {
	if (status === 'completed') return 'history';
	if (status === 'active') return 'current';
	const today = new Date().toISOString().split('T')[0];
	if (startDate > today) return 'upcoming';
	if (endDate < today) return 'history';
	return 'current';
}

export const load: PageServerLoad = async ({ locals }) => {
	const user = requireUser(locals.user);

	const sessions = db
		.select({
			id: mealPlanSessions.id,
			startDate: mealPlanSessions.startDate,
			endDate: mealPlanSessions.endDate,
			status: mealPlanSessions.status
		})
		.from(mealPlanSessions)
		.where(eq(mealPlanSessions.clientId, user.id))
		.orderBy(desc(mealPlanSessions.id))
		.all() as Array<{
			id: number;
			startDate: string;
			endDate: string;
			status: 'draft' | 'active' | 'completed';
		}>;

	if (!sessions.length) return { groups: [] as RecipeGroup[] };

	// Map recipeId → session metadata (first session where it appears)
	const recipeToSession = new Map<
		number,
		{ sessionId: number; startDate: string; endDate: string; status: 'draft' | 'active' | 'completed'; lastUsedDate: string | null }
	>();

	for (const session of sessions) {
		const plan = db
			.select({ id: mealPlans.id })
			.from(mealPlans)
			.where(eq(mealPlans.sessionId, session.id))
			.orderBy(desc(mealPlans.version))
			.limit(1)
			.get();

		if (!plan) continue;

		const days = db
			.select({ id: mealDays.id, date: mealDays.date })
			.from(mealDays)
			.where(eq(mealDays.mealPlanId, plan.id))
			.all();

		if (!days.length) continue;

		const dayIds = days.map((d) => d.id);
		const dateByDayId = new Map(days.map((d) => [d.id, d.date]));

		const mealRows = db
			.select({ recipeId: meals.recipeId, mealDayId: meals.mealDayId })
			.from(meals)
			.where(and(inArray(meals.mealDayId, dayIds), isNotNull(meals.recipeId)))
			.all();

		for (const meal of mealRows) {
			if (!meal.recipeId) continue;
			const date = dateByDayId.get(meal.mealDayId) ?? null;

			if (!recipeToSession.has(meal.recipeId)) {
				recipeToSession.set(meal.recipeId, {
					sessionId: session.id,
					startDate: session.startDate,
					endDate: session.endDate,
					status: session.status,
					lastUsedDate: date
				});
			} else {
				const existing = recipeToSession.get(meal.recipeId)!;
				if (date && (!existing.lastUsedDate || date > existing.lastUsedDate)) {
					existing.lastUsedDate = date;
				}
			}
		}
	}

	if (!recipeToSession.size) return { groups: [] as RecipeGroup[] };

	const recipeIds = [...recipeToSession.keys()];

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

	const foodIds = [
		...new Set(ingredientRows.filter((i) => i.foodItemId).map((i) => i.foodItemId!))
	];
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

	const ingredientsByRecipe = new Map<number, RecipeIngredient[]>();
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

	const allRecipes: PatientRecipe[] = recipeRows.map((recipe) => {
		const info = recipeToSession.get(recipe.id)!;
		let calories = 0, protein = 0, carbs = 0, fat = 0;
		try {
			const n = JSON.parse(recipe.nutrients ?? '{}');
			calories = n.calories ?? 0;
			protein = n.protein ?? 0;
			carbs = n.carbs ?? 0;
			fat = n.fat ?? 0;
		} catch {
			// ignore
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
			sessionId: info.sessionId,
			sessionStartDate: info.startDate,
			sessionEndDate: info.endDate,
			sessionStatus: info.status,
			lastUsedDate: info.lastUsedDate
		};
	});

	// Group by session, ordered same as sessions (desc by id)
	const groupMap = new Map<number, RecipeGroup>();
	for (const session of sessions) {
		const sessionRecipes = allRecipes.filter((r) => r.sessionId === session.id);
		if (sessionRecipes.length === 0) continue;
		groupMap.set(session.id, {
			sessionId: session.id,
			sessionStartDate: session.startDate,
			sessionEndDate: session.endDate,
			sessionStatus: session.status,
			phase: classifyPhase(session.status, session.startDate, session.endDate),
			recipes: sessionRecipes
		});
	}

	const groups = [...groupMap.values()];

	return { groups };
};
