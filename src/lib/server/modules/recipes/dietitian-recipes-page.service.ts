import { db } from '$lib/server/db';
import { recipes, recipeIngredients, foodItems, recipeCategories } from '$lib/server/db/schema';
import { eq, and, desc, inArray, or, isNull, asc } from 'drizzle-orm';
import { fail, type ActionFailure } from '@sveltejs/kit';
import { writeFile, mkdir, unlink } from 'fs/promises';
import { join } from 'path';

const MAX_RECIPE_IMAGE_BYTES = 5 * 1024 * 1024;
const RECIPE_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const EXT_BY_MIME: Record<string, string> = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp',
	'image/gif': 'gif'
};

function unlinkRecipeUploadIfOurs(imageUrl: string | null | undefined) {
	if (!imageUrl || !imageUrl.startsWith('/uploads/recipes/')) return;
	const base = imageUrl.slice('/uploads/recipes/'.length);
	if (!/^[a-zA-Z0-9._-]+$/.test(base)) return;
	const full = join(process.cwd(), 'static', 'uploads', 'recipes', base);
	unlink(full).catch(() => {});
}

async function saveRecipeImageUpload(imageFile: File | null): Promise<{ url: string | null; error?: string }> {
	if (!imageFile || imageFile.size === 0 || !imageFile.name) return { url: null };
	if (!RECIPE_IMAGE_MIME.has(imageFile.type)) {
		return { url: null, error: 'نوع صورة غير مسموح (JPEG، PNG، WEBP، GIF)' };
	}
	if (imageFile.size > MAX_RECIPE_IMAGE_BYTES) {
		return { url: null, error: 'حجم الصورة يتجاوز 5 ميغابايت' };
	}
	try {
		const uploadsDir = join(process.cwd(), 'static', 'uploads', 'recipes');
		await mkdir(uploadsDir, { recursive: true });
		const ext = EXT_BY_MIME[imageFile.type] ?? 'jpg';
		const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
		const buffer = Buffer.from(await imageFile.arrayBuffer());
		await writeFile(join(uploadsDir, filename), buffer);
		return { url: `/uploads/recipes/${filename}` };
	} catch {
		return { url: null, error: 'تعذر حفظ الصورة' };
	}
}

type IngInput = {
	foodId: number;
	quantity: number;
	unit: string;
	calories: number;
	protein: number;
	carbs: number;
	fat: number;
	fiber: number;
	portionSize: number;
};

function nutrientsJsonFromFoodIngs(ings: IngInput[]): string | null {
	let totalCal = 0,
		totalPro = 0,
		totalCarb = 0,
		totalFat = 0,
		totalFiber = 0;
	for (const ing of ings) {
		const factor = ing.quantity / (ing.portionSize || 100);
		totalCal += (ing.calories || 0) * factor;
		totalPro += (ing.protein || 0) * factor;
		totalCarb += (ing.carbs || 0) * factor;
		totalFat += (ing.fat || 0) * factor;
		totalFiber += (ing.fiber || 0) * factor;
	}
	if (ings.length === 0) return null;
	return JSON.stringify({
		calories: Math.round(totalCal),
		protein: Math.round(totalPro * 10) / 10,
		carbs: Math.round(totalCarb * 10) / 10,
		fat: Math.round(totalFat * 10) / 10,
		fiber: Math.round(totalFiber * 10) / 10
	});
}

function coerceFoodIngFromJson(o: Record<string, unknown>): IngInput | null {
	const foodId = parseInt(String(o.foodId ?? ''), 10);
	if (!Number.isFinite(foodId) || foodId <= 0) return null;
	const quantity = parseFloat(String(o.quantity));
	const unit = (typeof o.unit === 'string' ? o.unit : 'g').trim() || 'g';
	return {
		foodId,
		quantity: Number.isFinite(quantity) ? quantity : 0,
		unit,
		calories: parseFloat(String(o.calories)) || 0,
		protein: parseFloat(String(o.protein)) || 0,
		carbs: parseFloat(String(o.carbs)) || 0,
		fat: parseFloat(String(o.fat)) || 0,
		fiber: parseFloat(String(o.fiber)) || 0,
		portionSize: parseFloat(String(o.portionSize)) || 100
	};
}

