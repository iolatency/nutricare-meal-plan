import { db } from '$lib/server/db';
import { foodItems, foodCategories, userFoodImports, externalFoodCatalog } from '$lib/server/db/schema';
import { eq, ne, like, or, and, desc, sql, exists } from 'drizzle-orm';
import { fail, type ActionFailure } from '@sveltejs/kit';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

export async function loadDietitianFoodsPage(params: {
	userId: number;
	url: URL;
}) {
	const { userId, url } = params;
	const q = url.searchParams.get('q') ?? '';
	const pageRaw = Number(url.searchParams.get('page') ?? '1');
	const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;
	const pageSize = 20;
	const offset = (page - 1) * pageSize;

	/** أطعمتي: ما أنشأه المستخدم (غير Edamam) أو مستوردات Edamam التي ما زال ربطها في user_food_imports. */
	const myOwnNonEdamam = and(eq(foodItems.createdBy, userId), ne(foodItems.source, 'edamam'));
	const myLinkedEdamamImport = exists(
		db
			.select({ x: sql`1` })
			.from(userFoodImports)
			.where(
				and(eq(userFoodImports.foodItemId, foodItems.id), eq(userFoodImports.userId, userId))!
			)
	);
	const myFoodsScope = or(myOwnNonEdamam, myLinkedEdamamImport);

	const searchClause = q ? or(like(foodItems.name, `%${q}%`), like(foodItems.nameAr, `%${q}%`)) : undefined;

	const whereClause = searchClause ? and(myFoodsScope, searchClause) : myFoodsScope;

	const foods = db
		.select({ food: foodItems, category: foodCategories })
		.from(foodItems)
		.leftJoin(foodCategories, eq(foodItems.categoryId, foodCategories.id))
		.where(whereClause!)
		.orderBy(desc(foodItems.id))
		.limit(pageSize)
		.offset(offset)
		.all();

	const totalCountRow = db
		.select({ count: sql<number>`count(*)` })
		.from(foodItems)
		.where(whereClause!)
		.get();
	const totalCount = Number(totalCountRow?.count ?? 0);
	const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

	const categories = db.select().from(foodCategories).all();

	const extPageRaw = Number(url.searchParams.get('extPage') ?? '1');
	const externalPage = Number.isFinite(extPageRaw) && extPageRaw > 0 ? Math.floor(extPageRaw) : 1;
	const externalPageSize = 20;

	/** تبويب القاعدة الخارجية: كل صفوف الكتالوج المحلي (نتائج البحث المحفوظة)، مع ربط الاستيراد للمستخدم إن وُجد. */
	const externalTotalRow = db
		.select({ count: sql<number>`count(*)` })
		.from(externalFoodCatalog)
		.get();
	const externalTotalCount = Number(externalTotalRow?.count ?? 0);
	const externalTotalPages = Math.max(1, Math.ceil(externalTotalCount / externalPageSize));
	const externalPageClamped =
		externalTotalCount === 0 ? 1 : Math.min(externalPage, externalTotalPages);
	const externalOffset = (externalPageClamped - 1) * externalPageSize;

	const externalFoods = db
		.select({
			catalog: externalFoodCatalog,
			food: foodItems,
			category: foodCategories
		})
		.from(externalFoodCatalog)
		.leftJoin(
			userFoodImports,
			and(
				eq(userFoodImports.externalFoodId, externalFoodCatalog.id),
				eq(userFoodImports.userId, userId)
			)!
		)
		.leftJoin(foodItems, eq(userFoodImports.foodItemId, foodItems.id))
		.leftJoin(foodCategories, eq(foodItems.categoryId, foodCategories.id))
		.orderBy(desc(externalFoodCatalog.id))
		.limit(externalPageSize)
		.offset(externalOffset)
		.all();

	const preferExternalTab = url.searchParams.has('extPage');

	return {
		userId,
		foods,
		categories,
		q,
		page,
		pageSize,
		totalCount,
		totalPages,
		externalFoods,
		externalPage: externalPageClamped,
		externalPageSize,
		externalTotalCount,
		externalTotalPages,
		preferExternalTab
	};
}

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export async function actionCreateFood(params: {
	userId: number;
	data: FormData;
}): Promise<ActionFailure<{ error: string }> | { success: true }> {
	const { userId, data } = params;
	const name = data.get('name')?.toString().trim() ?? '';
	const nameAr = data.get('nameAr')?.toString().trim() ?? '';
	const calories = parseFloat(data.get('calories')?.toString() ?? '0') || 0;
	const protein = parseFloat(data.get('protein')?.toString() ?? '0') || 0;
	const carbs = parseFloat(data.get('carbs')?.toString() ?? '0') || 0;
	const fat = parseFloat(data.get('fat')?.toString() ?? '0') || 0;
	const unit = data.get('unit')?.toString() ?? 'g';
	const portionSize = parseFloat(data.get('quantity')?.toString() ?? '100') || 100;
	const categoryId = parseInt(data.get('categoryId')?.toString() ?? '0') || null;

	if (!name) return fail(400, { error: 'يرجى إدخال اسم الطعام' });

	const nutrientFields: [number, string][] = [
		[calories, 'السعرات الحرارية'],
		[protein, 'البروتين'],
		[carbs, 'الكربوهيدرات'],
		[fat, 'الدهون']
	];
	for (const [val, label] of nutrientFields) {
		if (val < 0) return fail(400, { error: `${label} لا يمكن أن تكون قيمة سالبة` });
		if (val > 10_000) return fail(400, { error: `قيمة ${label} مرتفعة بشكل غير معقول` });
	}

	const fullNutrients: Record<string, number | string[]> = {};
	for (const [key, value] of data.entries()) {
		if (key.startsWith('micro_')) {
			const nutrientKey = key.slice(6);
			const val = parseFloat(value.toString());
			if (!isNaN(val) && val !== 0) {
				fullNutrients[nutrientKey] = val;
			}
		}
	}

	try {
		const cautionsStr = data.get('cautions')?.toString() ?? '[]';
		const dietLabelsStr = data.get('dietLabels')?.toString() ?? '[]';
		const healthLabelsStr = data.get('healthLabels')?.toString() ?? '[]';
		const cautions = JSON.parse(cautionsStr) as string[];
		const dietLabels = JSON.parse(dietLabelsStr) as string[];
		const healthLabels = JSON.parse(healthLabelsStr) as string[];
		if (cautions.length) fullNutrients._cautions = cautions;
		if (dietLabels.length) fullNutrients._diet_labels = dietLabels;
		if (healthLabels.length) fullNutrients._health_labels = healthLabels;
	} catch {
		// ignore parse errors
	}

	let imageUrl: string | null = null;
	const imageFile = data.get('image') as File | null;
	if (imageFile && imageFile.size > 0 && imageFile.name) {
		if (!ALLOWED_MIME.has(imageFile.type)) {
			return fail(400, { error: 'نوع الملف غير مسموح. الأنواع المسموحة: JPEG, PNG, WEBP, GIF' });
		}
		try {
			const uploadsDir = join(process.cwd(), 'static', 'uploads', 'foods');
			await mkdir(uploadsDir, { recursive: true });
			const ext = imageFile.name.split('.').pop()?.toLowerCase() ?? 'jpg';
			const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
			const buffer = Buffer.from(await imageFile.arrayBuffer());
			await writeFile(join(uploadsDir, filename), buffer);
			imageUrl = `/uploads/foods/${filename}`;
		} catch {
			// Non-fatal: continue without image
		}
	}

	const fiberFromMicro = typeof fullNutrients['FIBTG'] === 'number' ? (fullNutrients['FIBTG'] as number) : null;
	const fiber = fiberFromMicro ?? (parseFloat(data.get('fiber')?.toString() ?? '0') || 0);

	db.insert(foodItems)
		.values({
			name,
			nameAr: nameAr || null,
			calories,
			protein,
			carbs,
			fat,
			fiber,
			unit,
			portionSize,
			categoryId,
			imageUrl,
			fullNutrients: Object.keys(fullNutrients).length ? JSON.stringify(fullNutrients) : null,
			createdBy: userId
		})
		.run();

	return { success: true };
}

