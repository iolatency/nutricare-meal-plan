/**
 * Demo dietitian + 3 patients: completed/active/upcoming sessions, recipes, custom foods,
 * diagnoses, meal tracking, daily logs, and chat messages.
 *
 * Each patient gets 3 sessions so every timeline section is visible:
 *   - Completed (history)   — 8 weeks ago → 6 weeks ago
 *   - Active (current)      — 2 weeks ago → today
 *   - Draft (upcoming)      — +3 days    → +17 days
 *
 * Idempotent: safe to re-run; replaces prior demo journey data for the same accounts.
 *
 * Run: DATABASE_URL=file:/tmp/nutricare.db npx tsx scripts/seed-demo-dietitian-journey.ts
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
		'DATABASE_URL is not set. Example: DATABASE_URL=file:/tmp/nutricare.db npx tsx scripts/seed-demo-dietitian-journey.ts'
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
		targetCalories: 1600,
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
		targetCalories: 1900,
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
		targetCalories: 2100,
		trackTier: 'low' as const
	}
];

// Chat message threads per patient (dietitian=D, patient=P)
// Messages are ordered oldest→newest; timestamps offset by minutesAgo from now
const CHAT_THREADS: Array<
	Array<{ sender: 'dietitian' | 'patient'; body: string; minsAgo: number }>
> = [
	// Thread for patient 1 — سارة
	[
		{
			sender: 'dietitian',
			body: 'مرحباً سارة! كيف حالك؟ أود متابعة خطتك الغذائية هذا الأسبوع.',
			minsAgo: 4320
		},
		{
			sender: 'patient',
			body: 'الحمد لله دكتورة نورة! التزمت بالوجبات بشكل جيد هذا الأسبوع، أحسست بفرق في الطاقة.',
			minsAgo: 4300
		},
		{
			sender: 'dietitian',
			body: 'رائع! هل حافظتِ على كميات الماء اليومية؟ نحتاج على الأقل ٨ أكواب يومياً.',
			minsAgo: 4280
		},
		{
			sender: 'patient',
			body: 'نعم، في معظم الأيام أصل إلى ٧-٨ أكواب. بس بعض الأيام ينقصني كوب.',
			minsAgo: 4260
		},
		{
			sender: 'dietitian',
			body: 'ممتاز! ضعي تنبيهاً على هاتفك كل ساعتين لتذكيرك بالماء. كيف وجبة الإفطار؟',
			minsAgo: 4240
		},
		{
			sender: 'patient',
			body: 'وعاء الشوفان بالبروتين رائع جداً! أصبح وجبتي المفضلة.',
			minsAgo: 4220
		},
		{
			sender: 'dietitian',
			body: 'سعيدة بذلك! سنستمر عليه. وزنك اليوم؟',
			minsAgo: 2880
		},
		{
			sender: 'patient',
			body: '٧٢.٣ كيلو دكتورة. نزل نصف كيلو هذا الأسبوع!',
			minsAgo: 2860
		},
		{
			sender: 'dietitian',
			body: 'ممتازة! هذا تقدم صحي ومستدام. استمري على نفس النهج وسنراجع الخطة الأسبوع القادم. 💪',
			minsAgo: 2840
		},
		{
			sender: 'patient',
			body: 'شكراً دكتورة، بالتوفيق للجميع!',
			minsAgo: 2820
		},
		{
			sender: 'dietitian',
			body: 'سارة، ذكرتيني أن غداء أمس كان من المطعم — هل قدّرتِ السعرات؟',
			minsAgo: 1440
		},
		{
			sender: 'patient',
			body: 'حاولت أختار سلطة الدجاج بدون صوص ثقيل، تقريباً ٤٥٠ سعرة.',
			minsAgo: 1420
		},
		{
			sender: 'dietitian',
			body: 'ممتاز! هذا اختيار ذكي. عند السفر حاولي التمسك بالبروتين والخضار.',
			minsAgo: 1400
		},
		{ sender: 'patient', body: 'حاضر دكتورة، شكراً على النصيحة!', minsAgo: 180 },
		{
			sender: 'dietitian',
			body: 'صباح الخير سارة! لا تنسي وجبة الإفطار قبل الساعة ١٠.',
			minsAgo: 30
		}
	],
	// Thread for patient 2 — عمر
	[
		{
			sender: 'dietitian',
			body: 'أهلاً عمر! كيف قراءات السكر هذا الأسبوع؟',
			minsAgo: 5760
		},
		{
			sender: 'patient',
			body: 'الصباح بين ١٠٠ و١١٠، وهذا أحسن من الأسبوع الماضي.',
			minsAgo: 5740
		},
		{
			sender: 'dietitian',
			body: 'ممتاز! هذا نطاق مقبول جداً. هل توزّعت الكربوهيدرات على الوجبات؟',
			minsAgo: 5720
		},
		{
			sender: 'patient',
			body: 'نعم، حرصت على توزيعها. لكن في العشاء أحياناً آكل أرزاً أكثر.',
			minsAgo: 5700
		},
		{
			sender: 'dietitian',
			body: 'في العشاء حاول تقليل الأرز إلى ١٥٠ جرام وأضف خضاراً بدلاً. هل جربت العدس؟',
			minsAgo: 5680
		},
		{
			sender: 'patient',
			body: 'جربت وعاء العدس وأعجبني! مشبع وخفيف في نفس الوقت.',
			minsAgo: 5660
		},
		{
			sender: 'dietitian',
			body: 'العدس رائع للسكري — بروتين عالٍ وألياف وبطيء الامتصاص. استمر عليه.',
			minsAgo: 5640
		},
		{
			sender: 'patient',
			body: 'شكراً دكتورة! هل أحتاج تحليل دم هذا الشهر؟',
			minsAgo: 2880
		},
		{
			sender: 'dietitian',
			body: 'نعم، HbA1c بعد ثلاثة أشهر من بداية الخطة. أرسل لي النتيجة حين تكون جاهزة.',
			minsAgo: 2860
		},
		{
			sender: 'patient',
			body: 'حاضر، سأقوم بالتحليل هذا الأسبوع إن شاء الله.',
			minsAgo: 2840
		},
		{
			sender: 'dietitian',
			body: 'عمر، لاحظت أنك لم تسجل وجبة الغداء أمس — هل كان يوماً مشغولاً؟',
			minsAgo: 720
		},
		{
			sender: 'patient',
			body: 'نعم، كان عندي اجتماعات متتالية وأكلت من الكافتيريا. لم أعرف كيف أسجلها.',
			minsAgo: 700
		},
		{
			sender: 'dietitian',
			body: 'لا مشكلة! المرة القادمة اكتب في الملاحظات "وجبة خارجية" ووصف مختصر. هذا يساعدني.',
			minsAgo: 680
		},
		{ sender: 'patient', body: 'فهمت، سأفعل ذلك. شكراً!', minsAgo: 90 }
	],
	// Thread for patient 3 — ليلى
	[
		{
			sender: 'dietitian',
			body: 'أهلاً ليلى! كيف حالك وحال الصغير؟ كيف الرضاعة الطبيعية؟',
			minsAgo: 4320
		},
		{
			sender: 'patient',
			body: 'الحمد لله دكتورة! الرضاعة تسير بشكل جيد، لكن أشعر بالإرهاق أحياناً.',
			minsAgo: 4300
		},
		{
			sender: 'dietitian',
			body: 'طبيعي جداً في هذه المرحلة. تأكدي من وجبة الإفطار المغذية يومياً — الأوميغا ٣ والحديد مهمان.',
			minsAgo: 4280
		},
		{
			sender: 'patient',
			body: 'هل تونة معلبة مناسبة لزيادة الأوميغا ٣؟',
			minsAgo: 4260
		},
		{
			sender: 'dietitian',
			body: 'نعم، التونة المعلبة خيار ممتاز وسهل. لفافة سلطة التونة في الخطة مصممة لذلك!',
			minsAgo: 4240
		},
		{
			sender: 'patient',
			body: 'تناولتها اليوم وكانت لذيذة. شكراً على الوصفة.',
			minsAgo: 4220
		},
		{
			sender: 'dietitian',
			body: 'رائع! كيف وزنك هذا الأسبوع؟',
			minsAgo: 2880
		},
		{
			sender: 'patient',
			body: '٦٨ كيلو. لا يزال ثابتاً.',
			minsAgo: 2860
		},
		{
			sender: 'dietitian',
			body: 'هذا طبيعي في فترة الإرضاع — الجسم يحتاج وقتاً. التركيز الآن على التغذية لا الوزن.',
			minsAgo: 2840
		},
		{
			sender: 'patient',
			body: 'شكراً دكتورة، هذا يريحني كثيراً. أحياناً أشعر بالضغط من ثبات الوزن.',
			minsAgo: 2820
		},
		{
			sender: 'dietitian',
			body: 'هذا شعور طبيعي تماماً. ركزي على الالتزام بالوجبات والراحة الكافية. الوزن سيعتدل تدريجياً.',
			minsAgo: 2800
		},
		{
			sender: 'patient',
			body: 'حاضر دكتورة. هل البارفيه بالتفاح والزبادي مفيد لإفطار الرضاعة؟',
			minsAgo: 360
		},
		{
			sender: 'dietitian',
			body: 'ممتاز! الزبادي يعطيك كالسيوم والبروتين، والتفاح ألياف. وجبة مثالية للصباح.',
			minsAgo: 340
		},
		{ sender: 'patient', body: 'تمام! سأجعله روتيناً يومياً 😊', minsAgo: 60 },
		{
			sender: 'dietitian',
			body: 'ليلى، تذكري شرب الماء بعد كل رضعة. الترطيب أساسي جداً في هذه المرحلة.',
			minsAgo: 15
		}
	]
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

function isoMinsAgo(minsAgo: number): string {
	return new Date(Date.now() - minsAgo * 60 * 1000).toISOString();
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
client.pragma('journal_mode = DELETE');
client.pragma('foreign_keys = ON');
const db = drizzle(client, { schema });

function foodIdByName(name: string): number | null {
	const row = db.select().from(schema.foodItems).where(eq(schema.foodItems.name, name)).get();
	return row?.id ?? null;
}

/**
 * Build 14 days of meal plan data + tracking + daily logs for a session.
 * If `completed=true`, all days are in the past and all logs are written.
 * If `upcoming=true`, skip tracking/logs (future session).
 */
