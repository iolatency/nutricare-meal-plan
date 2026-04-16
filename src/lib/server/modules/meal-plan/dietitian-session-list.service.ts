import { db } from '$lib/server/db';
import { users, memberships, mealPlanSessions, mealPlans } from '$lib/server/db/schema';
import { eq, and, desc, inArray } from 'drizzle-orm';
import { fail, redirect, type ActionFailure } from '@sveltejs/kit';
import Database from 'better-sqlite3';
import { findUserByEmail } from '$lib/server/modules/users/user.repository';
import { membershipRolesToAppRole } from '$lib/server/modules/auth/membership-role';
import {
	resolveWorkingSession,
	resolveWorkingSessionFromRows,
	resolveWorkingSessionTx,
	type SessionListRow
} from '$lib/server/meal-plan/session-resolution';

export async function loadDietitianMealPlanListPage(dietitianId: number) {
	const myMembership = db
		.select({ orgId: memberships.organizationId })
		.from(memberships)
		.where(eq(memberships.userId, dietitianId))
		.get();

	if (!myMembership) {
		return { patients: [] };
	}

	const orgMembers = db
		.select({
			userId: memberships.userId,
			roles: memberships.roles
		})
		.from(memberships)
		.where(eq(memberships.organizationId, myMembership.orgId))
		.all();

	const patientUserIds = orgMembers
		.filter((m) => {
			const lower = (m.roles ?? '').toLowerCase();
			return lower.includes('patient') || lower.includes('client');
		})
		.map((m) => m.userId);

	if (!patientUserIds.length) {
		return { patients: [] };
	}

	const patientUsers = db
		.select({
			id: users.id,
			name: users.name,
			email: users.email,
			phone: users.phone,
			canAccessPatientApp: users.canAccessPatientApp
		})
		.from(users)
		.where(inArray(users.id, patientUserIds))
		.all();

	const allSessions = db
		.select({
			id: mealPlanSessions.id,
			clientId: mealPlanSessions.clientId,
			status: mealPlanSessions.status,
			startDate: mealPlanSessions.startDate
		})
		.from(mealPlanSessions)
		.where(and(inArray(mealPlanSessions.clientId, patientUserIds), eq(mealPlanSessions.dietitianId, dietitianId)))
		.orderBy(desc(mealPlanSessions.id))
		.all() as SessionListRow[];

	const byClient = new Map<number, SessionListRow[]>();
	for (const s of allSessions) {
		const arr = byClient.get(s.clientId) ?? [];
		arr.push(s);
		byClient.set(s.clientId, arr);
	}

	const patients = patientUsers.map((user) => {
		const rows = byClient.get(user.id) ?? [];
		const working = resolveWorkingSessionFromRows(rows);
		const sorted = [...rows].sort((a, b) => b.id - a.id);
		const lastTouchSession = working || !sorted.length ? null : { startDate: sorted[0].startDate };

		const touchSessionId = working?.id ?? sorted[0]?.id ?? null;
		let lastEditedAt: string | null = null;
		if (touchSessionId) {
			const latestPlan = db
				.select({ builderConfig: mealPlans.builderConfig })
				.from(mealPlans)
				.where(eq(mealPlans.sessionId, touchSessionId))
				.orderBy(desc(mealPlans.id))
				.limit(1)
				.get();
			if (latestPlan?.builderConfig) {
				try {
					const cfg = JSON.parse(latestPlan.builderConfig) as { lastEditedAt?: unknown };
					lastEditedAt = typeof cfg.lastEditedAt === 'string' ? cfg.lastEditedAt : null;
				} catch {
					lastEditedAt = null;
				}
			}
		}

		return {
			...user,
			latestSession: working ? { ...working, lastUpdatedAt: lastEditedAt ?? working.startDate } : null,
			lastTouchSession: lastTouchSession
				? { ...lastTouchSession, lastUpdatedAt: lastEditedAt ?? lastTouchSession.startDate }
				: null
		};
	});

	return { patients };
}

