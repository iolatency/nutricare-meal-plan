/**
 * Demo dietitian + 3 patients: 2-week active meal plans, recipes, custom foods,
 * diagnoses, meal tracking, and daily logs (for dietitian tracking dashboard).
 *
 * Idempotent: safe to re-run; replaces prior demo journey data for the same accounts.
 *
 * Run: DATABASE_URL=file:local.db npx tsx scripts/seed-demo-dietitian-journey.ts
 * Requires seed-meal-domain first (food_items for recipe ingredients).
 */
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { and, eq, inArray } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import * as schema from '../src/lib/server/db/schema';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
	console.error(
		'DATABASE_URL is not set. Example: DATABASE_URL=file:local.db npx tsx scripts/seed-demo-dietitian-journey.ts'
	);
	process.exit(1);
}

const DEMO_DIETITIAN_EMAIL =
	(process.env.DEMO_DIETITIAN_EMAIL ?? 'demo.dietitian@demo-nutricare.io').toLowerCase();
const DEMO_DIETITIAN_PASSWORD = process.env.DEMO_DIETITIAN_PASSWORD ?? 'NutriDemo2026!';
const DEMO_PATIENT_PASSWORD = process.env.DEMO_PATIENT_PASSWORD ?? DEMO_DIETITIAN_PASSWORD;

const ORG_NAME = 'NutriCare Demo Clinic';
const ORG_TYPE = 'clinic';

const PATIENTS = [
	{
		name: 'سارة عبدالرحمن الغامدي',
		email: 'demo.patient1@demo-nutricare.io',
		username: 'demo_patient_sara',
		phone: '+966590000101',
		diag: {
			diagKey: 'overweight_mgmt',
			name: 'زيادة الوزن — برنامج تعديل نمط الحياة',
			code: 'E66.3',
			severity: 'moderate' as const,
			diagnosedDate: '2025-11-01',
			status: 'managed' as const,
			notes:
				'الهدف: عجز طفيف من السعرات مع زيادة البروتين والنشاط. متابعة أسبوعية للوزن والمحيط.'
		},
		/** Adherence pattern seed 0–9 per (day, meal slot). */
		trackTier: 'high' as const
	},
	{
		name: 'عمر خالد الشهري',
		email: 'demo.patient2@demo-nutricare.io',
		username: 'demo_patient_omar',
		phone: '+966590000102',
		diag: {
			diagKey: 't2dm_diet',
			name: 'داء السكري من النوع الثاني — تغذية علاجية',
			code: 'E11.9',
			severity: 'mild' as const,
			diagnosedDate: '2024-08-15',
			status: 'active' as const,
			notes:
				'توزيع الكربوهيدرات على الوجبات، تفضيل مؤشر جلايسيمي منخفض، مراقبة السكر الصائم.'
		},
		trackTier: 'mid' as const
	},
	{
		name: 'ليلى حسن العتيبي',
		email: 'demo.patient3@demo-nutricare.io',
		username: 'demo_patient_layla',
		phone: '+966590000103',
		diag: {
			diagKey: 'postpartum_recovery',
			name: 'تعافٍ بعد الولادة — دعم تغذوي',
			code: 'Z39.2',
			severity: 'mild' as const,
			diagnosedDate: '2026-02-20',
			status: 'active' as const,
			notes:
				'تركيز على الحديد والبروتين والأوميغا 3، مع مراعاة الرضاعة الطبيعية والترطيب.'
		},
		trackTier: 'low' as const
	}
];

function sqlitePathFromUrl(url: string): string {
	return url.startsWith('file:') ? url.slice('file:'.length) : url;
}