export async function actionCreateFoodCategory(
	data: FormData
): Promise<ActionFailure<{ error: string }> | { success: true; category: typeof foodCategories.$inferSelect }> {
	const nameAr = data.get('nameAr')?.toString().trim() ?? '';
	if (!nameAr) return fail(400, { error: 'يرجى إدخال اسم التصنيف' });

	const [created] = db.insert(foodCategories).values({ name: nameAr, nameAr }).returning().all();

	return { success: true, category: created };
}

export async function actionDeleteFood(params: {
	userId: number;
	data: FormData;
}): Promise<ActionFailure<{ error: string }> | { success: true }> {
	const { userId, data } = params;
	const foodId = parseInt(data.get('foodId')?.toString() ?? '0');
	if (!foodId) return fail(400, { error: 'معرّف الطعام غير صالح' });

	const row = db.select().from(foodItems).where(eq(foodItems.id, foodId)).get();
	if (!row) return fail(404, { error: 'الطعام غير موجود' });
	if (row.createdBy !== userId) {
		return fail(403, { error: 'يمكنك إزالة الأطعمة التي أضفتها أنت فقط' });
	}

	/** مستوردات Edamam: إزالة الرابط فقط؛ يبقى السجل في food_items والكتالوج الخارجي (خطط الوجبات تبقى صالحة). */
	if (row.source === 'edamam') {
		db.delete(userFoodImports)
			.where(and(eq(userFoodImports.userId, userId), eq(userFoodImports.foodItemId, foodId)))
			.run();
		return { success: true };
	}

	db.delete(foodItems).where(eq(foodItems.id, foodId)).run();
	return { success: true };
}

