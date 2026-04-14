import path from 'node:path';
import Database from 'better-sqlite3';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
	console.error('DATABASE_URL is not set. Example: DATABASE_URL=file:local.db npm run db:verify-seed');
	process.exit(1);
}

function sqlitePathFromUrl(url: string): string {
	return url.startsWith('file:') ? url.slice('file:'.length) : url;
}

const sqlitePath = path.resolve(process.cwd(), sqlitePathFromUrl(DATABASE_URL));
const db = new Database(sqlitePath, { readonly: true });

type CountRow = { count: number };
const count = (table: string) =>
	Number((db.prepare(`SELECT COUNT(*) as count FROM "${table}"`).get() as CountRow | undefined)?.count ?? 0);

const failures: string[] = [];
const notes: string[] = [];

try {
	const usersCount = count('users');
	const orgCount = count('organizations');
	const membershipsCount = count('memberships');
	const foodCount = count('food_items');
	const supplementCount = count('supplements');

	if (usersCount < 1) failures.push('No users were seeded.');
	if (orgCount < 1) failures.push('No organizations were seeded.');
	if (membershipsCount < 1) failures.push('No memberships were seeded.');
	if (foodCount < 1) failures.push('No food_items were seeded.');
	if (supplementCount < 1) failures.push('No supplements were seeded.');

	const badSources = db
		.prepare(
			`SELECT DISTINCT source FROM food_items WHERE source IS NULL OR source NOT IN ('internal', 'edamam')`
		)
		.all() as Array<{ source: string | null }>;
	if (badSources.length > 0) {
		failures.push(
			`Found invalid food source values: ${badSources.map((r) => String(r.source ?? 'NULL')).join(', ')}`
		);
	}

	const bySource = db
		.prepare(`SELECT source, COUNT(*) as count FROM food_items GROUP BY source ORDER BY source`)
		.all() as Array<{ source: string; count: number }>;
	for (const row of bySource) notes.push(`food_items.${row.source}: ${row.count}`);

	const externalWithOwner = db
		.prepare(`SELECT COUNT(*) as count FROM food_items WHERE source = 'edamam' AND created_by IS NOT NULL`)
		.get() as CountRow;
	notes.push(`external(edamam) rows owned by users: ${externalWithOwner.count}`);

	try {
		const extCat = count('external_food_catalog');
		const userImp = count('user_food_imports');
		notes.push(`external_food_catalog: ${extCat}`);
		notes.push(`user_food_imports: ${userImp}`);
	} catch {
		notes.push('external_food_catalog / user_food_imports: tables not present (run migrations)');
	}

	const categoriesCount = count('food_categories');
	if (categoriesCount > 0) {
		notes.push(`food_categories has ${categoriesCount} rows (allowed but not seeded by default).`);
	}

	const fkViolations = db.prepare(`PRAGMA foreign_key_check`).all() as Array<Record<string, unknown>>;
	if (fkViolations.length > 0) failures.push(`Foreign key violations detected: ${fkViolations.length}`);

	const diagCount = count('patient_diagnoses');
	const sessionCount = count('meal_plan_sessions');
	const recipeCount = count('recipes');
	notes.push(`patient_diagnoses: ${diagCount}`);
	notes.push(`meal_plan_sessions: ${sessionCount}`);
	notes.push(`recipes: ${recipeCount}`);
} finally {
	db.close();
}

console.log('Seed verification summary');
for (const line of notes) console.log(`  - ${line}`);

if (failures.length > 0) {
	console.error('\nSeed verification FAILED');
	for (const msg of failures) console.error(`  - ${msg}`);
	process.exit(1);
}

console.log('\nSeed verification PASSED');