function ymd(d: Date): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${y}-${m}-${day}`;
}

function addDays(base: Date, days: number): Date {
	const x = new Date(base);
	x.setDate(x.getDate() + days);
	return x;
}

type TrackOutcome = 'eaten' | 'skipped' | 'none';

function outcomeForSlot(tier: 'high' | 'mid' | 'low', dayIdx: number, slotIdx: number): TrackOutcome {
	const h = (dayIdx * 13 + slotIdx * 7 + (tier === 'high' ? 2 : tier === 'mid' ? 0 : 5)) % 12;
	if (tier === 'high') {
		if (h === 0) return 'skipped';
		if (h === 1) return 'none';
		return 'eaten';
	}
	if (tier === 'mid') {
		if (h <= 1) return 'none';
		if (h <= 3) return 'skipped';
		return 'eaten';
	}
	if (h <= 3) return 'none';
	if (h <= 5) return 'skipped';
	return 'eaten';
}

const sqlitePath = path.resolve(process.cwd(), sqlitePathFromUrl(DATABASE_URL));
const client = new Database(sqlitePath);
client.pragma('journal_mode = WAL');
client.pragma('foreign_keys = ON');
const db = drizzle(client, { schema });

function foodIdByName(name: string): number | null {
	const row = db.select().from(schema.foodItems).where(eq(schema.foodItems.name, name)).get();
	return row?.id ?? null;
}

async function main() {
	const now = new Date().toISOString();
	const hashD = bcrypt.hashSync(DEMO_DIETITIAN_PASSWORD, 10);
	const hashP = bcrypt.hashSync(DEMO_PATIENT_PASSWORD, 10);

	const foodIds = {
		rice: foodIdByName('Cooked White Rice'),
		chicken: foodIdByName('Chicken Breast'),
		oats: foodIdByName('Rolled Oats'),
		yogurt: foodIdByName('Low-fat Yogurt'),
		egg: foodIdByName('Egg'),
		broccoli: foodIdByName('Broccoli'),
		oliveOil: foodIdByName('Olive Oil'),
		lentils: foodIdByName('Lentils (cooked)'),
		banana: foodIdByName('Banana'),
		bread: foodIdByName('Whole Wheat Bread'),
		apple: foodIdByName('Apple'),
		tuna: foodIdByName('Canned Tuna')
	};
	if (!foodIds.rice || !foodIds.chicken) {
		console.error('Missing baseline food_items. Run: npm run db:seed-meal (or full npm run db:seed) first.');
		process.exit(1);
	}

	let dietitianId: number;

	const existingD = db
		.select()
		.from(schema.users)
		.where(eq(schema.users.email, DEMO_DIETITIAN_EMAIL))
		.get();
	if (existingD) {
		dietitianId = existingD.id;
		db.update(schema.users)
			.set({
				password: hashD,
				name: 'د. نورة سعد المالكي — أخصائية التغذية العلاجية',
				username: 'demo_dietitian',
				phone: '+966590000000',
				emailVerifiedAt: now,
				updatedAt: now
			})
			.where(eq(schema.users.id, dietitianId))
			.run();
		console.log(`Updated demo dietitian id=${dietitianId}`);
	} else {
		const [row] = db
			.insert(schema.users)
			.values({
				name: 'د. نورة سعد المالكي — أخصائية التغذية العلاجية',
				email: DEMO_DIETITIAN_EMAIL,
				username: 'demo_dietitian',
				phone: '+966590000000',
				password: hashD,
				emailVerifiedAt: now,
				createdAt: now,
				updatedAt: now,
				canAccessPatientApp: false
			})
			.returning({ id: schema.users.id })
			.all();
		dietitianId = row.id;
		console.log(`Created demo dietitian id=${dietitianId}`);
	}

	let orgId: number;
	const orgRow = db.select().from(schema.organizations).where(eq(schema.organizations.name, ORG_NAME)).get();
	if (orgRow) {
		orgId = orgRow.id;
	} else {
		const [o] = db
			.insert(schema.organizations)
			.values({ name: ORG_NAME, type: ORG_TYPE, createdAt: now, updatedAt: now })
			.returning({ id: schema.organizations.id })
			.all();
		orgId = o.id;
		console.log(`Created organization id=${orgId}`);
	}

	const memD = db.select().from(schema.memberships).where(eq(schema.memberships.userId, dietitianId)).get();
	if (memD) {
		db.update(schema.memberships)
			.set({ organizationId: orgId, roles: JSON.stringify(['dietitian']), updatedAt: now })
			.where(eq(schema.memberships.id, memD.id))
			.run();
	} else {
		db.insert(schema.memberships)
			.values({
				organizationId: orgId,
				userId: dietitianId,
				roles: JSON.stringify(['dietitian']),
				createdAt: now,
				updatedAt: now
			})
			.run();
	}

	const patientIds: number[] = [];
	for (const p of PATIENTS) {
		const ex = db.select().from(schema.users).where(eq(schema.users.email, p.email)).get();
		let uid: number;
		if (ex) {
			uid = ex.id;
			db.update(schema.users)
				.set({
					password: hashP,
					name: p.name,
					username: p.username,
					phone: p.phone,
					emailVerifiedAt: now,
					updatedAt: now,
					canAccessPatientApp: true
				})
				.where(eq(schema.users.id, uid))
				.run();
			console.log(`Updated patient ${p.email} id=${uid}`);
		} else {
			const [u] = db
				.insert(schema.users)
				.values({
					name: p.name,
					email: p.email,
					username: p.username,
					phone: p.phone,
					password: hashP,
					emailVerifiedAt: now,
					createdAt: now,
					updatedAt: now,
					canAccessPatientApp: true
				})
				.returning({ id: schema.users.id })
				.all();
			uid = u.id;
			console.log(`Created patient ${p.email} id=${uid}`);
		}
		patientIds.push(uid);

		const mem = db.select().from(schema.memberships).where(eq(schema.memberships.userId, uid)).get();
		if (mem) {
			db.update(schema.memberships)
				.set({ organizationId: orgId, roles: JSON.stringify(['patient']), updatedAt: now })
				.where(eq(schema.memberships.id, mem.id))
				.run();
		} else {
			db.insert(schema.memberships)
				.values({
					organizationId: orgId,
					userId: uid,
					roles: JSON.stringify(['patient']),
					createdAt: now,
					updatedAt: now
				})
				.run();
		}
	}

	// Tear down previous demo journey for these users
	db.delete(schema.patientDiagnoses)
		.where(
			and(
				eq(schema.patientDiagnoses.dietitianId, dietitianId),
				inArray(schema.patientDiagnoses.clientId, patientIds)
			)!
		)
		.run();

	db.delete(schema.mealPlanSessions)
		.where(
			and(
				eq(schema.mealPlanSessions.dietitianId, dietitianId),
				inArray(schema.mealPlanSessions.clientId, patientIds)
			)!
		)
		.run();

	const oldRecipeIds = db
		.select({ id: schema.recipes.id })
		.from(schema.recipes)
		.where(eq(schema.recipes.ownerId, dietitianId))
		.all()
		.map((r) => r.id);
	if (oldRecipeIds.length) {
		db.delete(schema.recipeIngredients)
			.where(inArray(schema.recipeIngredients.recipeId, oldRecipeIds))
			.run();
	}
	db.delete(schema.recipes).where(eq(schema.recipes.ownerId, dietitianId)).run();
	db.delete(schema.recipeCategories).where(eq(schema.recipeCategories.ownerId, dietitianId)).run();
	db.delete(schema.foodItems).where(eq(schema.foodItems.createdBy, dietitianId)).run();

	// Custom foods (دietitian "My foods")
	const customFoods = [
		{
			name: 'Labneh low-fat spread',
			nameAr: 'لبنة قليلة الدسم',
			calories: 120,
			protein: 8,
			carbs: 4,
			fat: 8,
			fiber: 0,
			unit: 'g',
			portionSize: 40,
			source: 'internal' as const
		},
		{
			name: 'Grilled chicken shawarma (homemade)',
			nameAr: 'شاورما دجاج منزلية',
			calories: 185,
			protein: 22,
			carbs: 8,
			fat: 7,
			fiber: 1.5,
			unit: 'g',
			portionSize: 150,
			source: 'internal' as const
		},
		{
			name: 'Quinoa salad cup',
			nameAr: 'سلة كينوا بالخضار',
			calories: 210,
			protein: 7,
			carbs: 32,
			fat: 6,
			fiber: 5,
			unit: 'g',
			portionSize: 200,
			source: 'internal' as const
		},
		{
			name: 'Date & walnut snack mix',
			nameAr: 'خليط تمر وجوز',
			calories: 165,
			protein: 3,
			carbs: 22,
			fat: 8,
			fiber: 3,
			unit: 'g',
			portionSize: 35,
			source: 'internal' as const
		}
	];
	for (const f of customFoods) {
		db.insert(schema.foodItems).values({ ...f, createdBy: dietitianId }).run();
	}

	const [catBreakfast] = db
		.insert(schema.recipeCategories)
		.values({ name: 'Breakfast', nameAr: 'إفطار', ownerId: dietitianId })
		.returning({ id: schema.recipeCategories.id })
		.all();
	const [catLunch] = db
		.insert(schema.recipeCategories)
		.values({ name: 'Lunch', nameAr: 'غداء', ownerId: dietitianId })
		.returning({ id: schema.recipeCategories.id })
		.all();
	const [catLight] = db
		.insert(schema.recipeCategories)
		.values({ name: 'Light meals', nameAr: 'وجبات خفيفة', ownerId: dietitianId })
		.returning({ id: schema.recipeCategories.id })
		.all();

	type RecipeDef = {
		name: string;
		nameAr: string;
		categoryId: number;
		portions: number;
		steps: string;
		nutrients: string;
		ingredients: Array<{ foodItemId: number; quantity: number; unit: string }>;
	};

	const recipeDefs: RecipeDef[] = [
		{
			name: 'Protein oatmeal bowl',
			nameAr: 'وعاء شوفان بالبروتين',
			categoryId: catBreakfast.id,
			portions: 1,
			steps:
				'اطبخ الشوفان بالحليب أو الماء، أضف الزبادي بعد الطهي، رشّ القرفة، زين بالموز المقطع.',
			nutrients: JSON.stringify({ calories: 380, protein: 22, carbs: 52, fat: 9, fiber: 8 }),
			ingredients: [
				{ foodItemId: foodIds.oats!, quantity: 50, unit: 'g' },
				{ foodItemId: foodIds.yogurt!, quantity: 120, unit: 'g' },
				{ foodItemId: foodIds.banana!, quantity: 0.5, unit: 'piece' }
			]
		},
		{
			name: 'Vegetable omelette',
			nameAr: 'أومليت بالخضار',
			categoryId: catBreakfast.id,
			portions: 1,
			steps: 'اخفق البيض، أضف البروكلي المفروم المسلوق قليلاً، اطبخ على مقلاة غير لاصقة مع ملعقة صغيرة زيت.',
			nutrients: JSON.stringify({ calories: 290, protein: 20, carbs: 8, fat: 20, fiber: 3 }),
			ingredients: [
				{ foodItemId: foodIds.egg!, quantity: 2, unit: 'piece' },
				{ foodItemId: foodIds.broccoli!, quantity: 80, unit: 'g' },
				{ foodItemId: foodIds.oliveOil!, quantity: 5, unit: 'ml' }
			]
		},
		{
			name: 'Mediterranean chicken plate',
			nameAr: 'طبق دجاج متوسطي',
			categoryId: catLunch.id,
			portions: 2,
			steps: 'اشوِ صدر الدجاج مع البهارات، قدّم مع أرز بسمتي وأرز بني مخلوط وبروكلي بالبخار.',
			nutrients: JSON.stringify({ calories: 520, protein: 42, carbs: 48, fat: 14, fiber: 6 }),
			ingredients: [
				{ foodItemId: foodIds.chicken!, quantity: 180, unit: 'g' },
				{ foodItemId: foodIds.rice!, quantity: 150, unit: 'g' },
				{ foodItemId: foodIds.broccoli!, quantity: 120, unit: 'g' }
			]
		},
		{
			name: 'Lentil stew bowl',
			nameAr: 'وعاء عدس بالخضار',
			categoryId: catLunch.id,
			portions: 2,
			steps: 'سخّن العدس المطبوخ مع الطماطم المفرومة والبهارات، تناول مع شريحة خبز قمح كامل.',
			nutrients: JSON.stringify({ calories: 410, protein: 18, carbs: 62, fat: 10, fiber: 14 }),
			ingredients: [
				{ foodItemId: foodIds.lentils!, quantity: 200, unit: 'g' },
				{ foodItemId: foodIds.oliveOil!, quantity: 10, unit: 'ml' },
				{ foodItemId: foodIds.bread!, quantity: 40, unit: 'g' }
			]
		},
		{
			name: 'Tuna salad wrap',
			nameAr: 'لفافة سلطة تونة',
			categoryId: catLight.id,
			portions: 1,
			steps: 'امزج التونة مع الزبادي والليمون، وزع على خبز القمح مع الخس إن وجد.',
			nutrients: JSON.stringify({ calories: 340, protein: 32, carbs: 38, fat: 8, fiber: 5 }),
			ingredients: [
				{ foodItemId: foodIds.tuna!, quantity: 100, unit: 'g' },
				{ foodItemId: foodIds.yogurt!, quantity: 40, unit: 'g' },
				{ foodItemId: foodIds.bread!, quantity: 60, unit: 'g' }
			]
		},
		{
			name: 'Apple yogurt parfait',
			nameAr: 'بارفيه تفاح وزبادي',
			categoryId: catLight.id,
			portions: 1,
			steps: 'طبّق الزبادي مع قطع التفاح ورشّ قرفة.',
			nutrients: JSON.stringify({ calories: 220, protein: 10, carbs: 36, fat: 4, fiber: 4 }),
			ingredients: [
				{ foodItemId: foodIds.yogurt!, quantity: 150, unit: 'g' },
				{ foodItemId: foodIds.apple!, quantity: 1, unit: 'piece' }
			]
		},
		{
			name: 'Grilled chicken with rice (meal prep)',
			nameAr: 'دجاج مشوي مع أرز (وجبة جاهزة)',
			categoryId: catLunch.id,
			portions: 1,
			steps: 'قطع الدجاج شرائح، تبلّ بالليمون والثوم، اشوِ ثم قدّم مع الأرز المطبوخ.',
			nutrients: JSON.stringify({ calories: 480, protein: 38, carbs: 55, fat: 12, fiber: 2 }),
			ingredients: [
				{ foodItemId: foodIds.chicken!, quantity: 160, unit: 'g' },
				{ foodItemId: foodIds.rice!, quantity: 180, unit: 'g' }
			]
		}
	];

	const recipeIds: number[] = [];
	for (const r of recipeDefs) {
		const ins = db
			.insert(schema.recipes)
			.values({
				name: r.name,
				nameAr: r.nameAr,
				ownerId: dietitianId,
				steps: r.steps,
				portions: r.portions,
				nutrients: r.nutrients,
				categoryId: r.categoryId,
				source: 'internal'
			})
			.run();
		const rid = Number(ins.lastInsertRowid);
		recipeIds.push(rid);
		for (const ing of r.ingredients) {
			db.insert(schema.recipeIngredients)
				.values({
					recipeId: rid,
					foodItemId: ing.foodItemId,
					quantity: ing.quantity,
					unit: ing.unit
				})
				.run();
		}
	}

	const today = new Date();
	const startD = addDays(today, -13);
	const startDate = ymd(startD);
	const endDate = ymd(today);
	const dates: string[] = [];
	for (let i = 0; i < 14; i++) dates.push(ymd(addDays(startD, i)));

	const mealSlots: Array<{ type: (typeof schema.meals.$inferInsert)['mealType']; sort: number }> = [
		{ type: 'breakfast', sort: 0 },
		{ type: 'lunch', sort: 1 },
		{ type: 'afternoon_snack', sort: 2 },
		{ type: 'dinner', sort: 3 }
	];

	for (let pi = 0; pi < PATIENTS.length; pi++) {
		const p = PATIENTS[pi];
		const clientId = patientIds[pi];

		db.insert(schema.patientDiagnoses)
			.values({
				clientId,
				dietitianId,
				diagKey: p.diag.diagKey,
				name: p.diag.name,
				code: p.diag.code,
				severity: p.diag.severity,
				diagnosedDate: p.diag.diagnosedDate,
				status: p.diag.status,
				notes: p.diag.notes
			})
			.run();

		const sessIns = db
			.insert(schema.mealPlanSessions)
			.values({
				clientId,
				dietitianId,
				startDate,
				endDate,
				status: 'active'
			})
			.run();
		const sessionId = Number(sessIns.lastInsertRowid);

		const planIns = db
			.insert(schema.mealPlans)
			.values({
				sessionId,
				planType: 'weekly',
				version: 1,
				recommendation:
					'الأسبوعان الأولان: التزام بوجبات منتظمة، مراقبة الشبع، وملء سجل الماء يومياً. راجع الأخصائية عند أي تغيير بالأدوية.',
				note: 'تم ضبط الحصص وفق الجدول المعتمد لمدة أسبوعين.'
			})
			.run();
		const mealPlanId = Number(planIns.lastInsertRowid);

		for (let d = 0; d < 14; d++) {
			const dayIns = db
				.insert(schema.mealDays)
				.values({
					mealPlanId,
					date: dates[d],
					dayOfWeek: d % 7,
					sortOrder: d
				})
				.run();
			const mealDayId = Number(dayIns.lastInsertRowid);
			const dateStr = dates[d]!;

			let dayEaten = 0;

			for (const slot of mealSlots) {
				const recipeId = recipeIds[(d + slot.sort + pi) % recipeIds.length]!;
				const mIns = db
					.insert(schema.meals)
					.values({
						mealDayId,
						mealType: slot.type,
						recipeId,
						sortOrder: slot.sort
					})
					.run();
				const mealId = Number(mIns.lastInsertRowid);

				const out = outcomeForSlot(p.trackTier, d, slot.sort);
				if (out === 'eaten') {
					db.insert(schema.mealTracking)
						.values({ sessionId, mealId, date: dateStr, status: 'eaten' })
						.run();
					dayEaten++;
				} else if (out === 'skipped') {
					db.insert(schema.mealTracking)
						.values({
							sessionId,
							mealId,
							date: dateStr,
							status: 'skipped',
							replacementNote:
								slot.type === 'dinner' ? 'استبدال بوجبة مطعم مشابهة بالسعرات' : null
						})
						.run();
				}
			}

			const waterCups = 6 + ((d + pi * 2) % 4);
			const baseWt = 74 - pi * 2.2 - d * 0.12;
			const adherenceScore = Math.round((dayEaten / mealSlots.length) * 100);

			db.insert(schema.dailyLogs)
				.values({
					sessionId,
					clientId,
					date: dateStr,
					waterCups,
					weight: Math.round(baseWt * 10) / 10,
					adherenceScore,
					completed: dayEaten >= 3
				})
				.run();
		}

		console.log(`  Built 2-week journey: session ${sessionId} for ${p.email}`);
	}

	console.log('\n✅ Demo journey complete.');
	console.log(`   Dietitian login: ${DEMO_DIETITIAN_EMAIL} / ${DEMO_DIETITIAN_PASSWORD}`);
	console.log(`   Patient logins (same password by default): ${DEMO_PATIENT_PASSWORD}`);
	for (const p of PATIENTS) console.log(`     - ${p.email}`);
	client.close();
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
