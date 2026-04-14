import { sqliteTable, text, integer, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { users } from './users';

export const foodCategories = sqliteTable('food_categories', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull(),
	nameAr: text('name_ar').notNull()
});

export const foodItems = sqliteTable(
	'food_items',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		name: text('name').notNull(),
		nameAr: text('name_ar'),
		calories: real('calories').notNull().default(0),
		protein: real('protein').notNull().default(0),
		carbs: real('carbs').notNull().default(0),
		fat: real('fat').notNull().default(0),
		fiber: real('fiber').notNull().default(0),
		unit: text('unit').notNull().default('g'),
		portionSize: real('portion_size').notNull().default(100),
		categoryId: integer('category_id').references(() => foodCategories.id),
		createdBy: integer('created_by').references(() => users.id),
		imageUrl: text('image_url'),
		fullNutrients: text('full_nutrients'),
		externalParserFoodJson: text('external_parser_food_json'),
		externalParserMeasuresJson: text('external_parser_measures_json'),
		externalNutrientsJson: text('external_nutrients_json'),
		source: text('source').notNull().default('internal'),
		externalId: text('external_id')
	},
	(t) => [
		index('food_items_category_idx').on(t.categoryId),
		/** One Edamam food per user (replaces global unique on external_id only). */
		uniqueIndex('food_items_external_owner_idx').on(t.externalId, t.createdBy)
	]
);

/** Immutable provider rows (e.g. Edamam). Not user-owned. */
export const externalFoodCatalog = sqliteTable(
	'external_food_catalog',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		provider: text('provider').notNull().default('edamam'),
		providerFoodId: text('provider_food_id').notNull(),
		name: text('name').notNull(),
		nameAr: text('name_ar'),
		calories: real('calories').notNull().default(0),
		protein: real('protein').notNull().default(0),
		carbs: real('carbs').notNull().default(0),
		fat: real('fat').notNull().default(0),
		fiber: real('fiber').notNull().default(0),
		unit: text('unit').notNull().default('g'),
		portionSize: real('portion_size').notNull().default(100),
		imageUrl: text('image_url'),
		fullNutrients: text('full_nutrients'),
		externalParserFoodJson: text('external_parser_food_json'),
		externalParserMeasuresJson: text('external_parser_measures_json'),
		externalNutrientsJson: text('external_nutrients_json')
	},
	(t) => [uniqueIndex('ext_food_catalog_provider_food_idx').on(t.provider, t.providerFoodId)]
);

/** Per-user link to an external catalog row; meal-plan bridge via food_item_id. */
export const userFoodImports = sqliteTable(
	'user_food_imports',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: integer('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		externalFoodId: integer('external_food_id')
			.notNull()
			.references(() => externalFoodCatalog.id, { onDelete: 'cascade' }),
		foodItemId: integer('food_item_id').references(() => foodItems.id, { onDelete: 'set null' }),
		importedAt: text('imported_at')
			.notNull()
			.default(sql`(datetime('now'))`)
	},
	(t) => [
		uniqueIndex('user_food_imports_user_catalog_idx').on(t.userId, t.externalFoodId),
		index('user_food_imports_user_idx').on(t.userId),
		index('user_food_imports_food_item_idx').on(t.foodItemId)
	]
);

export const recipeCategories = sqliteTable('recipe_categories', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull(),
	nameAr: text('name_ar'),
	ownerId: integer('owner_id').references(() => users.id, { onDelete: 'cascade' })
});

export const recipes = sqliteTable('recipes', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull(),
	nameAr: text('name_ar'),
	ownerId: integer('owner_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	steps: text('steps'),
	portions: integer('portions').default(1),
	nutrients: text('nutrients'),
	categoryId: integer('category_id').references(() => recipeCategories.id),
	isFavorite: integer('is_favorite', { mode: 'boolean' }).notNull().default(false),
	source: text('source').notNull().default('internal'),
	imageUrl: text('image_url'),
	createdAt: text('created_at')
		.notNull()
		.default(sql`(datetime('now'))`)
});

export const recipeIngredients = sqliteTable(
	'recipe_ingredients',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		recipeId: integer('recipe_id')
			.notNull()
			.references(() => recipes.id, { onDelete: 'cascade' }),
		foodItemId: integer('food_item_id').references(() => foodItems.id, { onDelete: 'set null' }),
		customText: text('custom_text'),
		quantity: real('quantity').notNull().default(1),
		unit: text('unit').notNull().default('g')
	},
	(t) => [index('recipe_ingredients_recipe_idx').on(t.recipeId)]
);

export const supplements = sqliteTable('supplements', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull(),
	kcalPerMl: real('kcal_per_ml'),
	totalKcal: real('total_kcal'),
	volumeMl: real('volume_ml'),
	carbs: real('carbs'),
	fat: real('fat'),
	protein: real('protein'),
	sodium: real('sodium'),
	potassium: real('potassium'),
	magnesium: real('magnesium'),
	phosphorus: real('phosphorus'),
	calcium: real('calcium'),
	waterMl: real('water_ml'),
	fiber: real('fiber'),
	osmolality: real('osmolality'),
	osmolarity: real('osmolarity'),
	reference: text('reference'),
	patientCategory: text('patient_category').notNull().default('adults'),
	formulaCategory: text('formula_category'),
	isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true)
});

