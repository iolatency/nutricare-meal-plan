-- Schema optimization: drop unused columns, add ON DELETE constraints, add indexes.
-- SQLite requires table recreation for column drops and FK constraint changes.

PRAGMA foreign_keys=OFF;--> statement-breakpoint

-- ── users: drop remember_token, two_factor_secret, two_factor_recovery_codes, two_factor_confirmed_at ──

CREATE TABLE `__new_users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`username` text,
	`phone` text,
	`email_verified_at` text,
	`password` text NOT NULL,
	`created_at` text,
	`updated_at` text,
	`can_access_patient_app` integer DEFAULT true NOT NULL,
	`last_seen_at` text
);--> statement-breakpoint
INSERT INTO `__new_users` SELECT `id`, `name`, `email`, `username`, `phone`, `email_verified_at`, `password`, `created_at`, `updated_at`, `can_access_patient_app`, `last_seen_at` FROM `users`;--> statement-breakpoint
DROP TABLE `users`;--> statement-breakpoint
ALTER TABLE `__new_users` RENAME TO `users`;--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_phone_unique` ON `users` (`phone`);--> statement-breakpoint

-- ── memberships: add ON DELETE CASCADE on organization_id ──

CREATE TABLE `__new_memberships` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`roles` text NOT NULL,
	`created_at` text,
	`updated_at` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
INSERT INTO `__new_memberships` SELECT * FROM `memberships`;--> statement-breakpoint
DROP TABLE `memberships`;--> statement-breakpoint
ALTER TABLE `__new_memberships` RENAME TO `memberships`;--> statement-breakpoint
CREATE UNIQUE INDEX `memberships_org_user_idx` ON `memberships` (`organization_id`, `user_id`);--> statement-breakpoint
CREATE INDEX `memberships_user_idx` ON `memberships` (`user_id`);--> statement-breakpoint

-- ── food_items: add ON DELETE SET NULL on category_id and created_by ──

CREATE TABLE `__new_food_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`name_ar` text,
	`calories` real DEFAULT 0 NOT NULL,
	`protein` real DEFAULT 0 NOT NULL,
	`carbs` real DEFAULT 0 NOT NULL,
	`fat` real DEFAULT 0 NOT NULL,
	`fiber` real DEFAULT 0 NOT NULL,
	`unit` text DEFAULT 'g' NOT NULL,
	`portion_size` real DEFAULT 100 NOT NULL,
	`category_id` integer,
	`created_by` integer,
	`image_url` text,
	`full_nutrients` text,
	`external_parser_food_json` text,
	`external_parser_measures_json` text,
	`external_nutrients_json` text,
	`source` text DEFAULT 'internal' NOT NULL,
	`external_id` text,
	FOREIGN KEY (`category_id`) REFERENCES `food_categories`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);--> statement-breakpoint
INSERT INTO `__new_food_items` SELECT * FROM `food_items`;--> statement-breakpoint
DROP TABLE `food_items`;--> statement-breakpoint
ALTER TABLE `__new_food_items` RENAME TO `food_items`;--> statement-breakpoint
CREATE INDEX `food_items_category_idx` ON `food_items` (`category_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `food_items_external_owner_idx` ON `food_items` (`external_id`, `created_by`);--> statement-breakpoint

-- ── recipes: drop is_favorite, add ON DELETE SET NULL on category_id ──

CREATE TABLE `__new_recipes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`name_ar` text,
	`owner_id` integer NOT NULL,
	`steps` text,
	`portions` integer DEFAULT 1,
	`nutrients` text,
	`category_id` integer,
	`source` text DEFAULT 'internal' NOT NULL,
	`image_url` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `recipe_categories`(`id`) ON UPDATE no action ON DELETE set null
);--> statement-breakpoint
INSERT INTO `__new_recipes` SELECT `id`, `name`, `name_ar`, `owner_id`, `steps`, `portions`, `nutrients`, `category_id`, `source`, `image_url`, `created_at` FROM `recipes`;--> statement-breakpoint
DROP TABLE `recipes`;--> statement-breakpoint
ALTER TABLE `__new_recipes` RENAME TO `recipes`;--> statement-breakpoint

-- ── meal_plan_sessions: add ON DELETE RESTRICT on dietitian_id ──

CREATE TABLE `__new_meal_plan_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_id` integer NOT NULL,
	`dietitian_id` integer NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`dietitian_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);--> statement-breakpoint
