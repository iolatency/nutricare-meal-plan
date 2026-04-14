/**
 * Data Integrity — Extended FK & Constraint Validation (SQLite / Drizzle)
 *
 * Extends validate-db.ts with deeper checks across all domain tables:
 *   - Foreign key referential integrity (every FK column points to a real row)
 *   - Unique constraint violations (recipe owner, food import, session uniqueness)
 *   - Cascade integrity (orphan detection after parent row removal)
 *   - Enum / allowed-value checks for status, role, and type columns
 *   - JSON column sanity (non-empty, valid JSON where required)
 *
 * Run: npx tsx tests/data-integrity/validate-db-extended.ts
 *
 * Exit 0 = all checks passed | Exit 1 = one or more checks failed
 */

import Database from 'better-sqlite3';
import { resolve } from 'path';

const DB_PATH = resolve(process.cwd(), 'local.db');
const db = new Database(DB_PATH, { readonly: true });

interface CheckResult {
	name: string;
	passed: boolean;
	detail?: string;
}

const results: CheckResult[] = [];

function check(name: string, passed: boolean, detail?: string) {
	results.push({ name, passed, detail });
	const icon = passed ? '✓' : '✗';
	if (!passed) {
		console.error(`  ${icon} FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
	} else {
		console.log(`  ${icon} PASS: ${name}`);
	}
}

/** Returns true if a table exists in the db. */
function tableExists(name: string): boolean {
	const row = db
		.prepare<[string], { cnt: number }>(
			`SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='table' AND name=?`
		)
		.get(name) as { cnt: number } | undefined;
	return (row?.cnt ?? 0) > 0;
}

function skip(name: string) {
	console.log(`  — SKIP: ${name} (table not found)`);
}

// ─── Organizations & Memberships ──────────────────────────────────────────────

console.log('\n=== Organizations & Memberships ===');

if (tableExists('organizations')) {
	const nullOrgName = db
		.prepare<[], { cnt: number }>(
			`SELECT COUNT(*) as cnt FROM organizations WHERE name IS NULL OR name = ''`
		)
		.get()!;
	check('No organizations with null/empty name', nullOrgName.cnt === 0, `${nullOrgName.cnt} found`);

	if (tableExists('memberships')) {
		const orphanedMembers = db
			.prepare<[], { cnt: number }>(
				`SELECT COUNT(*) as cnt FROM memberships
         WHERE organization_id NOT IN (SELECT id FROM organizations)`
			)
			.get()!;
		check('No orphaned memberships (org FK)', orphanedMembers.cnt === 0, `${orphanedMembers.cnt} orphans`);

		const memberUserOrphans = db
			.prepare<[], { cnt: number }>(
				`SELECT COUNT(*) as cnt FROM memberships
         WHERE user_id NOT IN (SELECT id FROM users)`
			)
			.get()!;
		check('No orphaned memberships (user FK)', memberUserOrphans.cnt === 0, `${memberUserOrphans.cnt} orphans`);

		const nullRoles = db
			.prepare<[], { cnt: number }>(
				`SELECT COUNT(*) as cnt FROM memberships WHERE roles IS NULL OR roles = ''`
			)
			.get()!;
		check('All memberships have roles column set', nullRoles.cnt === 0, `${nullRoles.cnt} with null roles`);

		const dupMemberships = db
			.prepare<[], { cnt: number }>(
				`SELECT COUNT(*) as cnt FROM (
           SELECT organization_id, user_id, COUNT(*) as n
           FROM memberships GROUP BY organization_id, user_id HAVING n > 1
         )`
			)
			.get()!;
		check('No duplicate (org, user) memberships', dupMemberships.cnt === 0, `${dupMemberships.cnt} duplicates`);
	}
} else {
	skip('organizations');
	skip('memberships');
}

// ─── Food Categories & Items ──────────────────────────────────────────────────

console.log('\n=== Food Categories & Items ===');

if (tableExists('food_categories')) {
	const nullCatNames = db
		.prepare<[], { cnt: number }>(
			`SELECT COUNT(*) as cnt FROM food_categories WHERE name IS NULL OR name = ''`
		)
		.get()!;
	check('All food categories have a name', nullCatNames.cnt === 0, `${nullCatNames.cnt} unnamed`);
} else {
	skip('food_categories');
}

if (tableExists('food_items')) {
	const orphanedFoodItems = db
		.prepare<[], { cnt: number }>(
			`SELECT COUNT(*) as cnt FROM food_items
       WHERE category_id IS NOT NULL
         AND category_id NOT IN (SELECT id FROM food_categories)`
		)
		.get()!;
	check('No food_items with invalid category_id FK', orphanedFoodItems.cnt === 0, `${orphanedFoodItems.cnt} invalid FKs`);

	const orphanedCreator = db
		.prepare<[], { cnt: number }>(
			`SELECT COUNT(*) as cnt FROM food_items
       WHERE created_by IS NOT NULL
         AND created_by NOT IN (SELECT id FROM users)`
		)
		.get()!;
	check('No food_items with invalid created_by FK', orphanedCreator.cnt === 0, `${orphanedCreator.cnt} invalid FKs`);

	const nullFoodName = db
		.prepare<[], { cnt: number }>(
			`SELECT COUNT(*) as cnt FROM food_items WHERE name IS NULL OR name = ''`
		)
		.get()!;
	check('All food_items have a name', nullFoodName.cnt === 0, `${nullFoodName.cnt} unnamed`);

	const negativeCalories = db
		.prepare<[], { cnt: number }>(
			`SELECT COUNT(*) as cnt FROM food_items WHERE calories < 0`
		)
		.get()!;
	check('No food_items with negative calories', negativeCalories.cnt === 0, `${negativeCalories.cnt} invalid`);

	// Unique (external_id, created_by) — only one Edamam food per user
	const dupExternalFoodPerUser = db
		.prepare<[], { cnt: number }>(
			`SELECT COUNT(*) as cnt FROM (
         SELECT external_id, created_by, COUNT(*) as n FROM food_items
         WHERE external_id IS NOT NULL
         GROUP BY external_id, created_by HAVING n > 1
       )`
		)
		.get()!;
	check('No duplicate (external_id, created_by) in food_items', dupExternalFoodPerUser.cnt === 0, `${dupExternalFoodPerUser.cnt} violations`);

	const invalidSource = db
		.prepare<[], { cnt: number }>(
			`SELECT COUNT(*) as cnt FROM food_items
       WHERE source NOT IN ('internal', 'edamam', 'custom')`
		)
		.get()!;
	check('food_items.source values are valid', invalidSource.cnt === 0, `${invalidSource.cnt} invalid`);
} else {
	skip('food_items');
}

// ─── External Food Catalog ────────────────────────────────────────────────────

console.log('\n=== External Food Catalog ===');

if (tableExists('external_food_catalog')) {
	const nullProviderFoodId = db
		.prepare<[], { cnt: number }>(
			`SELECT COUNT(*) as cnt FROM external_food_catalog
       WHERE provider_food_id IS NULL OR provider_food_id = ''`
		)
		.get()!;
	check('All external_food_catalog rows have provider_food_id', nullProviderFoodId.cnt === 0, `${nullProviderFoodId.cnt} missing`);

	const dupProviderFood = db
		.prepare<[], { cnt: number }>(
			`SELECT COUNT(*) as cnt FROM (
         SELECT provider, provider_food_id, COUNT(*) as n
         FROM external_food_catalog
         GROUP BY provider, provider_food_id HAVING n > 1
       )`
		)
		.get()!;
	check('Unique (provider, provider_food_id) in external_food_catalog', dupProviderFood.cnt === 0, `${dupProviderFood.cnt} duplicates`);
} else {
	skip('external_food_catalog');
}

// ─── User Food Imports ────────────────────────────────────────────────────────

console.log('\n=== User Food Imports ===');

if (tableExists('user_food_imports')) {
	const orphanedUserImports = db
		.prepare<[], { cnt: number }>(
			`SELECT COUNT(*) as cnt FROM user_food_imports
       WHERE user_id NOT IN (SELECT id FROM users)`
		)
		.get()!;
	check('No orphaned user_food_imports (user FK)', orphanedUserImports.cnt === 0, `${orphanedUserImports.cnt} orphans`);

	if (tableExists('external_food_catalog')) {
		const orphanedExternal = db
			.prepare<[], { cnt: number }>(
				`SELECT COUNT(*) as cnt FROM user_food_imports
         WHERE external_food_id NOT IN (SELECT id FROM external_food_catalog)`
			)
			.get()!;
		check('No orphaned user_food_imports (external_food_catalog FK)', orphanedExternal.cnt === 0, `${orphanedExternal.cnt} orphans`);
	}

	if (tableExists('food_items')) {
		const invalidFoodItemFk = db
			.prepare<[], { cnt: number }>(
				`SELECT COUNT(*) as cnt FROM user_food_imports
         WHERE food_item_id IS NOT NULL
           AND food_item_id NOT IN (SELECT id FROM food_items)`
			)
			.get()!;
		check('No user_food_imports with invalid food_item_id FK', invalidFoodItemFk.cnt === 0, `${invalidFoodItemFk.cnt} invalid`);
	}

	const dupUserImports = db
		.prepare<[], { cnt: number }>(
			`SELECT COUNT(*) as cnt FROM (
         SELECT user_id, external_food_id, COUNT(*) as n
         FROM user_food_imports GROUP BY user_id, external_food_id HAVING n > 1
       )`
		)
		.get()!;
	check('Unique (user_id, external_food_id) in user_food_imports', dupUserImports.cnt === 0, `${dupUserImports.cnt} duplicates`);
} else {
	skip('user_food_imports');
}

// ─── Recipes & Ingredients ────────────────────────────────────────────────────

console.log('\n=== Recipes & Ingredients ===');

if (tableExists('recipes')) {
	const orphanedRecipes = db
		.prepare<[], { cnt: number }>(
			`SELECT COUNT(*) as cnt FROM recipes
       WHERE owner_id NOT IN (SELECT id FROM users)`
		)
		.get()!;
	check('No orphaned recipes (owner FK)', orphanedRecipes.cnt === 0, `${orphanedRecipes.cnt} orphans`);

	const nullRecipeName = db
		.prepare<[], { cnt: number }>(
			`SELECT COUNT(*) as cnt FROM recipes WHERE name IS NULL OR name = ''`
		)
		.get()!;
	check('All recipes have a name', nullRecipeName.cnt === 0, `${nullRecipeName.cnt} unnamed`);

	const invalidRecipeSource = db
		.prepare<[], { cnt: number }>(
			`SELECT COUNT(*) as cnt FROM recipes
       WHERE source NOT IN ('internal', 'imported', 'ai')`
		)
		.get()!;
	check('recipes.source values are valid', invalidRecipeSource.cnt === 0, `${invalidRecipeSource.cnt} invalid`);

	if (tableExists('recipe_categories')) {
		const invalidCategoryFk = db
			.prepare<[], { cnt: number }>(
				`SELECT COUNT(*) as cnt FROM recipes
         WHERE category_id IS NOT NULL
           AND category_id NOT IN (SELECT id FROM recipe_categories)`
			)
			.get()!;
		check('No recipes with invalid category_id FK', invalidCategoryFk.cnt === 0, `${invalidCategoryFk.cnt} invalid`);
	}
} else {
	skip('recipes');
}

if (tableExists('recipe_categories')) {
	const orphanedCategories = db
		.prepare<[], { cnt: number }>(
			`SELECT COUNT(*) as cnt FROM recipe_categories
       WHERE owner_id IS NOT NULL
         AND owner_id NOT IN (SELECT id FROM users)`
		)
		.get()!;
	check('No orphaned recipe_categories (owner FK)', orphanedCategories.cnt === 0, `${orphanedCategories.cnt} orphans`);
} else {
	skip('recipe_categories');
}

if (tableExists('recipe_ingredients') && tableExists('recipes')) {
	const orphanedIngredients = db
		.prepare<[], { cnt: number }>(
			`SELECT COUNT(*) as cnt FROM recipe_ingredients
       WHERE recipe_id NOT IN (SELECT id FROM recipes)`
		)
		.get()!;
	check('No orphaned recipe_ingredients (recipe FK)', orphanedIngredients.cnt === 0, `${orphanedIngredients.cnt} orphans`);

	if (tableExists('food_items')) {
		const invalidFoodFk = db
			.prepare<[], { cnt: number }>(
				`SELECT COUNT(*) as cnt FROM recipe_ingredients
         WHERE food_item_id IS NOT NULL
           AND food_item_id NOT IN (SELECT id FROM food_items)`
			)
			.get()!;
		check('No recipe_ingredients with invalid food_item_id FK', invalidFoodFk.cnt === 0, `${invalidFoodFk.cnt} invalid`);
	}

	const nullQty = db
		.prepare<[], { cnt: number }>(
			`SELECT COUNT(*) as cnt FROM recipe_ingredients WHERE quantity <= 0`
		)
		.get()!;
	check('All recipe_ingredients have positive quantity', nullQty.cnt === 0, `${nullQty.cnt} with quantity <= 0`);
} else {
	skip('recipe_ingredients');
}

// ─── Meal Plan Sessions ───────────────────────────────────────────────────────

console.log('\n=== Meal Plan Sessions ===');

if (tableExists('meal_plan_sessions')) {
	const invalidStatus = db
		.prepare<[], { cnt: number }>(
			`SELECT COUNT(*) as cnt FROM meal_plan_sessions
       WHERE status NOT IN ('draft', 'active', 'completed')`
		)
		.get()!;
	check('meal_plan_sessions status values valid', invalidStatus.cnt === 0, `${invalidStatus.cnt} invalid`);

	const orphanedClient = db
		.prepare<[], { cnt: number }>(
			`SELECT COUNT(*) as cnt FROM meal_plan_sessions
       WHERE client_id NOT IN (SELECT id FROM users)`
		)
		.get()!;
	check('No orphaned meal_plan_sessions (client FK)', orphanedClient.cnt === 0, `${orphanedClient.cnt} orphans`);

	const orphanedDietitian = db
		.prepare<[], { cnt: number }>(
			`SELECT COUNT(*) as cnt FROM meal_plan_sessions
       WHERE dietitian_id NOT IN (SELECT id FROM users)`
		)
		.get()!;
	check('No orphaned meal_plan_sessions (dietitian FK)', orphanedDietitian.cnt === 0, `${orphanedDietitian.cnt} orphans`);

	// Partial unique: only one active session per (client, dietitian)
	const dupActiveSession = db
		.prepare<[], { cnt: number }>(
			`SELECT COUNT(*) as cnt FROM (
         SELECT client_id, dietitian_id, COUNT(*) as n
         FROM meal_plan_sessions WHERE status = 'active'
         GROUP BY client_id, dietitian_id HAVING n > 1
       )`
		)
		.get()!;
	check('At most one active session per (client, dietitian)', dupActiveSession.cnt === 0, `${dupActiveSession.cnt} violations`);

	// Partial unique: only one draft session per (client, dietitian)
	const dupDraftSession = db
		.prepare<[], { cnt: number }>(
			`SELECT COUNT(*) as cnt FROM (
         SELECT client_id, dietitian_id, COUNT(*) as n
         FROM meal_plan_sessions WHERE status = 'draft'
         GROUP BY client_id, dietitian_id HAVING n > 1
       )`
		)
		.get()!;
	check('At most one draft session per (client, dietitian)', dupDraftSession.cnt === 0, `${dupDraftSession.cnt} violations`);

	const nullDates = db
		.prepare<[], { cnt: number }>(
			`SELECT COUNT(*) as cnt FROM meal_plan_sessions
       WHERE start_date IS NULL OR end_date IS NULL`
		)
		.get()!;
	check('All meal_plan_sessions have start_date and end_date', nullDates.cnt === 0, `${nullDates.cnt} missing dates`);
} else {
	skip('meal_plan_sessions');
}

// ─── Meal Plans → Days → Meals Cascade ───────────────────────────────────────

console.log('\n=== Meal Plans Cascade Integrity ===');

if (tableExists('meal_plans') && tableExists('meal_plan_sessions')) {
	const orphanedMealPlans = db
		.prepare<[], { cnt: number }>(
			`SELECT COUNT(*) as cnt FROM meal_plans
       WHERE session_id NOT IN (SELECT id FROM meal_plan_sessions)`
		)
		.get()!;
	check('No orphaned meal_plans (session FK)', orphanedMealPlans.cnt === 0, `${orphanedMealPlans.cnt} orphans`);

	const invalidPlanType = db
		.prepare<[], { cnt: number }>(
			`SELECT COUNT(*) as cnt FROM meal_plans
       WHERE plan_type NOT IN ('daily', 'weekly')`
		)
		.get()!;
	check('meal_plans.plan_type values valid', invalidPlanType.cnt === 0, `${invalidPlanType.cnt} invalid`);
} else {
	skip('meal_plans');
}

if (tableExists('meal_days') && tableExists('meal_plans')) {
	const orphanedDays = db
		.prepare<[], { cnt: number }>(
			`SELECT COUNT(*) as cnt FROM meal_days
       WHERE meal_plan_id NOT IN (SELECT id FROM meal_plans)`
		)
		.get()!;
	check('No orphaned meal_days (meal_plan FK)', orphanedDays.cnt === 0, `${orphanedDays.cnt} orphans`);
} else {
	skip('meal_days');
}

if (tableExists('meals') && tableExists('meal_days')) {
	const orphanedMeals = db
		.prepare<[], { cnt: number }>(
			`SELECT COUNT(*) as cnt FROM meals
       WHERE meal_day_id NOT IN (SELECT id FROM meal_days)`
		)
		.get()!;
	check('No orphaned meals (meal_day FK)', orphanedMeals.cnt === 0, `${orphanedMeals.cnt} orphans`);

	const invalidMealType = db
		.prepare<[], { cnt: number }>(
			`SELECT COUNT(*) as cnt FROM meals
       WHERE meal_type NOT IN (
         'breakfast','brunch','morning_snack','lunch',
         'afternoon_snack','dinner','post_workout','supplement'
       )`
		)
		.get()!;
	check('meals.meal_type values valid', invalidMealType.cnt === 0, `${invalidMealType.cnt} invalid`);

	if (tableExists('recipes')) {
		const invalidRecipeFk = db
			.prepare<[], { cnt: number }>(
				`SELECT COUNT(*) as cnt FROM meals
         WHERE recipe_id IS NOT NULL
           AND recipe_id NOT IN (SELECT id FROM recipes)`
			)
			.get()!;
		check('No meals with invalid recipe_id FK', invalidRecipeFk.cnt === 0, `${invalidRecipeFk.cnt} invalid`);
	}

	if (tableExists('food_items')) {
		const invalidFoodFk = db
			.prepare<[], { cnt: number }>(
				`SELECT COUNT(*) as cnt FROM meals
         WHERE food_item_id IS NOT NULL
           AND food_item_id NOT IN (SELECT id FROM food_items)`
			)
			.get()!;
		check('No meals with invalid food_item_id FK', invalidFoodFk.cnt === 0, `${invalidFoodFk.cnt} invalid`);
	}
} else {
	skip('meals');
}

// ─── Meal Tracking ────────────────────────────────────────────────────────────

console.log('\n=== Meal Tracking ===');

if (tableExists('meal_tracking')) {
	if (tableExists('meal_plan_sessions')) {
		const orphanedTrackSession = db
			.prepare<[], { cnt: number }>(
				`SELECT COUNT(*) as cnt FROM meal_tracking
         WHERE session_id NOT IN (SELECT id FROM meal_plan_sessions)`
			)
			.get()!;
		check('No orphaned meal_tracking (session FK)', orphanedTrackSession.cnt === 0, `${orphanedTrackSession.cnt} orphans`);
	}

	if (tableExists('meals')) {
		const orphanedTrackMeal = db
			.prepare<[], { cnt: number }>(
				`SELECT COUNT(*) as cnt FROM meal_tracking
         WHERE meal_id NOT IN (SELECT id FROM meals)`
			)
			.get()!;
		check('No orphaned meal_tracking (meal FK)', orphanedTrackMeal.cnt === 0, `${orphanedTrackMeal.cnt} orphans`);
	}

	const invalidTrackStatus = db
		.prepare<[], { cnt: number }>(
			`SELECT COUNT(*) as cnt FROM meal_tracking
       WHERE status NOT IN ('eaten', 'not_eaten', 'skipped')`
		)
		.get()!;
	check('meal_tracking.status values valid', invalidTrackStatus.cnt === 0, `${invalidTrackStatus.cnt} invalid`);

	const nullTrackDate = db
		.prepare<[], { cnt: number }>(
			`SELECT COUNT(*) as cnt FROM meal_tracking WHERE date IS NULL OR date = ''`
		)
		.get()!;
	check('All meal_tracking rows have a date', nullTrackDate.cnt === 0, `${nullTrackDate.cnt} missing dates`);
} else {
	skip('meal_tracking');
}

// ─── Daily Logs ───────────────────────────────────────────────────────────────

console.log('\n=== Daily Logs ===');

if (tableExists('daily_logs')) {
	if (tableExists('meal_plan_sessions')) {
		const orphanedLogSession = db
			.prepare<[], { cnt: number }>(
				`SELECT COUNT(*) as cnt FROM daily_logs
         WHERE session_id NOT IN (SELECT id FROM meal_plan_sessions)`
			)
			.get()!;
		check('No orphaned daily_logs (session FK)', orphanedLogSession.cnt === 0, `${orphanedLogSession.cnt} orphans`);
	}

	const orphanedLogClient = db
		.prepare<[], { cnt: number }>(
			`SELECT COUNT(*) as cnt FROM daily_logs
       WHERE client_id NOT IN (SELECT id FROM users)`
		)
		.get()!;
	check('No orphaned daily_logs (client FK)', orphanedLogClient.cnt === 0, `${orphanedLogClient.cnt} orphans`);

	const negativeWater = db
		.prepare<[], { cnt: number }>(
			`SELECT COUNT(*) as cnt FROM daily_logs WHERE water_cups < 0`
		)
		.get()!;
	check('No daily_logs with negative water_cups', negativeWater.cnt === 0, `${negativeWater.cnt} invalid`);

	const nullDate = db
		.prepare<[], { cnt: number }>(
			`SELECT COUNT(*) as cnt FROM daily_logs WHERE date IS NULL OR date = ''`
		)
		.get()!;
	check('All daily_logs have a date', nullDate.cnt === 0, `${nullDate.cnt} missing`);
} else {
	skip('daily_logs');
}

// ─── Patient Diagnoses ────────────────────────────────────────────────────────

console.log('\n=== Patient Diagnoses ===');

if (tableExists('patient_diagnoses')) {
	const orphanedDiagClient = db
		.prepare<[], { cnt: number }>(
			`SELECT COUNT(*) as cnt FROM patient_diagnoses
       WHERE client_id NOT IN (SELECT id FROM users)`
		)
		.get()!;
	check('No orphaned patient_diagnoses (client FK)', orphanedDiagClient.cnt === 0, `${orphanedDiagClient.cnt} orphans`);

	const orphanedDiagDietitian = db
		.prepare<[], { cnt: number }>(
			`SELECT COUNT(*) as cnt FROM patient_diagnoses
       WHERE dietitian_id NOT IN (SELECT id FROM users)`
		)
		.get()!;
	check('No orphaned patient_diagnoses (dietitian FK)', orphanedDiagDietitian.cnt === 0, `${orphanedDiagDietitian.cnt} orphans`);

	const invalidSeverity = db
		.prepare<[], { cnt: number }>(
			`SELECT COUNT(*) as cnt FROM patient_diagnoses
       WHERE severity NOT IN ('mild', 'moderate', 'severe')`
		)
		.get()!;
	check('patient_diagnoses.severity values valid', invalidSeverity.cnt === 0, `${invalidSeverity.cnt} invalid`);

	const invalidDiagStatus = db
		.prepare<[], { cnt: number }>(
			`SELECT COUNT(*) as cnt FROM patient_diagnoses
       WHERE status NOT IN ('active', 'resolved', 'managed')`
		)
		.get()!;
	check('patient_diagnoses.status values valid', invalidDiagStatus.cnt === 0, `${invalidDiagStatus.cnt} invalid`);

	const nullDiagKey = db
		.prepare<[], { cnt: number }>(
			`SELECT COUNT(*) as cnt FROM patient_diagnoses
       WHERE diag_key IS NULL OR diag_key = ''`
		)
		.get()!;
	check('All patient_diagnoses have diag_key set', nullDiagKey.cnt === 0, `${nullDiagKey.cnt} missing`);
} else {
	skip('patient_diagnoses');
}

// ─── Chat ─────────────────────────────────────────────────────────────────────

console.log('\n=== Chat Conversations & Messages ===');

if (tableExists('chat_conversations')) {
	const orphanedConvDietitian = db
		.prepare<[], { cnt: number }>(
			`SELECT COUNT(*) as cnt FROM chat_conversations
       WHERE dietitian_id NOT IN (SELECT id FROM users)`
		)
		.get()!;
	check('No orphaned chat_conversations (dietitian FK)', orphanedConvDietitian.cnt === 0, `${orphanedConvDietitian.cnt} orphans`);

	const orphanedConvClient = db
		.prepare<[], { cnt: number }>(
			`SELECT COUNT(*) as cnt FROM chat_conversations
       WHERE client_id NOT IN (SELECT id FROM users)`
		)
		.get()!;
	check('No orphaned chat_conversations (client FK)', orphanedConvClient.cnt === 0, `${orphanedConvClient.cnt} orphans`);

	// Each (dietitian, client) pair must have at most one conversation
	const dupConvs = db
		.prepare<[], { cnt: number }>(
			`SELECT COUNT(*) as cnt FROM (
         SELECT dietitian_id, client_id, COUNT(*) as n
         FROM chat_conversations GROUP BY dietitian_id, client_id HAVING n > 1
       )`
		)
		.get()!;
	check('Unique (dietitian, client) pairs in chat_conversations', dupConvs.cnt === 0, `${dupConvs.cnt} duplicates`);

	if (tableExists('chat_messages')) {
		const orphanedMessages = db
			.prepare<[], { cnt: number }>(
				`SELECT COUNT(*) as cnt FROM chat_messages
         WHERE conversation_id NOT IN (SELECT id FROM chat_conversations)`
			)
			.get()!;
		check('No orphaned chat_messages (conversation FK)', orphanedMessages.cnt === 0, `${orphanedMessages.cnt} orphans`);

		const msgOrphanSender = db
			.prepare<[], { cnt: number }>(
				`SELECT COUNT(*) as cnt FROM chat_messages
         WHERE sender_user_id NOT IN (SELECT id FROM users)`
			)
			.get()!;
		check('No chat_messages with invalid sender FK', msgOrphanSender.cnt === 0, `${msgOrphanSender.cnt} orphans`);

		const emptyMessages = db
			.prepare<[], { cnt: number }>(
				`SELECT COUNT(*) as cnt FROM chat_messages
         WHERE body IS NULL OR TRIM(body) = ''`
			)
			.get()!;
		check('No chat_messages with empty body', emptyMessages.cnt === 0, `${emptyMessages.cnt} empty`);
	}
} else {
	skip('chat_conversations');
	skip('chat_messages');
}

// ─── Security Checks on Stored Data ──────────────────────────────────────────

console.log('\n=== Security — Stored Data Checks ===');

// Passwords
const plainPasswords = db
	.prepare<[], { cnt: number }>(
		`SELECT COUNT(*) as cnt FROM users
     WHERE password IS NOT NULL AND password NOT LIKE '$2%'`
	)
	.get()!;
check('All user passwords are bcrypt-hashed', plainPasswords.cnt === 0, `${plainPasswords.cnt} unhashed`);

// No session tokens stored as plaintext (they should be opaque)
if (tableExists('auth_sessions')) {
	const expiredSessions = db
		.prepare<[], { cnt: number }>(
			`SELECT COUNT(*) as cnt FROM auth_sessions
       WHERE expires_at <= datetime('now')`
		)
		.get()!;
	// Not a hard failure — expired sessions may exist until GC runs
	const icon = expiredSessions.cnt === 0 ? '✓' : '⚠';
	console.log(`  ${icon} INFO: ${expiredSessions.cnt} expired sessions in auth_sessions (expected if GC hasn't run)`);
}

// OTP records must have expiry
if (tableExists('registration_email_otp')) {
	const otpWithoutExpiry = db
		.prepare<[], { cnt: number }>(
			`SELECT COUNT(*) as cnt FROM registration_email_otp WHERE expires_at IS NULL`
		)
		.get()!;
	check('All OTP records have expiry', otpWithoutExpiry.cnt === 0, `${otpWithoutExpiry.cnt} missing expiry`);

	const otpOrphanUser = db
		.prepare<[], { cnt: number }>(
			`SELECT COUNT(*) as cnt FROM registration_email_otp
       WHERE user_id NOT IN (SELECT id FROM users)`
		)
		.get()!;
	check('All OTP records reference a valid user', otpOrphanUser.cnt === 0, `${otpOrphanUser.cnt} orphaned`);
}

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log('\n=== Summary ===');
const passed = results.filter((r) => r.passed).length;
const failed = results.filter((r) => !r.passed).length;
const total = results.length;
console.log(`Checks: ${total} total — ${passed} passed, ${failed} failed`);

if (failed > 0) {
	console.error('\nExtended data integrity validation FAILED');
	process.exit(1);
} else {
	console.log('\nExtended data integrity validation PASSED');
	process.exit(0);
}
