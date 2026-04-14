CREATE TABLE IF NOT EXISTS external_food_catalog (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	provider TEXT NOT NULL DEFAULT 'edamam',
	provider_food_id TEXT NOT NULL,
	name TEXT NOT NULL,
	name_ar TEXT,
	calories REAL NOT NULL DEFAULT 0,
	protein REAL NOT NULL DEFAULT 0,
	carbs REAL NOT NULL DEFAULT 0,
	fat REAL NOT NULL DEFAULT 0,
	fiber REAL NOT NULL DEFAULT 0,
	unit TEXT NOT NULL DEFAULT 'g',
	portion_size REAL NOT NULL DEFAULT 100,
	image_url TEXT,
	full_nutrients TEXT,
	external_parser_food_json TEXT,
	external_parser_measures_json TEXT,
	external_nutrients_json TEXT
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ext_food_catalog_provider_food_idx
	ON external_food_catalog(provider, provider_food_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS user_food_imports (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	external_food_id INTEGER NOT NULL REFERENCES external_food_catalog(id) ON DELETE CASCADE,
	food_item_id INTEGER REFERENCES food_items(id) ON DELETE SET NULL,
	imported_at TEXT NOT NULL DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS user_food_imports_user_catalog_idx
	ON user_food_imports(user_id, external_food_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS user_food_imports_user_idx ON user_food_imports(user_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS user_food_imports_food_item_idx ON user_food_imports(food_item_id);
--> statement-breakpoint
INSERT INTO external_food_catalog (
	provider,
	provider_food_id,
	name,
	name_ar,
	calories,
	protein,
	carbs,
	fat,
	fiber,
	unit,
	portion_size,
	image_url,
	full_nutrients,
	external_parser_food_json,
	external_parser_measures_json,
	external_nutrients_json
)
SELECT
	'edamam',
	fi.external_id,
	fi.name,
	fi.name_ar,
	fi.calories,
	fi.protein,
	fi.carbs,
	fi.fat,
	fi.fiber,
	fi.unit,
	fi.portion_size,
	fi.image_url,
	fi.full_nutrients,
	fi.external_parser_food_json,
	fi.external_parser_measures_json,
	fi.external_nutrients_json
FROM food_items fi
WHERE fi.source = 'edamam'
	AND fi.external_id IS NOT NULL
	AND fi.id = (
		SELECT MIN(fi2.id)
		FROM food_items fi2
		WHERE fi2.source = 'edamam'
			AND fi2.external_id = fi.external_id
	)
	AND NOT EXISTS (
		SELECT 1 FROM external_food_catalog e
		WHERE e.provider = 'edamam'
			AND e.provider_food_id = fi.external_id
	);
--> statement-breakpoint
INSERT OR IGNORE INTO user_food_imports (user_id, external_food_id, food_item_id)
SELECT
	fi.created_by,
	efc.id,
	fi.id
FROM food_items fi
JOIN external_food_catalog efc
	ON efc.provider = 'edamam'
	AND efc.provider_food_id = fi.external_id
WHERE fi.source = 'edamam'
	AND fi.external_id IS NOT NULL
	AND fi.created_by IS NOT NULL;