function buildSessionMealPlan(opts: {
	sessionId: number;
	clientId: number;
	dates: string[];
	recipeIds: number[];
	patientIndex: number;
	trackTier: 'high' | 'mid' | 'low';
	targetCalories: number;
	isUpcoming: boolean;
	recommendation: string;
}) {
	const {
		sessionId,
		clientId,
		dates,
		recipeIds,
		patientIndex: pi,
		trackTier,
		targetCalories,
		isUpcoming,
		recommendation
	} = opts;

	const planIns = db
		.insert(schema.mealPlans)
		.values({
			sessionId,
			planType: 'weekly',
			version: 1,
			recommendation,
			note: 'تم ضبط الحصص وفق الجدول المعتمد لمدة أسبوعين.',
			builderConfig: JSON.stringify({ targetCalories, macroSplit: { protein: 30, carbs: 45, fat: 25 } })
		})
		.run();
	const mealPlanId = Number(planIns.lastInsertRowid);

	const mealSlots: Array<{ type: (typeof schema.meals.$inferInsert)['mealType']; sort: number }> = [
		{ type: 'breakfast', sort: 0 },
		{ type: 'lunch', sort: 1 },
		{ type: 'afternoon_snack', sort: 2 },
		{ type: 'dinner', sort: 3 }
	];

	const today = ymd(new Date());

	for (let d = 0; d < dates.length; d++) {
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

			// Only track meals for past/current sessions, and only for dates up to today
			if (!isUpcoming && dateStr <= today) {
				const out = outcomeForSlot(trackTier, d, slot.sort);
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
		}

		// Write daily logs only for tracked days (past/current, up to today)
		if (!isUpcoming && dateStr <= today) {
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
	}

	return mealPlanId;
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

	// ── Dietitian ──────────────────────────────────────────────────────────────
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
				updatedAt: now,
				// Mark dietitian as online right now for presence indicator
				lastSeenAt: now
			})
			.where(eq(schema.users.id, dietitianId))
			.run();
		console.log(`Updated demo dietitian id=${dietitianId} (online)`);
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
				lastSeenAt: now,
				canAccessPatientApp: false
			})
			.returning({ id: schema.users.id })
			.all();
		dietitianId = row.id;
		console.log(`Created demo dietitian id=${dietitianId} (online)`);
	}

	// ── Organization ──────────────────────────────────────────────────────────
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

	// ── Patients ──────────────────────────────────────────────────────────────
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

	// ── Tear down previous demo data ──────────────────────────────────────────
	// Chat (cascade deletes messages)
	const existingConvs = db
		.select({ id: schema.chatConversations.id })
		.from(schema.chatConversations)
		.where(eq(schema.chatConversations.dietitianId, dietitianId))
		.all();
	if (existingConvs.length) {
		db.delete(schema.chatMessages)
			.where(inArray(schema.chatMessages.conversationId, existingConvs.map((c) => c.id)))
			.run();
		db.delete(schema.chatConversations)
			.where(eq(schema.chatConversations.dietitianId, dietitianId))
			.run();
	}

	// Sessions (cascade deletes plans → days → meals → tracking → daily logs)
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

	// Recipes (owned by dietitian)
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

	// ── Custom foods ──────────────────────────────────────────────────────────
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

	// ── Recipe categories ──────────────────────────────────────────────────────
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
			steps:
				'اخفق البيض، أضف البروكلي المفروم المسلوق قليلاً، اطبخ على مقلاة غير لاصقة مع ملعقة صغيرة زيت.',
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
			steps:
				'اشوِ صدر الدجاج مع البهارات، قدّم مع أرز بسمتي وأرز بني مخلوط وبروكلي بالبخار.',
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
			steps:
				'سخّن العدس المطبوخ مع الطماطم المفرومة والبهارات، تناول مع شريحة خبز قمح كامل.',
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

	console.log(`\nCreated ${recipeIds.length} recipes`);

	// ── Date ranges for the three sessions ────────────────────────────────────
	const today = new Date();

	// Completed session: 55 days ago → 42 days ago (2 weeks)
	const completedStart = addDays(today, -55);
	const completedEnd = addDays(today, -42);

	// Active session: 13 days ago → today (2 weeks)
	const activeStart = addDays(today, -13);
	const activeEnd = today;

	// Draft upcoming session: +3 days → +17 days (2 weeks)
	const draftStart = addDays(today, 3);
	const draftEnd = addDays(today, 17);

	function dateRange(start: Date, end: Date): string[] {
		const dates: string[] = [];
		let cur = new Date(start);
		while (cur <= end) {
			dates.push(ymd(cur));
			cur = addDays(cur, 1);
		}
		return dates;
	}

	const completedDates = dateRange(completedStart, completedEnd);
	const activeDates = dateRange(activeStart, activeEnd);
	const draftDates = dateRange(draftStart, draftEnd);

	// ── Per-patient sessions + meal plans ────────────────────────────────────
	for (let pi = 0; pi < PATIENTS.length; pi++) {
		const p = PATIENTS[pi];
		const clientId = patientIds[pi];

		// Diagnosis
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

		// ── 1. COMPLETED session (history) ────────────────────────────────────
		const completedSessIns = db
			.insert(schema.mealPlanSessions)
			.values({
				clientId,
				dietitianId,
				startDate: ymd(completedStart),
				endDate: ymd(completedEnd),
				status: 'completed'
			})
			.run();
		const completedSessionId = Number(completedSessIns.lastInsertRowid);
		buildSessionMealPlan({
			sessionId: completedSessionId,
			clientId,
			dates: completedDates,
			recipeIds,
			patientIndex: pi,
			trackTier: p.trackTier,
			targetCalories: p.targetCalories,
			isUpcoming: false,
			recommendation:
				'الجلسة الأولى: تأسيس نمط غذائي صحي. التركيز على انتظام الوجبات وتقليل السكريات المضافة.'
		});
		console.log(`  [${p.email}] Completed session id=${completedSessionId}`);

		// ── 2. ACTIVE session (current) ───────────────────────────────────────
		const activeSessIns = db
			.insert(schema.mealPlanSessions)
			.values({
				clientId,
				dietitianId,
				startDate: ymd(activeStart),
				endDate: ymd(activeEnd),
				status: 'active'
			})
			.run();
		const activeSessionId = Number(activeSessIns.lastInsertRowid);
		buildSessionMealPlan({
			sessionId: activeSessionId,
			clientId,
			dates: activeDates,
			recipeIds,
			patientIndex: pi + 1,
			trackTier: p.trackTier,
			targetCalories: p.targetCalories,
			isUpcoming: false,
			recommendation:
				'الأسبوعان الأولان: التزام بوجبات منتظمة، مراقبة الشبع، وملء سجل الماء يومياً. راجع الأخصائية عند أي تغيير بالأدوية.'
		});
		console.log(`  [${p.email}] Active session id=${activeSessionId}`);

		// ── 3. DRAFT session (upcoming) ───────────────────────────────────────
		const draftSessIns = db
			.insert(schema.mealPlanSessions)
			.values({
				clientId,
				dietitianId,
				startDate: ymd(draftStart),
				endDate: ymd(draftEnd),
				status: 'draft'
			})
			.run();
		const draftSessionId = Number(draftSessIns.lastInsertRowid);
		buildSessionMealPlan({
			sessionId: draftSessionId,
			clientId,
			dates: draftDates,
			recipeIds,
			patientIndex: pi + 2,
			trackTier: p.trackTier,
			targetCalories: Math.round(p.targetCalories * 0.95), // slightly adjusted for next phase
			isUpcoming: true,
			recommendation:
				'الجلسة القادمة: تطوير الخطة الغذائية استناداً إلى نتائج الجلسة الحالية. التركيز على التنوع الغذائي وتعزيز الألياف.'
		});
		console.log(`  [${p.email}] Draft (upcoming) session id=${draftSessionId}`);
	}

	// ── Chat conversations + messages ─────────────────────────────────────────
	console.log('\nSeeding chat conversations...');
	for (let pi = 0; pi < PATIENTS.length; pi++) {
		const clientId = patientIds[pi];
		const thread = CHAT_THREADS[pi]!;

		const convIns = db
			.insert(schema.chatConversations)
			.values({
				dietitianId,
				clientId,
				createdAt: isoMinsAgo(thread[0]!.minsAgo + 10),
				updatedAt: isoMinsAgo(thread[thread.length - 1]!.minsAgo)
			})
			.run();
		const conversationId = Number(convIns.lastInsertRowid);

		for (const msg of thread) {
			const senderUserId = msg.sender === 'dietitian' ? dietitianId : clientId;
			const createdAt = isoMinsAgo(msg.minsAgo);
			// Mark all messages except the last few as read
			const readAt = msg.minsAgo > 60 ? isoMinsAgo(msg.minsAgo - 5) : null;
			db.insert(schema.chatMessages)
				.values({ conversationId, senderUserId, body: msg.body, readAt, createdAt })
				.run();
		}
		console.log(`  [${PATIENTS[pi]!.email}] Conv id=${conversationId} with ${thread.length} messages`);
	}

	console.log('\n✅ Demo journey complete.');
	console.log(`   Dietitian login : ${DEMO_DIETITIAN_EMAIL} / ${DEMO_DIETITIAN_PASSWORD}`);
	console.log(`   Patient password: ${DEMO_PATIENT_PASSWORD}`);
	for (const p of PATIENTS) console.log(`     - ${p.email}`);
	console.log('\n   Patient view features seeded:');
	console.log('     ✓ Sessions timeline — history / current / upcoming (3 sessions per patient)');
	console.log('     ✓ Recipes page  — 7 recipes distributed across all sessions');
	console.log('     ✓ Chat messages — realistic Arabic threads per patient');
	console.log('     ✓ Presence      — dietitian lastSeenAt = now (shows "متصل الآن")');
	client.close();
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
