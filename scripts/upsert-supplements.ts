/**
 * Upsert script: replaces all clinical supplements with complete micronutrient data.
 * Adds: magnesium, waterMl, osmolality, osmolarity, formulaCategory.
 * Includes new product: Peptamins 1.5kcal/mL (Sierra).
 *
 * Run with: npx tsx scripts/upsert-supplements.ts
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath =
	process.env.DATABASE_URL?.replace('file:', '') ?? path.join(__dirname, '../local.db');
const sqlite = new Database(dbPath);

type Row = {
	name: string;
	formulaCategory: string;
	patientCategory: 'adults' | 'children';
	kcalPerMl: number | null;
	totalKcal: number | null;
	volumeMl: number | null;
	carbs: number | null;
	fat: number | null;
	protein: number | null;
	sodium: number | null;
	potassium: number | null;
	magnesium: number | null;
	phosphorus: number | null;
	calcium: number | null;
	waterMl: number | null;
	fiber: number | null;
	osmolality: number | null;
	osmolarity: number | null;
	reference: string | null;
};

const SUPPLEMENTS: Row[] = [
	// ── Standard (no fiber) ────────────────────────────────────────────────────
	{ name: 'Ensure 1kcal/mL (Abbott) Regular', formulaCategory: 'standard', patientCategory: 'adults', kcalPerMl: 1.0, totalKcal: 201, volumeMl: 200, carbs: 27.12, fat: 6.72, protein: 8.0, sodium: 176, potassium: 296, magnesium: 40, phosphorus: 124, calcium: 124, waterMl: 170.2, fiber: null, osmolality: null, osmolarity: null, reference: 'https://www.family.abbott/sa-ar/ensure/products/ensure-liquid.html' },
	{ name: 'Surenutri 1kcal/mL (Almraie)', formulaCategory: 'standard', patientCategory: 'adults', kcalPerMl: 1.0, totalKcal: 200, volumeMl: 200, carbs: 24.8, fat: 7.6, protein: 8.1, sodium: 180, potassium: 278, magnesium: 31.6, phosphorus: 97.8, calcium: 124, waterMl: null, fiber: null, osmolality: 360, osmolarity: null, reference: null },
	{ name: 'Resource Optimum 1.08kcal/mL (Nestle)', formulaCategory: 'standard', patientCategory: 'adults', kcalPerMl: 1.08, totalKcal: 255, volumeMl: 237, carbs: 35.1, fat: 9.0, protein: 9.0, sodium: 209, potassium: 318, magnesium: 43, phosphorus: 97, calcium: 121, waterMl: null, fiber: null, osmolality: null, osmolarity: 474, reference: 'https://www.nestlehealthscience-me.com/en/brands/resource/resource-optimum' },
	{ name: 'EnergyZip 1kcal/mL', formulaCategory: 'standard', patientCategory: 'adults', kcalPerMl: 1.0, totalKcal: 200, volumeMl: 200, carbs: 27.32, fat: 6.7, protein: 3.8, sodium: 195.5, potassium: 299.04, magnesium: 43.52, phosphorus: 137.886, calcium: 138.736, waterMl: null, fiber: null, osmolality: 488, osmolarity: 406, reference: 'https://drive.google.com/drive/u/0/folders/1_USM1UcbRjuOYge77BmrqPhdT22Pi4YT' },

	// ── With Fibers ────────────────────────────────────────────────────────────
	{ name: 'Jevity 1.08kcal/mL (Abbott)', formulaCategory: 'fiber', patientCategory: 'adults', kcalPerMl: 1.08, totalKcal: 250, volumeMl: 237, carbs: 36.7, fat: 8.2, protein: 10.5, sodium: 220, potassium: 372, magnesium: 69, phosphorus: 198, calcium: 216, waterMl: 198, fiber: 3.4, osmolality: null, osmolarity: null, reference: 'https://abbottstore.com/therapeutic-nutrition/jevity/jevity/jevity-1-0-cal.html' },
	{ name: 'Surenutri Oral High Calorie with Fiber 1.5kcal/mL', formulaCategory: 'fiber', patientCategory: 'adults', kcalPerMl: 1.5, totalKcal: 300, volumeMl: 200, carbs: 41.6, fat: 9.16, protein: 11.4, sodium: 197.7, potassium: 345, magnesium: 38.4, phosphorus: 168, calcium: 260, waterMl: null, fiber: 2.87, osmolality: 785, osmolarity: null, reference: null },
	{ name: 'Fresubin with Fiber 2kcal/mL Neutral (Fresenius Kabi)', formulaCategory: 'fiber', patientCategory: 'adults', kcalPerMl: 2.0, totalKcal: 400, volumeMl: 200, carbs: 43.6, fat: 15.6, protein: 20.0, sodium: 120, potassium: 320, magnesium: 32, phosphorus: 240, calcium: 410, waterMl: 134, fiber: 3.0, osmolality: 750, osmolarity: 505, reference: 'https://www.fresubin.com/au/sites/default/files/2020-08/PM2019.656_FS_2kcal%20FIBRE%20Drink.pdf' },
	{ name: 'Fresubin with Fiber Chocolate 2kcal/mL (Fresenius Kabi)', formulaCategory: 'fiber', patientCategory: 'adults', kcalPerMl: 2.0, totalKcal: 400, volumeMl: 200, carbs: 43.4, fat: 15.6, protein: 20.0, sodium: 120, potassium: 320, magnesium: 32, phosphorus: 240, calcium: 410, waterMl: 140, fiber: 3.2, osmolality: 900, osmolarity: 615, reference: 'https://www.fresubin.com/au/sites/default/files/2020-08/PM2019.656_FS_2kcal%20FIBRE%20Drink.pdf' },
	{ name: 'Fortisip Multifiber Vanilla/Strawberry 1.5kcal/mL (Nutricia)', formulaCategory: 'fiber', patientCategory: 'adults', kcalPerMl: 1.5, totalKcal: 308, volumeMl: 200, carbs: 36.8, fat: 11.6, protein: 12.0, sodium: 178, potassium: 318, magnesium: 48, phosphorus: 154, calcium: 182, waterMl: 152, fiber: 4.4, osmolality: 600, osmolarity: null, reference: 'https://nutricia.com.au/adult/wp-content/uploads/sites/7/2022/03/Fortisip_MF_Factsheet_AUS_Feb_2022.pdf' },
	{ name: 'Fortisip Multifiber Chocolate 1.5kcal/mL (Nutricia)', formulaCategory: 'fiber', patientCategory: 'adults', kcalPerMl: 1.5, totalKcal: 308, volumeMl: 200, carbs: 36.8, fat: 11.6, protein: 12.0, sodium: 178, potassium: 318, magnesium: 48, phosphorus: 154, calcium: 182, waterMl: 152, fiber: 4.6, osmolality: 620, osmolarity: null, reference: 'https://nutricia.com.au/adult/wp-content/uploads/sites/7/2022/03/Fortisip_MF_Factsheet_AUS_Feb_2022.pdf' },
	{ name: 'Fibersource 1.2kcal/mL NH (Nestle)', formulaCategory: 'fiber', patientCategory: 'adults', kcalPerMl: 1.2, totalKcal: 300, volumeMl: 250, carbs: 41.0, fat: 10.0, protein: 13.5, sodium: 209, potassium: 480, magnesium: 85, phosphorus: 240, calcium: 121, waterMl: 202, fiber: 3.8, osmolality: 536, osmolarity: null, reference: 'https://www.nestlehealthscience-me.com/en/brands/resource/resource-optimum' },

	// ── Clear ONS ──────────────────────────────────────────────────────────────
	{ name: 'Resource Beverage Orange 1.06kcal/mL (Nestle)', formulaCategory: 'clear_ons', patientCategory: 'adults', kcalPerMl: 1.06, totalKcal: 251, volumeMl: 237, carbs: 54.0, fat: 0.0, protein: 9.0, sodium: 71, potassium: null, magnesium: null, phosphorus: 171, calcium: null, waterMl: 196, fiber: 0.0, osmolality: null, osmolarity: 615, reference: 'https://www.ncare.net.au/resourceafruitflavouredbeverage-1' },
	{ name: 'Resource Beverage Peach 1.06kcal/mL (Nestle)', formulaCategory: 'clear_ons', patientCategory: 'adults', kcalPerMl: 1.06, totalKcal: 251, volumeMl: 237, carbs: 54.0, fat: 0.0, protein: 9.0, sodium: 71, potassium: null, magnesium: null, phosphorus: 171, calcium: null, waterMl: 196, fiber: 0.0, osmolality: null, osmolarity: 752, reference: 'https://www.ncare.net.au/resourceafruitflavouredbeverage-1' },
	{ name: 'Resource Beverage Wildberry 1.06kcal/mL (Nestle)', formulaCategory: 'clear_ons', patientCategory: 'adults', kcalPerMl: 1.06, totalKcal: 251, volumeMl: 237, carbs: 54.0, fat: 0.0, protein: 9.0, sodium: 71, potassium: null, magnesium: null, phosphorus: 171, calcium: null, waterMl: 196, fiber: 0.0, osmolality: null, osmolarity: 758, reference: 'https://www.ncare.net.au/resourceafruitflavouredbeverage-1' },
	{ name: 'Fortijuice Strawberry 1.5kcal/mL (Nutricia)', formulaCategory: 'clear_ons', patientCategory: 'adults', kcalPerMl: 1.5, totalKcal: 300, volumeMl: 200, carbs: 67.0, fat: 0.0, protein: 8.0, sodium: 19.4, potassium: 19.4, magnesium: 4, phosphorus: 24, calcium: 60, waterMl: 152, fiber: 0.0, osmolality: 960, osmolarity: 750, reference: 'https://www.nutricia.co.za/upload/product%20pdfs/Fortijuce_strawberry_%20Fact%20Sheet%20SA%20-%20FC.pdf' },
	{ name: 'Fortijuice Apple 1.5kcal/mL (Nutricia)', formulaCategory: 'clear_ons', patientCategory: 'adults', kcalPerMl: 1.5, totalKcal: 300, volumeMl: 200, carbs: 67.0, fat: 0.0, protein: 7.8, sodium: 20, potassium: 18, magnesium: 4, phosphorus: 24, calcium: 60, waterMl: 152, fiber: 0.0, osmolality: 960, osmolarity: 750, reference: 'https://nutricia.com.au/adult/wp-content/uploads/sites/7/2021/07/Fortijuce_Factsheet_AUS_April_2021.pdf' },
	{ name: 'Fortijuice Orange 1.5kcal/mL (Nutricia)', formulaCategory: 'clear_ons', patientCategory: 'adults', kcalPerMl: 1.5, totalKcal: 300, volumeMl: 200, carbs: 67.0, fat: 0.0, protein: 7.8, sodium: 17.1, potassium: 19.38, magnesium: 3.28, phosphorus: 24, calcium: 60, waterMl: 152, fiber: 0.0, osmolality: 960, osmolarity: 750, reference: 'https://nutricia.com.au/adult/wp-content/uploads/sites/7/2021/07/Fortijuce_Factsheet_AUS_April_2021.pdf' },

	// ── Pulmonary ──────────────────────────────────────────────────────────────
	{ name: 'Nutren Pulmonary Vanilla 1.5kcal/mL (Nestle)', formulaCategory: 'pulmonary', patientCategory: 'adults', kcalPerMl: 1.5, totalKcal: 375, volumeMl: 250, carbs: 25.0, fat: 23.7, protein: 17.0, sodium: 292, potassium: 468, magnesium: 120, phosphorus: 300, calcium: 300, waterMl: 195, fiber: 0.0, osmolality: 450, osmolarity: null, reference: 'https://www.ncare.net.au/resourceafruitflavouredbeverage-1' },
	{ name: 'Pulmocare 1.5kcal/mL (Abbott)', formulaCategory: 'pulmonary', patientCategory: 'adults', kcalPerMl: 1.5, totalKcal: 355, volumeMl: 237, carbs: 25.0, fat: 22.1, protein: 14.8, sodium: 360, potassium: 550, magnesium: 100, phosphorus: 300, calcium: 310, waterMl: 186, fiber: 0.0, osmolality: null, osmolarity: null, reference: 'https://static.abbottnutrition.com/cms-prod/abbottnutrition-2016.com/img/Pulmocare.pdf' },
	{ name: 'Oxepa 1.5kcal/mL (Abbott)', formulaCategory: 'pulmonary', patientCategory: 'adults', kcalPerMl: 1.5, totalKcal: 759, volumeMl: 500, carbs: 53.0, fat: 46.85, protein: 31.25, sodium: 655, potassium: 980, magnesium: 160, phosphorus: 500, calcium: 530, waterMl: 393, fiber: 0.0, osmolality: 490, osmolarity: 384, reference: 'https://static.abbottnutrition.com/cms-prod/abbottnutrition-2016.com/img/Pulmocare.pdf' },

	// ── Surgery / Immune-modulating ────────────────────────────────────────────
	{ name: 'Impact Advance Recovery 1.12kcal/mL (Nestle)', formulaCategory: 'surgery', patientCategory: 'adults', kcalPerMl: 1.12, totalKcal: 280, volumeMl: 250, carbs: 20.0, fat: 11.0, protein: 26.0, sodium: 270, potassium: 600, magnesium: 105, phosphorus: 350, calcium: 380, waterMl: 203, fiber: null, osmolality: 704, osmolarity: null, reference: null },
	{ name: 'Impact Enteral 1.02kcal/mL (Nestle, closed system)', formulaCategory: 'surgery', patientCategory: 'adults', kcalPerMl: 1.02, totalKcal: 510, volumeMl: 500, carbs: 67.0, fat: 14.0, protein: 28.0, sodium: 535, potassium: 670, magnesium: 115, phosphorus: 360, calcium: 400, waterMl: 425, fiber: null, osmolality: null, osmolarity: null, reference: 'https://www.nestlehealthscience.co.za/brands/impact/impact-enteral' },
	{ name: 'Cubitan 1.24kcal/mL (Nutricia)', formulaCategory: 'surgery', patientCategory: 'adults', kcalPerMl: 1.24, totalKcal: 248, volumeMl: 200, carbs: 29.0, fat: 17.6, protein: 7.0, sodium: 100, potassium: 300, magnesium: 84, phosphorus: 364, calcium: 450, waterMl: 160, fiber: 0.0, osmolality: 625, osmolarity: null, reference: 'https://nutricia.com.au/wp-content/uploads/2020/08/Cubitan_Factsheet_AUS_June_2020.pdf' },
	{ name: 'Atempro Vanilla 1.51kcal/mL (Sierra)', formulaCategory: 'surgery', patientCategory: 'adults', kcalPerMl: 1.51, totalKcal: 302, volumeMl: 200, carbs: 34.6, fat: 10.0, protein: 16.6, sodium: 256, potassium: 500, magnesium: 60, phosphorus: 240, calcium: 230, waterMl: null, fiber: 3.4, osmolality: null, osmolarity: 366, reference: 'https://www.vegenathealthcare.es/en/productos/filtro/atempero/' },
	{ name: 'Atempro Tropical 1.51kcal/mL (Sierra)', formulaCategory: 'surgery', patientCategory: 'adults', kcalPerMl: 1.51, totalKcal: 302, volumeMl: 200, carbs: 34.6, fat: 10.0, protein: 16.6, sodium: 256, potassium: 500, magnesium: 60, phosphorus: 240, calcium: 230, waterMl: null, fiber: 3.4, osmolality: null, osmolarity: 398, reference: 'https://www.vegenathealthcare.es/en/productos/filtro/atempero/' },

	// ── High Calorie ───────────────────────────────────────────────────────────
	{ name: 'Ensure Plus 1.5kcal/mL (Abbott)', formulaCategory: 'high_calorie', patientCategory: 'adults', kcalPerMl: 1.5, totalKcal: 300, volumeMl: 200, carbs: 40.4, fat: 9.84, protein: 12.5, sodium: 184, potassium: 320, magnesium: 60, phosphorus: 200, calcium: 240, waterMl: 154.86, fiber: null, osmolality: null, osmolarity: null, reference: 'https://www.abbottnutrition.ie/downloads/1.-Ensure-Plus-Advance-datasheet-Ireland-version-3-October-2019.pdf' },
	{ name: 'Ensure Advance Plus 1.5kcal/mL (Abbott)', formulaCategory: 'high_calorie', patientCategory: 'adults', kcalPerMl: 1.5, totalKcal: 330, volumeMl: 220, carbs: 37.0, fat: 11.0, protein: 20.0, sodium: 330, potassium: 594, magnesium: 55, phosphorus: 260, calcium: 499, waterMl: 168, fiber: 1.7, osmolality: 730, osmolarity: 557, reference: 'https://www.abbottnutrition.ie/downloads/1.-Ensure-Plus-Advance-datasheet-Ireland-version-3-October-2019.pdf' },
	{ name: 'Surenutri Oral Supplement High Calorie 1.5kcal/mL', formulaCategory: 'high_calorie', patientCategory: 'adults', kcalPerMl: 1.5, totalKcal: 300, volumeMl: 200, carbs: 41.6, fat: 9.16, protein: 11.4, sodium: 197.7, potassium: 345, magnesium: 38.4, phosphorus: 168, calcium: 260, waterMl: null, fiber: 2.87, osmolality: 785, osmolarity: null, reference: null },
	{ name: 'Resource Energy 1.5kcal/mL (Nestle)', formulaCategory: 'high_calorie', patientCategory: 'adults', kcalPerMl: 1.5, totalKcal: 302.8, volumeMl: 200, carbs: 42.0, fat: 10.0, protein: 11.2, sodium: 160, potassium: 340, magnesium: 56, phosphorus: 160, calcium: 160, waterMl: 155, fiber: 1.0, osmolality: null, osmolarity: 488, reference: null },
	{ name: 'Resource Support Plus 2kcal/mL (Nestle)', formulaCategory: 'high_calorie', patientCategory: 'adults', kcalPerMl: 2.0, totalKcal: 255, volumeMl: 125, carbs: 26.0, fat: 11.0, protein: 11.5, sodium: 94, potassium: 250, magnesium: 31, phosphorus: 162, calcium: 231, waterMl: 78.7, fiber: null, osmolality: null, osmolarity: 600, reference: 'https://www.nestlehealthscience-me.com/en/brands/resource/resource-support-plus' },
	{ name: 'Resource 2kcal/mL (Nestle)', formulaCategory: 'high_calorie', patientCategory: 'adults', kcalPerMl: 2.0, totalKcal: 400, volumeMl: 200, carbs: 42.8, fat: 17.4, protein: 18.0, sodium: 220, potassium: 380, magnesium: 40, phosphorus: 240, calcium: 350, waterMl: 140.8, fiber: null, osmolality: null, osmolarity: null, reference: null },
	{ name: 'Forticare 1.63kcal/mL (Nutricia)', formulaCategory: 'high_calorie', patientCategory: 'adults', kcalPerMl: 1.63, totalKcal: 204, volumeMl: 125, carbs: 19.1, fat: 6.6, protein: 11.0, sodium: 137.5, potassium: 269, magnesium: 35, phosphorus: 150, calcium: 212.5, waterMl: 160, fiber: 2.6, osmolality: 1000, osmolarity: 730, reference: 'https://www.nutricia.co.za/upload/Forticare_all-flavours_Fact-Sheet-SA-2.pdf' },
	{ name: 'Hyperdrink 2kcal/mL (Sierra)', formulaCategory: 'high_calorie', patientCategory: 'adults', kcalPerMl: 2.0, totalKcal: 400, volumeMl: 200, carbs: 46.0, fat: 16.0, protein: 20.0, sodium: 170, potassium: 440, magnesium: 60, phosphorus: 320, calcium: 336, waterMl: null, fiber: null, osmolality: 440, osmolarity: 591, reference: null },
	{ name: 'Fortisip 1.5kcal/mL (Nutricia)', formulaCategory: 'high_calorie', patientCategory: 'adults', kcalPerMl: 1.5, totalKcal: 300, volumeMl: 200, carbs: 36.8, fat: 11.6, protein: 12.0, sodium: 180, potassium: 318, magnesium: 46, phosphorus: 156, calcium: 182, waterMl: 156, fiber: null, osmolality: 590, osmolarity: null, reference: null },
	{ name: 'Fortisip Compact 2.4kcal/mL (Nutricia)', formulaCategory: 'high_calorie', patientCategory: 'adults', kcalPerMl: 2.4, totalKcal: 300, volumeMl: 125, carbs: 37.1, fat: 11.6, protein: 12.0, sodium: 120, potassium: 295, magnesium: 41, phosphorus: 218, calcium: 218, waterMl: 80, fiber: null, osmolality: 790, osmolarity: null, reference: 'https://www.nutricia.co.uk/hcp/pim-products/fortisip-compact.html' },
	{ name: 'Fortisip Compact Protein 2.4kcal/mL (Nutricia)', formulaCategory: 'high_calorie', patientCategory: 'adults', kcalPerMl: 2.4, totalKcal: 300, volumeMl: 125, carbs: 30.5, fat: 11.8, protein: 18.0, sodium: 50, potassium: 131, magnesium: 68.8, phosphorus: 375, calcium: 438, waterMl: 78.8, fiber: null, osmolality: 900, osmolarity: null, reference: 'https://nutricia.com.au/adult/wp-content/uploads/sites/7/2022/03/Fortisip_Compact_Protein_Factsheet_AUS_Feb_2022.pdf' },
	{ name: 'FontActiv Energy 1.5kcal/mL', formulaCategory: 'high_calorie', patientCategory: 'adults', kcalPerMl: 1.5, totalKcal: 300, volumeMl: 200, carbs: 43.0, fat: 9.16, protein: 11.4, sodium: 198, potassium: 345, magnesium: 39.1, phosphorus: 168, calcium: 269, waterMl: 132, fiber: null, osmolality: 896, osmolarity: null, reference: 'https://sa.fontactiv.com/en/product/fontactiv-energy/' },
	{ name: 'FontActiv Complete Protein 1.25kcal/mL', formulaCategory: 'high_calorie', patientCategory: 'adults', kcalPerMl: 1.25, totalKcal: 250, volumeMl: 200, carbs: 31.0, fat: 6.4, protein: 16.0, sodium: 100, potassium: 310, magnesium: 52, phosphorus: 196, calcium: 300, waterMl: null, fiber: null, osmolality: null, osmolarity: 396, reference: 'https://sa.fontactiv.com/en/product/fontactiv-complete-protein/' },
	{ name: 'Peptisens 1.5kcal/mL', formulaCategory: 'high_calorie', patientCategory: 'adults', kcalPerMl: 1.5, totalKcal: 300, volumeMl: 200, carbs: 32.0, fat: 10.6, protein: 18.2, sodium: 238, potassium: 500, magnesium: 56, phosphorus: 160, calcium: 214, waterMl: null, fiber: 1.6, osmolality: 350, osmolarity: 445, reference: null },
	{ name: 'EnergyZip 1.5kcal/mL', formulaCategory: 'high_calorie', patientCategory: 'adults', kcalPerMl: 1.5, totalKcal: 300, volumeMl: 200, carbs: 40.0, fat: 10.2, protein: 11.4, sodium: 284, potassium: 480, magnesium: 70, phosphorus: 230, calcium: 280, waterMl: null, fiber: null, osmolality: 826, osmolarity: 617, reference: 'https://drive.google.com/drive/u/0/folders/1_USM1UcbRjuOYge77BmrqPhdT22Pi4YT' },

	// ── Diabetic ───────────────────────────────────────────────────────────────
	{ name: 'Glucerna SR 0.93kcal/mL', formulaCategory: 'diabetic', patientCategory: 'adults', kcalPerMl: 0.93, totalKcal: 186, volumeMl: 200, carbs: 17.3, fat: 6.76, protein: 9.3, sodium: 178, potassium: 312, magnesium: 36, phosphorus: 120, calcium: 128, waterMl: 170, fiber: 1.52, osmolality: 470, osmolarity: 399, reference: 'https://www.amazon.sa/-/en/Glucerna-Vanilla-Flavor-Diabetics-Milk/dp/B097SWWQX1' },
	{ name: 'Glucerna 1kcal/mL', formulaCategory: 'diabetic', patientCategory: 'adults', kcalPerMl: 1.0, totalKcal: 200, volumeMl: 200, carbs: 16.28, fat: 10.8, protein: 8.36, sodium: 186, potassium: 260, magnesium: 40, phosphorus: 130, calcium: 140, waterMl: 169.8, fiber: 2.88, osmolality: 354, osmolarity: 300, reference: null },
	{ name: 'FortiActive diaBest Shake Vanilla 1kcal/mL', formulaCategory: 'diabetic', patientCategory: 'adults', kcalPerMl: 1.0, totalKcal: 200, volumeMl: 200, carbs: 19.3, fat: 8.66, protein: 9.2, sodium: 166, potassium: 199, magnesium: 37.3, phosphorus: 109, calcium: 153, waterMl: 156.8, fiber: 4.6, osmolality: 393, osmolarity: null, reference: null },
	{ name: 'Glucerna Advanced 1.6kcal/mL', formulaCategory: 'diabetic', patientCategory: 'adults', kcalPerMl: 1.6, totalKcal: 355, volumeMl: 220, carbs: 28.05, fat: 18.22, protein: 18.3, sodium: 308, potassium: 363, magnesium: 57, phosphorus: 194, calcium: 271, waterMl: 164.3, fiber: 4.2, osmolality: null, osmolarity: 704, reference: null },
	{ name: 'Supportan Cappuccino 1.5kcal/mL', formulaCategory: 'diabetic', patientCategory: 'adults', kcalPerMl: 1.5, totalKcal: 300, volumeMl: 200, carbs: 23.2, fat: 13.4, protein: 20.0, sodium: 95, potassium: 256, magnesium: 54, phosphorus: 240, calcium: 406, waterMl: 152, fiber: 3.0, osmolality: 575, osmolarity: 435, reference: null },
	{ name: 'Supportan Chocolate 1.5kcal/mL', formulaCategory: 'diabetic', patientCategory: 'adults', kcalPerMl: 1.5, totalKcal: 300, volumeMl: 200, carbs: 23.0, fat: 13.4, protein: 20.0, sodium: 124, potassium: 300, magnesium: 34, phosphorus: 240, calcium: 400, waterMl: 154, fiber: 3.5, osmolality: 555, osmolarity: 425, reference: null },
	{ name: 'Diasip 1kcal/mL (Nutricia)', formulaCategory: 'diabetic', patientCategory: 'adults', kcalPerMl: 1.0, totalKcal: 208, volumeMl: 200, carbs: 23.4, fat: 7.6, protein: 9.8, sodium: 110, potassium: 200, magnesium: 46, phosphorus: 94, calcium: 106, waterMl: 166, fiber: 4.0, osmolality: 440, osmolarity: 365, reference: 'https://www.nutricia.co.za/upload/product%20pdfs/Diasip_vanillaFact%20Sheet%20SA%20-%20FC.pdf' },
	{ name: 'Surenutri Diabetic 1kcal/mL (Almarai)', formulaCategory: 'diabetic', patientCategory: 'adults', kcalPerMl: 1.0, totalKcal: 201, volumeMl: 200, carbs: 19.3, fat: 8.66, protein: 9.2, sodium: 166, potassium: 199, magnesium: 36.6, phosphorus: 109, calcium: 145, waterMl: null, fiber: 4.6, osmolality: null, osmolarity: null, reference: null },
	{ name: 'Resource Diabetic 1kcal/mL (Nestle)', formulaCategory: 'diabetic', patientCategory: 'adults', kcalPerMl: 1.0, totalKcal: 240, volumeMl: 237, carbs: 23.2, fat: 10.4, protein: 10.7, sodium: 230, potassium: 228, magnesium: 43, phosphorus: 130, calcium: 187, waterMl: null, fiber: 4.5, osmolality: 293, osmolarity: 246, reference: 'https://www.nestlehealthscience-me.com/en/brands/resource/resource-diabetic' },
	{ name: 'Advanced Diason 1.03kcal/mL (Nutricia, closed system)', formulaCategory: 'diabetic', patientCategory: 'adults', kcalPerMl: 1.03, totalKcal: 1000, volumeMl: 1000, carbs: 113.0, fat: 42.0, protein: 43.0, sodium: 1000, potassium: 1500, magnesium: 230, phosphorus: 720, calcium: 800, waterMl: 840, fiber: 15.0, osmolality: 360, osmolarity: 300, reference: 'https://www.nutricia.co.za/upload/product%20pdfs/Nutrison%20Advanced%20Diason%201L%20Fact%20Sheet%20SA%20-%20FC.pdf' },
	{ name: 'Nutrison Advanced Diason Energy HP 1.5kcal/mL (Nutricia, closed system)', formulaCategory: 'diabetic', patientCategory: 'adults', kcalPerMl: 1.5, totalKcal: 1500, volumeMl: 1000, carbs: 117.0, fat: 77.0, protein: 77.0, sodium: 1310, potassium: 2000, magnesium: 370, phosphorus: 820, calcium: 820, waterMl: 770, fiber: 15.0, osmolality: 515, osmolarity: 395, reference: 'https://www.nutricia.co.za/upload/product%20pdfs/Nutrison%20Advanced%20Diason%20Energy%20%20HP%201L%20Fact%20Sheet%20SA%20-%20FC.pdf' },
	{ name: 'Diben Vanilla/Praline 1.5kcal/mL (Fresenius Kabi)', formulaCategory: 'diabetic', patientCategory: 'adults', kcalPerMl: 1.5, totalKcal: 300, volumeMl: 200, carbs: 26.2, fat: 14.0, protein: 15.0, sodium: 130, potassium: 260, magnesium: 30, phosphorus: 190, calcium: 300, waterMl: 158, fiber: 4.0, osmolality: null, osmolarity: 350, reference: 'https://www.fresubin.com/sites/default/files/2020-02/Productsheet_DibenDrink_2019.pdf' },
	{ name: 'Diben Forest Berries 1.5kcal/mL (Fresenius Kabi)', formulaCategory: 'diabetic', patientCategory: 'adults', kcalPerMl: 1.5, totalKcal: 300, volumeMl: 200, carbs: 26.2, fat: 14.0, protein: 15.0, sodium: 140, potassium: 260, magnesium: 30, phosphorus: 190, calcium: 300, waterMl: 158, fiber: 4.0, osmolality: null, osmolarity: 360, reference: 'https://www.fresubin.com/sites/default/files/2020-02/Productsheet_DibenDrink_2019.pdf' },
	{ name: 'Diben Cappuccino 1.5kcal/mL (Fresenius Kabi)', formulaCategory: 'diabetic', patientCategory: 'adults', kcalPerMl: 1.5, totalKcal: 300, volumeMl: 200, carbs: 26.2, fat: 14.0, protein: 15.0, sodium: 140, potassium: 260, magnesium: 30, phosphorus: 190, calcium: 300, waterMl: 158, fiber: 4.0, osmolality: null, osmolarity: 390, reference: 'https://www.fresubin.com/sites/default/files/2020-02/Productsheet_DibenDrink_2019.pdf' },
	{ name: 'Diabetesource AC 1.2kcal/mL (Nestle, closed system)', formulaCategory: 'diabetic', patientCategory: 'adults', kcalPerMl: 1.2, totalKcal: 1200, volumeMl: 1000, carbs: 100.0, fat: 58.8, protein: 60.0, sodium: 1060, potassium: 1600, magnesium: 320, phosphorus: 800, calcium: 800, waterMl: 818, fiber: 15.2, osmolality: 450, osmolarity: null, reference: 'https://www.nestlehealthscience-me.com/en/brands/diabetisource-ac/diabetisourec-ac-spikeright' },

	// ── Renal ──────────────────────────────────────────────────────────────────
	{ name: 'Nepro LP 1.8kcal/mL (Abbott)', formulaCategory: 'renal', patientCategory: 'adults', kcalPerMl: 1.8, totalKcal: 401, volumeMl: 220, carbs: 40.77, fat: 21.34, protein: 9.94, sodium: 176, potassium: 251, magnesium: 46, phosphorus: 143, calcium: 161, waterMl: 162, fiber: 2.77, osmolality: null, osmolarity: null, reference: 'https://www.eboshealthcare.com.au/globalassets/ebos-au/product-images-au/a/ab2288271-information-sheet.pdf' },
	{ name: 'Nepro HP 1.8kcal/mL (Abbott)', formulaCategory: 'renal', patientCategory: 'adults', kcalPerMl: 1.8, totalKcal: 401, volumeMl: 220, carbs: 32.34, fat: 21.56, protein: 17.82, sodium: 154, potassium: 233.2, magnesium: 46.2, phosphorus: 158.4, calcium: 233.2, waterMl: 161, fiber: 2.77, osmolality: null, osmolarity: null, reference: 'https://www.family.abbott/au-en/products/nepro/nepro-hp-strawberry.html' },
	{ name: 'Novasource Renal 2kcal/mL (Nestle)', formulaCategory: 'renal', patientCategory: 'adults', kcalPerMl: 2.0, totalKcal: 402, volumeMl: 200, carbs: 37.0, fat: 20.0, protein: 18.2, sodium: 152, potassium: 162, magnesium: 40, phosphorus: 122, calcium: 176, waterMl: 142, fiber: null, osmolality: null, osmolarity: 460, reference: 'https://www.ncare.net.au/novasourcearenal-1' },
	{ name: 'Nutrison Concentrated 2kcal/mL (Nutricia, closed system)', formulaCategory: 'renal', patientCategory: 'adults', kcalPerMl: 2.0, totalKcal: 1000, volumeMl: 500, carbs: 100.5, fat: 50.0, protein: 37.5, sodium: 500, potassium: 900, magnesium: 175, phosphorus: 380, calcium: 400, waterMl: 350, fiber: null, osmolality: 525, osmolarity: null, reference: 'https://nutricia.com.au/adult/wp-content/uploads/sites/7/2020/08/Nutrison_Concentrated_Factsheet_AUS_OpTri_June_2020.pdf' },
	{ name: 'HD Max 1.5kcal/mL', formulaCategory: 'renal', patientCategory: 'adults', kcalPerMl: 1.5, totalKcal: 300, volumeMl: 200, carbs: 40.0, fat: 9.2, protein: 13.4, sodium: 230, potassium: 120, magnesium: 24, phosphorus: 160, calcium: 162, waterMl: null, fiber: 4.0, osmolality: 465, osmolarity: 350, reference: null },

	// ── Hepatic ────────────────────────────────────────────────────────────────
	{ name: 'Nutrihep 1.5kcal/mL (Nestle)', formulaCategory: 'hepatic', patientCategory: 'adults', kcalPerMl: 1.5, totalKcal: 375, volumeMl: 250, carbs: 72.5, fat: 21.2, protein: 10.0, sodium: 40, potassium: 330, magnesium: 94, phosphorus: 250, calcium: 239, waterMl: 190, fiber: null, osmolality: 790, osmolarity: null, reference: 'https://www.nestlehealthscience-me.com/en/brands/nutrihep/nutrihep' },
	{ name: 'Fresubin Hepa Drink 1.3kcal/mL (Fresenius Kabi)', formulaCategory: 'hepatic', patientCategory: 'adults', kcalPerMl: 1.3, totalKcal: 260, volumeMl: 200, carbs: 34.8, fat: 9.4, protein: 8.0, sodium: 150, potassium: 240, magnesium: 54, phosphorus: 106, calcium: 160, waterMl: 156, fiber: 2.0, osmolality: null, osmolarity: 360, reference: 'https://www.fresubin.com/sites/default/files/2020-02/Productsheet_Fresubin_HepaDrink_2019.pdf' },

	// ── Semielemental / Elemental ──────────────────────────────────────────────
	{ name: 'Peptamen Intense VHP 1kcal/mL (Nestle)', formulaCategory: 'semielemental', patientCategory: 'adults', kcalPerMl: 1.0, totalKcal: 250, volumeMl: 250, carbs: 19.0, fat: 9.5, protein: 23.0, sodium: 170, potassium: 375, magnesium: 75, phosphorus: 170, calcium: 170, waterMl: null, fiber: 1.0, osmolality: null, osmolarity: null, reference: 'https://www.peptamen.com/product/peptamen-intense-vhp' },
	{ name: 'Peptamen AF 1.2kcal/mL (Nestle)', formulaCategory: 'semielemental', patientCategory: 'adults', kcalPerMl: 1.2, totalKcal: 300, volumeMl: 250, carbs: 28.0, fat: 13.5, protein: 19.0, sodium: 180, potassium: 450, magnesium: 85, phosphorus: 200, calcium: 200, waterMl: 203, fiber: 1.5, osmolality: 390, osmolarity: null, reference: 'https://www.nestlemedicalhub.com/products/peptamen-af' },
	{ name: 'Vital 1.5kcal/mL (Abbott)', formulaCategory: 'semielemental', patientCategory: 'adults', kcalPerMl: 1.5, totalKcal: 300, volumeMl: 200, carbs: 36.8, fat: 11.0, protein: 13.5, sodium: 338, potassium: 400, magnesium: 60, phosphorus: 200, calcium: 200, waterMl: 155, fiber: null, osmolality: 630, osmolarity: 487, reference: 'https://www.abbottnutrition.ie/downloads/Vital-1.5kcal-datasheet-HCP-version-4-June-2018.pdf' },
	{ name: 'Peptamins 1.5kcal/mL (Sierra)', formulaCategory: 'semielemental', patientCategory: 'adults', kcalPerMl: 1.5, totalKcal: 300, volumeMl: 200, carbs: 16.0, fat: null, protein: 5.3, sodium: 119, potassium: 250, magnesium: null, phosphorus: 80, calcium: null, waterMl: null, fiber: 0.8, osmolality: 350, osmolarity: null, reference: null },
	{ name: 'Pivot 1.5kcal/mL (Abbott)', formulaCategory: 'semielemental', patientCategory: 'adults', kcalPerMl: 1.5, totalKcal: 355, volumeMl: 237, carbs: 41.0, fat: 12.0, protein: 22.0, sodium: 350, potassium: 470, magnesium: 100, phosphorus: 230, calcium: 240, waterMl: 178, fiber: 1.8, osmolality: 660, osmolarity: null, reference: 'https://nutrition.abbott/ca/en/adult/pivot-1_5-cal' },
	{ name: 'Peptamen Unflavored 1.5kcal/mL (Nestle)', formulaCategory: 'semielemental', patientCategory: 'adults', kcalPerMl: 1.5, totalKcal: 375, volumeMl: 250, carbs: 47.0, fat: 14.0, protein: 17.0, sodium: 220, potassium: 520, magnesium: 105, phosphorus: 250, calcium: 250, waterMl: 192, fiber: null, osmolality: 585, osmolarity: null, reference: 'https://www.nestlemedicalhub.com/products/peptamen-15' },
	{ name: 'Peptamen Vanilla 1.5kcal/mL (Nestle)', formulaCategory: 'semielemental', patientCategory: 'adults', kcalPerMl: 1.5, totalKcal: 375, volumeMl: 250, carbs: 47.0, fat: 14.0, protein: 17.0, sodium: 220, potassium: 520, magnesium: 105, phosphorus: 250, calcium: 250, waterMl: 193, fiber: null, osmolality: 585, osmolarity: null, reference: 'https://www.nestlemedicalhub.com/products/peptamen-15' },
	{ name: 'Peptamen AF 1.5kcal/mL (Nestle)', formulaCategory: 'semielemental', patientCategory: 'adults', kcalPerMl: 1.5, totalKcal: 380, volumeMl: 250, carbs: 35.0, fat: 16.0, protein: 24.0, sodium: 325, potassium: 675, magnesium: 75, phosphorus: 150, calcium: 250, waterMl: 195, fiber: null, osmolality: null, osmolarity: 425, reference: 'https://www.nestlehealthscience.my/brands/peptamen/peptamen-af' },

	// ── Children: Standard ─────────────────────────────────────────────────────
	{ name: 'PediaSure Chocolate/Vanilla (Abbott)', formulaCategory: 'pediatric_standard', patientCategory: 'children', kcalPerMl: 1.0, totalKcal: 200, volumeMl: 200, carbs: 22.32, fat: 9.96, protein: 5.6, sodium: 120, potassium: 220, magnesium: null, phosphorus: 106, calcium: 112, waterMl: null, fiber: null, osmolality: null, osmolarity: null, reference: null },
	{ name: 'SureGrow Junior Vanilla', formulaCategory: 'pediatric_standard', patientCategory: 'children', kcalPerMl: 1.0, totalKcal: 200, volumeMl: 200, carbs: 21.5, fat: 9.9, protein: 6.2, sodium: 110, potassium: 218, magnesium: null, phosphorus: 146, calcium: 170, waterMl: null, fiber: null, osmolality: null, osmolarity: null, reference: null },

	// ── Children: High Calorie ─────────────────────────────────────────────────
	{ name: 'Tdiet Junior Chocolate/Vanilla', formulaCategory: 'pediatric_high_calorie', patientCategory: 'children', kcalPerMl: 1.5, totalKcal: 300, volumeMl: 200, carbs: 36.6, fat: 14.0, protein: 7.0, sodium: 116, potassium: 240, magnesium: null, phosphorus: 120, calcium: 136, waterMl: null, fiber: null, osmolality: null, osmolarity: null, reference: null },
	{ name: 'SureGrow Junior with Fiber Vanilla', formulaCategory: 'pediatric_high_calorie', patientCategory: 'children', kcalPerMl: 1.5, totalKcal: 300, volumeMl: 200, carbs: 35.1, fat: 13.0, protein: 9.0, sodium: 189, potassium: 381, magnesium: null, phosphorus: 153, calcium: 248, waterMl: null, fiber: 3.31, osmolality: null, osmolarity: null, reference: null },
	{ name: 'Resource Junior Vanilla (Nestle)', formulaCategory: 'pediatric_high_calorie', patientCategory: 'children', kcalPerMl: 1.5, totalKcal: 304, volumeMl: 200, carbs: 42.0, fat: 12.4, protein: 6.0, sodium: 150, potassium: 400, magnesium: null, phosphorus: 150, calcium: 250, waterMl: null, fiber: null, osmolality: null, osmolarity: null, reference: null },
	{ name: 'Resource Junior Chocolate (Nestle)', formulaCategory: 'pediatric_high_calorie', patientCategory: 'children', kcalPerMl: 1.5, totalKcal: 306, volumeMl: 200, carbs: 42.0, fat: 12.4, protein: 6.0, sodium: 150, potassium: 400, magnesium: null, phosphorus: 150, calcium: 250, waterMl: null, fiber: null, osmolality: null, osmolarity: null, reference: null },
	{ name: 'Resource Junior Strawberry (Nestle)', formulaCategory: 'pediatric_high_calorie', patientCategory: 'children', kcalPerMl: 1.5, totalKcal: 304, volumeMl: 200, carbs: 42.0, fat: 12.4, protein: 6.0, sodium: 150, potassium: 400, magnesium: null, phosphorus: 150, calcium: 250, waterMl: null, fiber: null, osmolality: null, osmolarity: null, reference: null },
	{ name: 'NutriniDrink Multi Fiber Vanilla/Strawberry (Nutricia)', formulaCategory: 'pediatric_high_calorie', patientCategory: 'children', kcalPerMl: 1.5, totalKcal: 300, volumeMl: 200, carbs: 37.6, fat: 13.6, protein: 6.6, sodium: 134, potassium: 280, magnesium: null, phosphorus: 150, calcium: 168, waterMl: null, fiber: 3.0, osmolality: null, osmolarity: null, reference: null },

	// ── Children: Semi-elemental ───────────────────────────────────────────────
	{ name: 'Peptamen Infant (Nestle)', formulaCategory: 'pediatric_semielemental', patientCategory: 'children', kcalPerMl: 1.0, totalKcal: 200, volumeMl: 200, carbs: 20.0, fat: 11.0, protein: 5.2, sodium: 74, potassium: 230, magnesium: null, phosphorus: 120, calcium: 200, waterMl: null, fiber: null, osmolality: null, osmolarity: null, reference: null },
	{ name: 'Peptamen Junior (Nestle)', formulaCategory: 'pediatric_semielemental', patientCategory: 'children', kcalPerMl: 1.5, totalKcal: 302, volumeMl: 200, carbs: 36.0, fat: 13.2, protein: 9.0, sodium: 170, potassium: 400, magnesium: null, phosphorus: 140, calcium: 270, waterMl: null, fiber: null, osmolality: null, osmolarity: null, reference: null }
];

// Delete all existing supplements and re-insert with complete data
const stmt = sqlite.prepare(`
	DELETE FROM supplements
`);
stmt.run();
console.log('Cleared existing supplements');

const insert = sqlite.prepare(`
	INSERT INTO supplements (
		name, formula_category, patient_category,
		kcal_per_ml, total_kcal, volume_ml,
		carbs, fat, protein,
		sodium, potassium, magnesium, phosphorus, calcium,
		water_ml, fiber, osmolality, osmolarity,
		reference, is_active
	) VALUES (
		@name, @formulaCategory, @patientCategory,
		@kcalPerMl, @totalKcal, @volumeMl,
		@carbs, @fat, @protein,
		@sodium, @potassium, @magnesium, @phosphorus, @calcium,
		@waterMl, @fiber, @osmolality, @osmolarity,
		@reference, 1
	)
`);

const insertMany = sqlite.transaction((rows: Row[]) => {
	for (const row of rows) {
		insert.run(row);
	}
});

insertMany(SUPPLEMENTS);
console.log(`Inserted ${SUPPLEMENTS.length} supplements with complete micronutrient data`);
sqlite.close();
