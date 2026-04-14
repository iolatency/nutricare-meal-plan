CREATE TABLE IF NOT EXISTS `chat_conversations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`dietitian_id` integer NOT NULL,
	`client_id` integer NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`dietitian_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`client_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `chat_conv_dietitian_client_idx` ON `chat_conversations` (`dietitian_id`,`client_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `chat_conv_dietitian_updated_idx` ON `chat_conversations` (`dietitian_id`,`updated_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `chat_conv_client_updated_idx` ON `chat_conversations` (`client_id`,`updated_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `chat_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`conversation_id` integer NOT NULL,
	`sender_user_id` integer NOT NULL,
	`body` text NOT NULL,
	`read_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `chat_conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sender_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `chat_msg_conv_created_idx` ON `chat_messages` (`conversation_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `chat_msg_conv_read_idx` ON `chat_messages` (`conversation_id`,`read_at`);