export async function actionCreateMealPlanSession(params: {
	dietitianId: number;
	formData: FormData;
}): Promise<ActionFailure<{ error: string }> | never> {
	const { dietitianId, formData } = params;
	const clientId = parseInt(formData.get('clientId')?.toString() ?? '0');
	if (!clientId) return fail(400, { error: 'يرجى اختيار عميل' });

	const dietitianMembership = db
		.select({ orgId: memberships.organizationId })
		.from(memberships)
		.where(eq(memberships.userId, dietitianId))
		.get();

	if (!dietitianMembership) {
		return fail(403, { error: 'لا يمكن إنشاء جلسة بدون عضوية في مؤسسة' });
	}

	const clientMembership = db
		.select({ roles: memberships.roles })
		.from(memberships)
		.where(and(eq(memberships.userId, clientId), eq(memberships.organizationId, dietitianMembership.orgId)))
		.get();

	if (!clientMembership) {
		return fail(403, { error: 'العميل غير موجود في مؤسستك' });
	}

	const isPatient = (clientMembership.roles ?? '').toLowerCase();
	if (!isPatient.includes('patient') && !isPatient.includes('client')) {
		return fail(400, { error: 'المستخدم المحدد ليس عميلاً' });
	}

	const today = new Date().toISOString().split('T')[0];
	const endDate = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

	let targetSessionId: number;
	try {
		targetSessionId = db.transaction(
			(tx) => {
				const working = resolveWorkingSessionTx(clientId, dietitianId, tx);
				if (working) return working.id;
				const result = tx
					.insert(mealPlanSessions)
					.values({
						clientId,
						dietitianId,
						startDate: today,
						endDate: endDate,
						status: 'draft'
					})
					.run();
				return Number(result.lastInsertRowid);
			},
			{ behavior: 'immediate' }
		);
	} catch (e) {
		if (e instanceof Database.SqliteError && e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
			const working = resolveWorkingSession(clientId, dietitianId);
			if (working) redirect(302, `/dietitian/meal-plan/${working.id}`);
		}
		throw e;
	}

	redirect(302, `/dietitian/meal-plan/${targetSessionId}`);
}

export type ActivatePatientResult =
	| { ok: true; message: string }
	| { ok: false; error: string };

/**
 * Activates a patient account by email: grants app access and attaches them to the dietitian's organization
 * (replacing a solo registration org membership when needed).
 */
export async function activatePatientByEmail(params: {
	dietitianId: number;
	emailRaw: string;
}): Promise<ActivatePatientResult> {
	const email = params.emailRaw.trim().toLowerCase();
	if (!email) {
		return { ok: false, error: 'يرجى إدخال البريد الإلكتروني' };
	}
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
		return { ok: false, error: 'صيغة البريد الإلكتروني غير صحيحة' };
	}

	const dietitianMembership = db
		.select({ orgId: memberships.organizationId })
		.from(memberships)
		.where(eq(memberships.userId, params.dietitianId))
		.get();

	if (!dietitianMembership) {
		return { ok: false, error: 'لا يمكن التفعيل بدون عضوية في مؤسسة' };
	}

	const patientRow = await findUserByEmail(email);
	if (!patientRow) {
		return { ok: false, error: 'لا يوجد مستخدم بهذا البريد' };
	}

	if (patientRow.id === params.dietitianId) {
		return { ok: false, error: 'لا يمكنك تفعيل حسابك الخاص بهذه الطريقة' };
	}

	const patientMemberships = db
		.select({
			organizationId: memberships.organizationId,
			roles: memberships.roles
		})
		.from(memberships)
		.where(eq(memberships.userId, patientRow.id))
		.all();

	if (!patientMemberships.length) {
		return { ok: false, error: 'هذا الحساب لا يملك عضوية — تواصل مع الدعم' };
	}

	for (const m of patientMemberships) {
		const appRole = membershipRolesToAppRole(m.roles);
		if (appRole === 'dietitian') {
			return { ok: false, error: 'هذا البريد مسجّل كأخصائي تغذية وليس كمريض' };
		}
	}

	const alreadyInOrg = patientMemberships.some(
		(m) => m.organizationId === dietitianMembership.orgId
	);
	const now = new Date().toISOString();

	if (alreadyInOrg) {
		if (patientRow.canAccessPatientApp) {
			return {
				ok: true,
				message: 'هذا المريض مفعّل ومضاف إلى عيادتك بالفعل'
			};
		}
		db.update(users)
			.set({ canAccessPatientApp: true, updatedAt: now })
			.where(eq(users.id, patientRow.id))
			.run();
		return { ok: true, message: 'تم تفعيل الوصول للمريض بنجاح' };
	}

	try {
		db.transaction((tx) => {
			tx.delete(memberships).where(eq(memberships.userId, patientRow.id)).run();
			tx.insert(memberships)
				.values({
					organizationId: dietitianMembership.orgId,
					userId: patientRow.id,
					roles: JSON.stringify(['patient']),
					createdAt: now,
					updatedAt: now
				})
				.run();
			tx.update(users)
				.set({ canAccessPatientApp: true, updatedAt: now })
				.where(eq(users.id, patientRow.id))
				.run();
		});
	} catch (e) {
		console.error(e);
		return { ok: false, error: 'تعذر إكمال التفعيل — حاول مرة أخرى' };
	}

	return {
		ok: true,
		message: 'تم تفعيل المريض وربطه بعيادتك. يمكنه الآن تسجيل الدخول واستخدام التطبيق'
	};
}
