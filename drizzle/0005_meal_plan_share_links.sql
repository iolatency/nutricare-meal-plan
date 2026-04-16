CREATE TABLE `meal_plan_share_links` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` integer NOT NULL,
	`created_by` integer NOT NULL,
	`scope` text NOT NULL,
	`anchor_date` text NOT NULL,
	`token` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`revoked_at` text,
	FOREIGN KEY (`session_id`) REFERENCES `meal_plan_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE UNIQUE INDEX `meal_plan_share_links_token_uidx` ON `meal_plan_share_links` (`token`);--> statement-breakpoint
CREATE INDEX `meal_plan_share_links_session_idx` ON `meal_plan_share_links` (`session_id`);--> statement-breakpoint
CREATE INDEX `meal_plan_share_links_expiry_idx` ON `meal_plan_share_links` (`expires_at`);
