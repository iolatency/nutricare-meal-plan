DROP INDEX IF EXISTS food_items_external_id_idx;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS food_items_external_owner_idx
	ON food_items(external_id, created_by);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS mps_one_active_per_client_dietitian_idx
	ON meal_plan_sessions(client_id, dietitian_id) WHERE status = 'active';
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS mps_one_draft_per_client_dietitian_idx
	ON meal_plan_sessions(client_id, dietitian_id) WHERE status = 'draft';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS patient_diagnoses (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	client_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	dietitian_id INTEGER NOT NULL REFERENCES users(id),
	diag_key TEXT NOT NULL,
	name TEXT NOT NULL,
	code TEXT,
	severity TEXT NOT NULL CHECK (severity IN ('mild','moderate','severe')),
	diagnosed_date TEXT NOT NULL,
	status TEXT NOT NULL CHECK (status IN ('active','resolved','managed')),
	notes TEXT NOT NULL,
	created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS pd_client_idx ON patient_diagnoses(client_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS pd_dietitian_idx ON patient_diagnoses(dietitian_id);
