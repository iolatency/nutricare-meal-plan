-- Remove 4 dead columns from users that were never used in this codebase.
-- All 4 are legacy Laravel-style fields: 0/11 rows populated, zero code references
-- outside the schema definition file.

ALTER TABLE users DROP COLUMN remember_token;
--> statement-breakpoint
ALTER TABLE users DROP COLUMN two_factor_secret;
--> statement-breakpoint
ALTER TABLE users DROP COLUMN two_factor_recovery_codes;
--> statement-breakpoint
ALTER TABLE users DROP COLUMN two_factor_confirmed_at;