export async function actionUpdateFood(params: {
	userId: number;
	data: FormData;
}): Promise<ActionFailure<{ error: string }> | { success: true }> {
	const { userId, data } = params;
	const foodId = parseInt(data.get('foodId')?.toString() ?? '0');
	if (!foodId) return fail(400, { error: 'معرّف الطعام غير صالح' });

	const current = db.select().from(foodItems).where(eq(foodItems.id, foodId)).get();
	if (!current) return fail(404, { error: 'الطعام غير موجود' });
	if (current.source === 'edamam') {
		return fail(403, { error: 'لا يمكن تعديل الأطعمة المستوردة من القاعدة الخارجية' });
	}
	if (current.createdBy !== userId) {
		return fail(403, { error: 'يمكنك تعديل الأطعمة التي أنشأتها فقط' });
	}

	const name = data.get('name')?.toString().trim() ?? '';
	const nameAr = data.get('nameAr')?.toString().trim() ?? '';
	const calories = parseFloat(data.get('calories')?.toString() ?? '0') || 0;
	const protein = parseFloat(data.get('protein')?.toString() ?? '0') || 0;
	const carbs = parseFloat(data.get('carbs')?.toString() ?? '0') || 0;
	const fat = parseFloat(data.get('fat')?.toString() ?? '0') || 0;
	const unit = data.get('unit')?.toString() ?? 'g';
	const portionSize = parseFloat(data.get('quantity')?.toString() ?? '100') || 100;

	if (!name) return fail(400, { error: 'يرجى إدخال اسم الطعام' });

	const nutrientFields: [number, string][] = [
		[calories, 'السعرات الحرارية'],
		[protein, 'البروتين'],
		[carbs, 'الكربوهيدرات'],
		[fat, 'الدهون']
	];
	for (const [val, label] of nutrientFields) {
		if (val < 0) return fail(400, { error: `${label} لا يمكن أن تكون قيمة سالبة` });
		if (val > 10_000) return fail(400, { error: `قيمة ${label} مرتفعة بشكل غير معقول` });
	}

	const fullNutrients: Record<string, number | string[]> = {};
	for (const [key, value] of data.entries()) {
		if (key.startsWith('micro_')) {
			const nutrientKey = key.slice(6);
			const val = parseFloat(value.toString());
			if (!isNaN(val) && val !== 0) fullNutrients[nutrientKey] = val;
		}
	}

	try {
		const cautions = JSON.parse(data.get('cautions')?.toString() ?? '[]') as string[];
		const dietLabels = JSON.parse(data.get('dietLabels')?.toString() ?? '[]') as string[];
		const healthLabels = JSON.parse(data.get('healthLabels')?.toString() ?? '[]') as string[];
		if (cautions.length) fullNutrients._cautions = cautions;
		if (dietLabels.length) fullNutrients._diet_labels = dietLabels;
		if (healthLabels.length) fullNutrients._health_labels = healthLabels;
	} catch {
		// ignore parse errors
	}

	let imageUrl = current.imageUrl;
	const imageFile = data.get('image') as File | null;
	if (imageFile && imageFile.size > 0 && imageFile.name) {
		if (!ALLOWED_MIME.has(imageFile.type)) {
			return fail(400, { error: 'نوع الملف غير مسموح. الأنواع المسموحة: JPEG, PNG, WEBP, GIF' });
		}
		try {
			const uploadsDir = join(process.cwd(), 'static', 'uploads', 'foods');
			await mkdir(uploadsDir, { recursive: true });
			const ext = imageFile.name.split('.').pop()?.toLowerCase() ?? 'jpg';
			const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
			const buffer = Buffer.from(await imageFile.arrayBuffer());
			await writeFile(join(uploadsDir, filename), buffer);
			imageUrl = `/uploads/foods/${filename}`;
		} catch {
			// Non-fatal: keep previous image
		}
	}

	const fiberFromMicro = typeof fullNutrients.FIBTG === 'number' ? (fullNutrients.FIBTG as number) : null;
	const fiber = fiberFromMicro ?? (parseFloat(data.get('fiber')?.toString() ?? '0') || 0);

	db.update(foodItems)
		.set({
			name,
			nameAr: nameAr || null,
			calories,
			protein,
			carbs,
			fat,
			fiber,
			unit,
			portionSize,
			imageUrl,
			fullNutrients: Object.keys(fullNutrients).length ? JSON.stringify(fullNutrients) : null
		})
		.where(eq(foodItems.id, foodId))
		.run();

	return { success: true };
}
