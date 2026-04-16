import { json, error, type RequestHandler } from '@sveltejs/kit';
import crypto from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { requireUser } from '$lib/server/authz/policy';
import { db } from '$lib/server/db';
import { mealPlanSessions, mealPlanShareLinks } from '$lib/server/db/schema';

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

type Body = {
	sessionId?: number;
	scope?: 'day' | 'week';
	anchorDate?: string;
};

export const POST: RequestHandler = async ({ request, locals, url }) => {
	const user = requireUser(locals.user);
	if (user.role !== 'dietitian') throw error(403, 'غير مصرح');

	const body = (await request.json().catch(() => ({}))) as Body;
	const sessionId = Number(body.sessionId);
	const scope = body.scope;
	const anchorDate = String(body.anchorDate ?? '');

	if (!Number.isFinite(sessionId) || sessionId <= 0) throw error(400, 'sessionId غير صالح');
	if (scope !== 'day' && scope !== 'week') throw error(400, 'scope غير صالح');
	if (!YMD_RE.test(anchorDate)) throw error(400, 'anchorDate غير صالح');

	const session = db
		.select({
			id: mealPlanSessions.id,
			clientId: mealPlanSessions.clientId,
			dietitianId: mealPlanSessions.dietitianId
		})
		.from(mealPlanSessions)
		.where(and(eq(mealPlanSessions.id, sessionId), eq(mealPlanSessions.dietitianId, user.id)))
		.get();

	if (!session) throw error(404, 'الجلسة غير موجودة');

	const token = crypto.randomBytes(24).toString('base64url');
	const expiresAtIso = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
	const createdAtIso = new Date().toISOString();

	try {
		db.insert(mealPlanShareLinks)
			.values({
				sessionId: session.id,
				createdBy: user.id,
				scope,
				anchorDate,
				token,
				expiresAt: expiresAtIso,
				createdAt: createdAtIso,
				revokedAt: null
			})
			.run();
	} catch (err) {
		console.error('[meal-plan/share] failed to create share link', err);
		throw error(500, 'تعذر إنشاء رابط المشاركة. تأكد من ترقية قاعدة البيانات ثم أعد المحاولة.');
	}

	const shareUrl = `${url.origin}/share/meal-plan/${token}`;

	return json({
		success: true,
		url: shareUrl,
		token,
		expiresAt: expiresAtIso
	});
};