INSERT INTO `__new_meal_plan_sessions` SELECT * FROM `meal_plan_sessions`;--> statement-breakpoint
DROP TABLE `meal_plan_sessions`;--> statement-breakpoint
ALTER TABLE `__new_meal_plan_sessions` RENAME TO `meal_plan_sessions`;--> statement-breakpoint
CREATE INDEX `mps_client_idx` ON `meal_plan_sessions` (`client_id`);--> statement-breakpoint
CREATE INDEX `mps_dietitian_idx` ON `meal_plan_sessions` (`dietitian_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `mps_one_active_per_client_dietitian_idx` ON `meal_plan_sessions` (`client_id`, `dietitian_id`) WHERE `status` = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX `mps_one_draft_per_client_dietitian_idx` ON `meal_plan_sessions` (`client_id`, `dietitian_id`) WHERE `status` = 'draft';--> statement-breakpoint

-- ── meal_plans: drop note column, add index on session_id ──

CREATE TABLE `__new_meal_plans` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` integer NOT NULL,
	`plan_type` text DEFAULT 'weekly' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`recommendation` text,
	`builder_config` text,
	FOREIGN KEY (`session_id`) REFERENCES `meal_plan_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
INSERT INTO `__new_meal_plans` SELECT `id`, `session_id`, `plan_type`, `version`, `recommendation`, `builder_config` FROM `meal_plans`;--> statement-breakpoint
DROP TABLE `meal_plans`;--> statement-breakpoint
ALTER TABLE `__new_meal_plans` RENAME TO `meal_plans`;--> statement-breakpoint
CREATE INDEX `mp_session_idx` ON `meal_plans` (`session_id`);--> statement-breakpoint

-- ── meal_days: add index on meal_plan_id (no column/FK changes) ──

CREATE INDEX `md_plan_idx` ON `meal_days` (`meal_plan_id`);--> statement-breakpoint

-- ── meals: add ON DELETE SET NULL on recipe_id, supplement_id, food_item_id ──

CREATE TABLE `__new_meals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`meal_day_id` integer NOT NULL,
	`meal_type` text DEFAULT 'breakfast' NOT NULL,
	`recipe_id` integer,
	`supplement_id` integer,
	`food_item_id` integer,
	`ai_meal_json` text,
	`preparation` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`meal_day_id`) REFERENCES `meal_days`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`supplement_id`) REFERENCES `supplements`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`food_item_id`) REFERENCES `food_items`(`id`) ON UPDATE no action ON DELETE set null
);--> statement-breakpoint
INSERT INTO `__new_meals` SELECT * FROM `meals`;--> statement-breakpoint
DROP TABLE `meals`;--> statement-breakpoint
ALTER TABLE `__new_meals` RENAME TO `meals`;--> statement-breakpoint
CREATE INDEX `meals_day_idx` ON `meals` (`meal_day_id`);--> statement-breakpoint

-- ── patient_diagnoses: add ON DELETE RESTRICT on dietitian_id ──

CREATE TABLE `__new_patient_diagnoses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_id` integer NOT NULL,
	`dietitian_id` integer NOT NULL,
	`diag_key` text NOT NULL,
	`name` text NOT NULL,
	`code` text,
	`severity` text NOT NULL,
	`diagnosed_date` text NOT NULL,
	`status` text NOT NULL,
	`notes` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`dietitian_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);--> statement-breakpoint
INSERT INTO `__new_patient_diagnoses` SELECT * FROM `patient_diagnoses`;--> statement-breakpoint
DROP TABLE `patient_diagnoses`;--> statement-breakpoint
ALTER TABLE `__new_patient_diagnoses` RENAME TO `patient_diagnoses`;--> statement-breakpoint
CREATE INDEX `pd_client_idx` ON `patient_diagnoses` (`client_id`);--> statement-breakpoint
CREATE INDEX `pd_dietitian_idx` ON `patient_diagnoses` (`dietitian_id`);--> statement-breakpoint

PRAGMA foreign_key_check;--> statement-breakpoint
PRAGMA foreign_keys=ON;