export async function loadDietitianRecipesPage(ownerId: number) {
	const myRecipes = db
		.select({
			recipe: recipes,
			category: recipeCategories
		})
		.from(recipes)
		.leftJoin(recipeCategories, eq(recipes.categoryId, recipeCategories.id))
		.where(eq(recipes.ownerId, ownerId))
		.orderBy(desc(recipes.createdAt))
		.all();

	const recipeIds = myRecipes.map((r) => r.recipe.id);
	const allIngredients = recipeIds.length
		? db
				.select({
					ingredient: recipeIngredients,
					food: foodItems
				})
				.from(recipeIngredients)
				.leftJoin(foodItems, eq(recipeIngredients.foodItemId, foodItems.id))
				.where(inArray(recipeIngredients.recipeId, recipeIds))
				.all()
		: [];

	const ingredientsByRecipe = new Map<number, typeof allIngredients>();
	for (const row of allIngredients) {
		const arr = ingredientsByRecipe.get(row.ingredient.recipeId) ?? [];
		arr.push(row);
		ingredientsByRecipe.set(row.ingredient.recipeId, arr);
	}

	const recipesWithIngredients = myRecipes.map((r) => ({
		...r,
		ingredients: ingredientsByRecipe.get(r.recipe.id) ?? []
	}));

	const categories = db
		.select()
		.from(recipeCategories)
		.where(or(eq(recipeCategories.ownerId, ownerId), isNull(recipeCategories.ownerId)))
		.orderBy(asc(recipeCategories.name))
		.all();

	return { recipes: recipesWithIngredients, categories };
}

export async function actionCreateRecipe(params: {
	ownerId: number;
	data: FormData;
}): Promise<ActionFailure<{ error: string }> | { success: true }> {
	const { ownerId, data } = params;
	const nameRaw = data.get('name')?.toString().trim() ?? '';
	const nameAr = data.get('nameAr')?.toString().trim() ?? '';
	const name = nameRaw || nameAr;
	const rawSteps = data.get('steps')?.toString() ?? '';
	const yieldText = data.get('yield')?.toString().trim() ?? '';
	const steps = yieldText ? `الناتج: ${yieldText}\n\n${rawSteps}` : rawSteps;
	const portions = parseInt(data.get('portions')?.toString() ?? '1') || 1;
	const categoryId = parseInt(data.get('categoryId')?.toString() ?? '0') || null;
	const ingredientsJson = data.get('ingredients')?.toString() ?? '[]';
	const imageFile = data.get('image') as File | null;
	const { url: imageUrl, error: imageErr } = await saveRecipeImageUpload(imageFile);
	if (imageErr) return fail(400, { error: imageErr });

	if (!nameAr) return fail(400, { error: 'يرجى إدخال الاسم بالعربي' });

	let ings: IngInput[] = [];
	try {
		ings = JSON.parse(ingredientsJson);
	} catch {
		ings = [];
	}

	const nutrients = nutrientsJsonFromFoodIngs(ings);

	const recipe = db
		.insert(recipes)
		.values({
			name,
			nameAr,
			ownerId,
			steps,
			portions,
			categoryId,
			nutrients,
			imageUrl
		})
		.returning()
		.get();

	for (const ing of ings) {
		db.insert(recipeIngredients).values({
			recipeId: recipe.id,
			foodItemId: ing.foodId,
			quantity: ing.quantity,
			unit: ing.unit
		}).run();
	}

	return { success: true };
}

export async function actionDeleteRecipe(params: {
	ownerId: number;
	data: FormData;
}): Promise<ActionFailure<{ error: string }> | { success: true }> {
	const { ownerId, data } = params;
	const recipeId = parseInt(data.get('recipeId')?.toString() ?? '0');
	const row = db
		.select()
		.from(recipes)
		.where(and(eq(recipes.id, recipeId), eq(recipes.ownerId, ownerId)))
		.get();
	if (!row) return fail(403, { error: 'لا يمكنك حذف هذه الوصفة' });
	unlinkRecipeUploadIfOurs(row.imageUrl);
	db.delete(recipes).where(eq(recipes.id, recipeId)).run();
	return { success: true };
}

