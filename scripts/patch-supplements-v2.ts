/**
 * Patch script v2: back-fills formulaCategory, magnesium, osmolality,
 * osmolarity, and waterMl for all existing supplement rows, and inserts
 * any supplements that are missing from the DB.
 *
 * Run with: npx tsx scripts/patch-supplements-v2.ts
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath =
	process.env.DATABASE_URL?.replace('file:', '') ?? path.join(__dirname, '../local.db');
const sqlite = new Database(dbPath);

// ─── Patch data ──────────────────────────────────────────────────────────────
type Patch = {
	name: string;
	formulaCategory: string;
	magnesium?: number | null;
	osmolality?: number | null;
	osmolarity?: number | null;
	waterMl?: number | null;
};

const PATCHES: Patch[] = [
	// ── Standard ──────────────────────────────────────────────────────────────
	{
		name: 'Ensure 1kcal/mL (Abbott) Regular',
		formulaCategory: 'standard',
		magnesium: 40,
		osmolality: null,
		osmolarity: null,
		waterMl: 170.2
	},
	{
		name: 'Surenutri 1kcal/mL (Almraie)',
		formulaCategory: 'standard',
		magnesium: 31.6,
		osmolality: 360,
		osmolarity: null,
		waterMl: null
	},
	{
		name: 'Resource Optimum 1.08kcal/mL (Nestle)',
		formulaCategory: 'standard',
		magnesium: 43,
		osmolality: 474,
		osmolarity: null,
		waterMl: null
	},
	{
		name: 'EnergyZip 1kcal/mL',
		formulaCategory: 'standard',
		magnesium: 43.52,
		osmolality: 488,
		osmolarity: 406,
		waterMl: null
	},

	// ── Fiber ─────────────────────────────────────────────────────────────────
	{
		name: 'Jevity 1.08kcal/mL (Abbott)',
		formulaCategory: 'fiber',
		magnesium: 69,
		osmolality: null,
		osmolarity: null,
		waterMl: 198
	},
	{
		name: 'Surenutri Oral High Calorie with Fiber 1.5kcal/mL',
		formulaCategory: 'fiber',
		magnesium: 38.4,
		osmolality: 785,
		osmolarity: null,
		waterMl: null
	},
	{
		name: 'Fresubin with Fiber 2kcal/mL Neutral (Fresenius Kabi)',
		formulaCategory: 'fiber',
		magnesium: 32,
		osmolality: 750,
		osmolarity: 505,
		waterMl: 134
	},
	{
		name: 'Fresubin with Fiber Chocolate 2kcal/mL (Fresenius Kabi)',
		formulaCategory: 'fiber',
		magnesium: 32,
		osmolality: 900,
		osmolarity: 615,
		waterMl: 140
	},
	{
		name: 'Fortisip Multifiber Vanilla/Strawberry 1.5kcal/mL (Nutricia)',
		formulaCategory: 'fiber',
		magnesium: 48,
		osmolality: 600,
		osmolarity: null,
		waterMl: 152
	},
	{
		name: 'Fortisip Multifiber Chocolate 1.5kcal/mL (Nutricia)',
		formulaCategory: 'fiber',
		magnesium: 48,
		osmolality: 620,
		osmolarity: null,
		waterMl: 152
	},
	{
		name: 'Fibersource 1.2kcal/mL NH (Nestle)',
		formulaCategory: 'fiber',
		magnesium: 85,
		osmolality: 536,
		osmolarity: null,
		waterMl: 202
	},

	// ── Clear ONS ─────────────────────────────────────────────────────────────
	{
		name: 'Resource Beverage Orange 1.06kcal/mL (Nestle)',
		formulaCategory: 'clear_ons',
		magnesium: null,
		osmolality: null,
		osmolarity: 615,
		waterMl: 196
	},
	{
		name: 'Resource Beverage Peach 1.06kcal/mL (Nestle)',
		formulaCategory: 'clear_ons',
		magnesium: null,
		osmolality: null,
		osmolarity: 752,
		waterMl: 196
	},
	{
		name: 'Resource Beverage Wildberry 1.06kcal/mL (Nestle)',
		formulaCategory: 'clear_ons',
		magnesium: null,
		osmolality: null,
		osmolarity: 758,
		waterMl: 196
	},
	{
		name: 'Fortijuice Strawberry 1.5kcal/mL (Nutricia)',
		formulaCategory: 'clear_ons',
		magnesium: 4,
		osmolality: 960,
		osmolarity: 750,
		waterMl: 152
	},
	{
		name: 'Fortijuice Apple 1.5kcal/mL (Nutricia)',
		formulaCategory: 'clear_ons',
		magnesium: 4,
		osmolality: 960,
		osmolarity: 750,
		waterMl: 152
	},
	{
		name: 'Fortijuice Orange 1.5kcal/mL (Nutricia)',
		formulaCategory: 'clear_ons',
		magnesium: 3.28,
		osmolality: 960,
		osmolarity: 750,
		waterMl: 152
	},

	// ── Pulmonary ─────────────────────────────────────────────────────────────
	{
		name: 'Nutren Pulmonary Vanilla 1.5kcal/mL (Nestle)',
		formulaCategory: 'pulmonary',
		magnesium: 120,
		osmolality: 450,
		osmolarity: null,
		waterMl: 195
	},
	{
		name: 'Pulmocare 1.5kcal/mL (Abbott)',
		formulaCategory: 'pulmonary',
		magnesium: 100,
		osmolality: null,
		osmolarity: null,
		waterMl: 186
	},
	{
		name: 'Oxepa 1.5kcal/mL (Abbott)',
		formulaCategory: 'pulmonary',
		magnesium: 160,
		osmolality: 490,
		osmolarity: 384,
		waterMl: 393
	},

	// ── Surgery ───────────────────────────────────────────────────────────────
	{
		name: 'Impact Advance Recovery 1.12kcal/mL (Nestle)',
		formulaCategory: 'surgery',
		magnesium: 105,
		osmolality: 704,
		osmolarity: null,
		waterMl: 203
	},
	{
		name: 'Impact Enteral 1.02kcal/mL (Nestle, closed system)',
		formulaCategory: 'surgery',
		magnesium: 115,
		osmolality: null,
		osmolarity: null,
		waterMl: 425
	},
	{
		name: 'Cubitan 1.24kcal/mL (Nutricia)',
		formulaCategory: 'surgery',
		magnesium: 84,
		osmolality: 625,
		osmolarity: null,
		waterMl: 160
	},
	{
		name: 'Atempro Vanilla 1.51kcal/mL (Sierra)',
		formulaCategory: 'surgery',
		magnesium: 60,
		osmolality: null,
		osmolarity: 366,
		waterMl: null
	},
	{
		name: 'Atempro Tropical 1.51kcal/mL (Sierra)',
		formulaCategory: 'surgery',
		magnesium: 60,
		osmolality: null,
		osmolarity: 398,
		waterMl: null
	},

	// ── High Calorie ──────────────────────────────────────────────────────────
	{
		name: 'Ensure Plus 1.5kcal/mL (Abbott)',
		formulaCategory: 'high_calorie',
		magnesium: 60,
		osmolality: null,
		osmolarity: null,
		waterMl: 154.86
	},
	{
		name: 'Ensure Advance Plus 1.5kcal/mL (Abbott)',
		formulaCategory: 'high_calorie',
		magnesium: 55,
		osmolality: 730,
		osmolarity: 557,
		waterMl: 168
	},
	{
		name: 'Surenutri Oral Supplement High Calorie 1.5kcal/mL',
		formulaCategory: 'high_calorie',
		magnesium: 38.4,
		osmolality: 785,
		osmolarity: null,
		waterMl: null
	},
	{
		name: 'Resource Energy 1.5kcal/mL (Nestle)',
		formulaCategory: 'high_calorie',
		magnesium: 56,
		osmolality: null,
		osmolarity: 488,
		waterMl: 155
	},
	{
		name: 'Resource Support Plus 2kcal/mL (Nestle)',
		formulaCategory: 'high_calorie',
		magnesium: 31,
		osmolality: null,
		osmolarity: 600,
		waterMl: 78.7
	},
	{
		name: 'Resource 2kcal/mL (Nestle)',
		formulaCategory: 'high_calorie',
		magnesium: 40,
		osmolality: null,
		osmolarity: null,
		waterMl: 140.8
	},
	{
		name: 'Forticare 1.63kcal/mL (Nutricia)',
		formulaCategory: 'high_calorie',
		magnesium: 35,
		osmolality: 1000,
		osmolarity: 730,
		waterMl: null
	},
	{
		name: 'Hyperdrink 2kcal/mL (Sierra)',
		formulaCategory: 'high_calorie',
		magnesium: 60,
		osmolality: 440,
		osmolarity: 591,
		waterMl: null
	},
	{
		name: 'Fortisip 1.5kcal/mL (Nutricia)',
		formulaCategory: 'high_calorie',
		magnesium: 46,
		osmolality: 590,
		osmolarity: null,
		waterMl: 156
	},
	{
		name: 'Fortisip Compact 2.4kcal/mL (Nutricia)',
		formulaCategory: 'high_calorie',
		magnesium: 41,
		osmolality: null,
		osmolarity: 790,
		waterMl: 80
	},
	{
		name: 'Fortisip Compact Protein 2.4kcal/mL (Nutricia)',
		formulaCategory: 'high_calorie',
		magnesium: 68.8,
		osmolality: null,
		osmolarity: 900,
		waterMl: 78.8
	},
	{
		name: 'FontActiv Energy 1.5kcal/mL',
		formulaCategory: 'high_calorie',
		magnesium: 39.1,
		osmolality: 896,
		osmolarity: null,
		waterMl: 132
	},
	{
		name: 'FontActiv Complete Protein 1.25kcal/mL',
		formulaCategory: 'high_calorie',
		magnesium: 52,
		osmolality: null,
		osmolarity: 396,
		waterMl: null
	},
	{
		name: 'Peptisens 1.5kcal/mL',
		formulaCategory: 'high_calorie',
		magnesium: 56,
		osmolality: 350,
		osmolarity: 445,
		waterMl: null
	},
	{
		name: 'EnergyZip 1.5kcal/mL',
		formulaCategory: 'high_calorie',
		magnesium: 70,
		osmolality: 826,
		osmolarity: 617,
		waterMl: null
	},

	// ── Diabetic ──────────────────────────────────────────────────────────────
	{
		name: 'Glucerna SR 0.93kcal/mL',
		formulaCategory: 'diabetic',
		magnesium: 36,
		osmolality: 470,
		osmolarity: 399,
		waterMl: 170
	},
	{
		name: 'Glucerna 1kcal/mL',
		formulaCategory: 'diabetic',
		magnesium: 40,
		osmolality: 354,
		osmolarity: 300,
		waterMl: 169.8
	},
	{
		name: 'FortiActive diaBest Shake Vanilla 1kcal/mL',
		formulaCategory: 'diabetic',
		magnesium: 37.3,
		osmolality: 393,
		osmolarity: null,
		waterMl: 156.8
	},
	{
		name: 'Glucerna Advanced 1.6kcal/mL',
		formulaCategory: 'diabetic',
		magnesium: 57,
		osmolality: null,
		osmolarity: 704,
		waterMl: 164.3
	},
	{
		name: 'Supportan Cappuccino 1.5kcal/mL',
		formulaCategory: 'diabetic',
		magnesium: 54,
		osmolality: 575,
		osmolarity: 435,
		waterMl: 152
	},
	{
		name: 'Supportan Chocolate 1.5kcal/mL',
		formulaCategory: 'diabetic',
		magnesium: 34,
		osmolality: 555,
		osmolarity: 425,
		waterMl: 154
	},
	{
		name: 'Diasip 1kcal/mL (Nutricia)',
		formulaCategory: 'diabetic',
		magnesium: 46,
		osmolality: 440,
		osmolarity: 365,
		waterMl: 166
	},
	{
		name: 'Surenutri Diabetic 1kcal/mL (Almarai)',
		formulaCategory: 'diabetic',
		magnesium: 36.6,
		osmolality: null,
		osmolarity: null,
		waterMl: null
	},
	{
		name: 'Resource Diabetic 1kcal/mL (Nestle)',
		formulaCategory: 'diabetic',
		magnesium: 43,
		osmolality: 293,
		osmolarity: 246,
		waterMl: null
	},
	{
		name: 'Advanced Diason 1.03kcal/mL (Nutricia, closed system)',
		formulaCategory: 'diabetic',
		magnesium: 230,
		osmolality: 360,
		osmolarity: 300,
		waterMl: 840
	},
	{
		name: 'Nutrison Advanced Diason Energy HP 1.5kcal/mL (Nutricia, closed system)',
		formulaCategory: 'diabetic',
		magnesium: 370,
		osmolality: 515,
		osmolarity: 395,
		waterMl: 770
	},
	{
		name: 'Diben Vanilla/Praline 1.5kcal/mL (Fresenius Kabi)',
		formulaCategory: 'diabetic',
		magnesium: 30,
		osmolality: null,
		osmolarity: 350,
		waterMl: 158
	},
	{
		name: 'Diben Forest Berries 1.5kcal/mL (Fresenius Kabi)',
		formulaCategory: 'diabetic',
		magnesium: 30,
		osmolality: null,
		osmolarity: 360,
		waterMl: 158
	},
	{
		name: 'Diben Cappuccino 1.5kcal/mL (Fresenius Kabi)',
		formulaCategory: 'diabetic',
		magnesium: 30,
		osmolality: null,
		osmolarity: 390,
		waterMl: 158
	},
	{
		name: 'Diabetesource AC 1.2kcal/mL (Nestle, closed system)',
		formulaCategory: 'diabetic',
		magnesium: 320,
		osmolality: 450,
		osmolarity: null,
		waterMl: 818
	},

	// ── Renal ─────────────────────────────────────────────────────────────────
	{
		name: 'Nepro LP 1.8kcal/mL (Abbott)',
		formulaCategory: 'renal',
		magnesium: 46,
		osmolality: null,
		osmolarity: null,
		waterMl: 162
	},
	{
		name: 'Nepro HP 1.8kcal/mL (Abbott)',
		formulaCategory: 'renal',
		magnesium: 46.2,
		osmolality: 236.2,
		osmolarity: null,
		waterMl: 161
	},
	{
		name: 'Novasource Renal 2kcal/mL (Nestle)',
		formulaCategory: 'renal',
		magnesium: 40,
		osmolality: null,
		osmolarity: 460,
		waterMl: 142
	},
	{
		name: 'Nutrison Concentrated 2kcal/mL (Nutricia, closed system)',
		formulaCategory: 'renal',
		magnesium: 175,
		osmolality: 525,
		osmolarity: null,
		waterMl: 350
	},
	{
		name: 'HD Max 1.5kcal/mL',
		formulaCategory: 'renal',
		magnesium: 24,
		osmolality: 465,
		osmolarity: 350,
		waterMl: null
	},

	// ── Hepatic ───────────────────────────────────────────────────────────────
	{
		name: 'Nutrihep 1.5kcal/mL (Nestle)',
		formulaCategory: 'hepatic',
		magnesium: 94,
		osmolality: 790,
		osmolarity: null,
		waterMl: 190
	},
	{
		name: 'Fresubin Hepa Drink 1.3kcal/mL (Fresenius Kabi)',
		formulaCategory: 'hepatic',
		magnesium: 54,
		osmolality: null,
		osmolarity: 360,
		waterMl: 156
	},

	// ── Semi-elemental / Elemental ────────────────────────────────────────────
	{
		name: 'Peptamen Intense VHP 1kcal/mL (Nestle)',
		formulaCategory: 'semielemental',
		magnesium: 75,
		osmolality: null,
		osmolarity: null,
		waterMl: null
	},
	{
		name: 'Peptamen AF 1.2kcal/mL (Nestle)',
		formulaCategory: 'semielemental',
		magnesium: 85,
		osmolality: 390,
		osmolarity: null,
		waterMl: 203
	},
	{
		name: 'Vital 1.5kcal/mL (Abbott)',
		formulaCategory: 'semielemental',
		magnesium: 60,
		osmolality: 630,
		osmolarity: 487,
		waterMl: 155
	},
	{
		name: 'Pivot 1.5kcal/mL (Abbott)',
		formulaCategory: 'semielemental',
		magnesium: 100,
		osmolality: 660,
		osmolarity: null,
		waterMl: 178
	},
	{
		name: 'Peptamen Unflavored 1.5kcal/mL (Nestle)',
		formulaCategory: 'semielemental',
		magnesium: 105,
		osmolality: 585,
		osmolarity: null,
		waterMl: 192
	},
	{
		name: 'Peptamen Vanilla 1.5kcal/mL (Nestle)',
		formulaCategory: 'semielemental',
		magnesium: 105,
		osmolality: 585,
		osmolarity: null,
		waterMl: 193
	},
	{
		name: 'Peptamen AF 1.5kcal/mL (Nestle)',
		formulaCategory: 'semielemental',
		magnesium: 75,
		osmolality: null,
		osmolarity: 425,
		waterMl: 195
	}
];

// ─── Missing supplements to insert ───────────────────────────────────────────
type NewSupp = {
	name: string;
	kcalPerMl: number;
	totalKcal: number;
	volumeMl: number;
	carbs: number | null;
	fat: number | null;
	protein: number;
	sodium: number;
	potassium: number;
	magnesium: number | null;
	phosphorus: number;
	calcium: number | null;
	waterMl: number | null;
	fiber: number;
	osmolality: number | null;
	osmolarity: number | null;
	formulaCategory: string;
	patientCategory: string;
};

const NEW_SUPPLEMENTS: NewSupp[] = [
	{
		name: 'Peptamins 1.5kcal/mL (Sierra)',
		kcalPerMl: 1.5,
		totalKcal: 300,
		volumeMl: 200,
		carbs: 16,
		fat: null,
		protein: 5.3,
		sodium: 119,
		potassium: 250,
		magnesium: null,
		phosphorus: 80,
		calcium: null,
		waterMl: null,
		fiber: 0.8,
		osmolality: 350,
		osmolarity: null,
		formulaCategory: 'semielemental',
		patientCategory: 'adults'
	}
];

// ─── Execute ──────────────────────────────────────────────────────────────────
console.log('Patching supplements (v2)…');

const updateStmt = sqlite.prepare(`
	UPDATE supplements
	SET formula_category = @formulaCategory,
	    magnesium        = COALESCE(@magnesium, magnesium),
	    osmolality       = COALESCE(@osmolality, osmolality),
	    osmolarity       = COALESCE(@osmolarity, osmolarity),
	    water_ml         = COALESCE(@waterMl, water_ml)
	WHERE name = @name
`);

let updated = 0;
let notFound = 0;
for (const p of PATCHES) {
	const r = updateStmt.run({
		name: p.name,
		formulaCategory: p.formulaCategory,
		magnesium: p.magnesium ?? null,
		osmolality: p.osmolality ?? null,
		osmolarity: p.osmolarity ?? null,
		waterMl: p.waterMl ?? null
	});
	if (r.changes === 0) {
		console.warn(`  ⚠ No match: "${p.name}"`);
		notFound++;
	} else {
		updated++;
	}
}
console.log(`  Updated ${updated} supplements (${notFound} not found)`);

// Insert missing supplements
const insertStmt = sqlite.prepare(`
	INSERT OR IGNORE INTO supplements
	  (name, kcal_per_ml, total_kcal, volume_ml, carbs, fat, protein,
	   sodium, potassium, magnesium, phosphorus, calcium, water_ml,
	   fiber, osmolality, osmolarity, formula_category, patient_category, is_active)
	VALUES
	  (@name, @kcalPerMl, @totalKcal, @volumeMl, @carbs, @fat, @protein,
	   @sodium, @potassium, @magnesium, @phosphorus, @calcium, @waterMl,
	   @fiber, @osmolality, @osmolarity, @formulaCategory, @patientCategory, 1)
`);

let inserted = 0;
for (const s of NEW_SUPPLEMENTS) {
	const r = insertStmt.run(s);
	if (r.changes > 0) {
		console.log(`  Inserted: "${s.name}"`);
		inserted++;
	} else {
		console.log(`  Already exists: "${s.name}"`);
	}
}
console.log(`  Inserted ${inserted} new supplement(s)`);

console.log('Done.');
sqlite.close();