export const mealPlanSessions = sqliteTable(
	'meal_plan_sessions',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		clientId: integer('client_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		dietitianId: integer('dietitian_id')
			.notNull()
			.references(() => users.id),
		startDate: text('start_date').notNull(),
		endDate: text('end_date').notNull(),
		status: text('status', { enum: ['draft', 'active', 'completed'] })
			.notNull()
			.default('draft')
	},
	(t) => [
		index('mps_client_idx').on(t.clientId),
		index('mps_dietitian_idx').on(t.dietitianId),
		uniqueIndex('mps_one_active_per_client_dietitian_idx')
			.on(t.clientId, t.dietitianId)
			.where(sql`${t.status} = 'active'`),
		uniqueIndex('mps_one_draft_per_client_dietitian_idx')
			.on(t.clientId, t.dietitianId)
			.where(sql`${t.status} = 'draft'`)
	]
);

export const mealPlans = sqliteTable('meal_plans', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	sessionId: integer('session_id')
		.notNull()
		.references(() => mealPlanSessions.id, { onDelete: 'cascade' }),
	planType: text('plan_type', { enum: ['daily', 'weekly'] })
		.notNull()
		.default('weekly'),
	version: integer('version').notNull().default(1),
	recommendation: text('recommendation'),
	note: text('note'),
	builderConfig: text('builder_config')
});

export const mealDays = sqliteTable('meal_days', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	mealPlanId: integer('meal_plan_id')
		.notNull()
		.references(() => mealPlans.id, { onDelete: 'cascade' }),
	date: text('date'),
	dayOfWeek: integer('day_of_week'),
	sortOrder: integer('sort_order').notNull().default(0)
});

export const meals = sqliteTable(
	'meals',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		mealDayId: integer('meal_day_id')
			.notNull()
			.references(() => mealDays.id, { onDelete: 'cascade' }),
		mealType: text('meal_type', {
			enum: [
				'breakfast',
				'brunch',
				'morning_snack',
				'lunch',
				'afternoon_snack',
				'dinner',
				'post_workout',
				'supplement'
			]
		})
			.notNull()
			.default('breakfast'),
		recipeId: integer('recipe_id').references(() => recipes.id),
		supplementId: integer('supplement_id').references(() => supplements.id),
		foodItemId: integer('food_item_id').references(() => foodItems.id),
		aiMealJson: text('ai_meal_json'),
		preparation: text('preparation'),
		sortOrder: integer('sort_order').notNull().default(0)
	},
	(t) => [index('meals_day_idx').on(t.mealDayId)]
);

export const mealTracking = sqliteTable('meal_tracking', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	sessionId: integer('session_id')
		.notNull()
		.references(() => mealPlanSessions.id, { onDelete: 'cascade' }),
	mealId: integer('meal_id')
		.notNull()
		.references(() => meals.id, { onDelete: 'cascade' }),
	date: text('date').notNull(),
	status: text('status', { enum: ['eaten', 'not_eaten', 'skipped'] }).notNull(),
	replacementNote: text('replacement_note')
});

export const dailyLogs = sqliteTable(
	'daily_logs',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		sessionId: integer('session_id')
			.notNull()
			.references(() => mealPlanSessions.id, { onDelete: 'cascade' }),
		clientId: integer('client_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		date: text('date').notNull(),
		waterCups: integer('water_cups').notNull().default(0),
		weight: real('weight'),
		adherenceScore: real('adherence_score'),
		completed: integer('completed', { mode: 'boolean' }).notNull().default(false),
		createdAt: text('created_at')
			.notNull()
			.default(sql`(datetime('now'))`)
	},
	(t) => [
		index('dl_session_date_idx').on(t.sessionId, t.date),
		index('dl_client_idx').on(t.clientId)
	]
);

export const patientDiagnoses = sqliteTable(
	'patient_diagnoses',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		clientId: integer('client_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		dietitianId: integer('dietitian_id')
			.notNull()
			.references(() => users.id),
		diagKey: text('diag_key').notNull(),
		name: text('name').notNull(),
		code: text('code'),
		severity: text('severity', { enum: ['mild', 'moderate', 'severe'] }).notNull(),
		diagnosedDate: text('diagnosed_date').notNull(),
		status: text('status', { enum: ['active', 'resolved', 'managed'] }).notNull(),
		notes: text('notes').notNull(),
		createdAt: text('created_at')
			.notNull()
			.default(sql`(datetime('now'))`)
	},
	(t) => [index('pd_client_idx').on(t.clientId), index('pd_dietitian_idx').on(t.dietitianId)]
);