export async function actionEditRecipe(params: {
	ownerId: number;
	data: FormData;
}): Promise<ActionFailure<{ error: string }> | { success: true }> {
	const { ownerId, data } = params;
	const id = parseInt(data.get('id')?.toString() ?? '0');
	const nameRaw = data.get('name')?.toString().trim() ?? '';
	const nameArTrim = data.get('nameAr')?.toString().trim() ?? '';
	const nameAr = nameArTrim || null;
	const name = nameRaw || nameArTrim;
	const yieldText = data.get('yield')?.toString().trim() ?? '';
	const rawSteps = data.get('steps')?.toString() ?? '';
	const steps = yieldText ? `الناتج: ${yieldText}\n\n${rawSteps}` : rawSteps;
	const portions = parseInt(data.get('portions')?.toString() ?? '1') || 1;
	const categoryId = parseInt(data.get('categoryId')?.toString() ?? '0') || null;
	const imageFile = data.get('image') as File | null;
	const { url: newImageUrl, error: imageErr } = await saveRecipeImageUpload(imageFile);
	if (imageErr) return fail(400, { error: imageErr });

	if (!id) return fail(400, { error: 'بيانات غير صالحة' });
	if (!nameArTrim) return fail(400, { error: 'يرجى إدخال الاسم بالعربي' });
	if (!name) return fail(400, { error: 'بيانات غير صالحة' });
	if (!rawSteps.trim()) return fail(400, { error: 'يرجى إدخال خطوات التحضير' });

	const existing = db
		.select()
		.from(recipes)
		.where(and(eq(recipes.id, id), eq(recipes.ownerId, ownerId)))
		.get();
	if (!existing) return fail(403, { error: 'لا يمكنك تعديل هذه الوصفة' });

	const ingredientsJson = data.get('ingredients')?.toString();
	let nutrients: string | null | undefined = undefined;

	if (ingredientsJson !== undefined && ingredientsJson !== null) {
		let parsed: unknown[];
		try {
			const j = JSON.parse(ingredientsJson);
			parsed = Array.isArray(j) ? j : [];
		} catch {
			return fail(400, { error: 'مكونات غير صالحة' });
		}

		const foodIngsForNutrients: IngInput[] = [];
		db.delete(recipeIngredients).where(eq(recipeIngredients.recipeId, id)).run();

		for (const raw of parsed) {
			if (typeof raw !== 'object' || raw === null) continue;
			const o = raw as Record<string, unknown>;
			const customText = typeof o.customText === 'string' ? o.customText.trim() : '';
			const foodId = parseInt(String(o.foodId ?? ''), 10);
			if (customText && (!Number.isFinite(foodId) || foodId <= 0)) {
				const qty = parseFloat(String(o.quantity));
				const unit = (typeof o.unit === 'string' ? o.unit : 'g').trim() || 'g';
				db.insert(recipeIngredients).values({
					recipeId: id,
					foodItemId: null,
					customText,
					quantity: Number.isFinite(qty) ? qty : 0,
					unit
				}).run();
				continue;
			}
			const ing = coerceFoodIngFromJson(o);
			if (!ing) continue;
			foodIngsForNutrients.push(ing);
			db.insert(recipeIngredients).values({
				recipeId: id,
				foodItemId: ing.foodId,
				quantity: ing.quantity,
				unit: ing.unit
			}).run();
		}
		nutrients = nutrientsJsonFromFoodIngs(foodIngsForNutrients);
	}

	const patch: {
		name: string;
		nameAr: string | null;
		steps: string | null;
		portions: number;
		categoryId: number | null;
		imageUrl?: string | null;
		nutrients?: string | null;
	} = { name, nameAr, steps, portions, categoryId };
	if (newImageUrl) patch.imageUrl = newImageUrl;
	if (nutrients !== undefined) patch.nutrients = nutrients;

	const updated = db
		.update(recipes)
		.set(patch)
		.where(and(eq(recipes.id, id), eq(recipes.ownerId, ownerId)))
		.run();

	if (updated.changes === 0) return fail(403, { error: 'لا يمكنك تعديل هذه الوصفة' });

	if (newImageUrl) unlinkRecipeUploadIfOurs(existing.imageUrl);

	/* Legacy: quantity-only updates when ingredients JSON omitted */
	if (ingredientsJson === undefined || ingredientsJson === null) {
		let i = 0;
		while (data.has(`ingId_${i}`)) {
			const ingId = parseInt(data.get(`ingId_${i}`)?.toString() ?? '0');
			const qty = parseFloat(data.get(`ingQty_${i}`)?.toString() ?? '0');
			if (ingId && qty >= 0) {
				db.update(recipeIngredients).set({ quantity: qty }).where(eq(recipeIngredients.id, ingId)).run();
			}
			i++;
		}
	}

	return { success: true };
}

export async function actionCreateRecipeCategory(params: {
	ownerId: number;
	data: FormData;
}): Promise<ActionFailure<{ error: string }> | { success: true }> {
	const { ownerId, data } = params;
	const name = data.get('name')?.toString().trim() ?? '';
	if (!name) return fail(400, { error: 'يرجى إدخال اسم الفئة' });
	db.insert(recipeCategories).values({ name, ownerId }).run();
	return { success: true };
}
