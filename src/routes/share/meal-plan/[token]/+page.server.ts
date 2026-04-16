import { redirect, error } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import { requireSessionAccess, requireUser } from '$lib/server/authz/policy';
import { db } from '$lib/server/db';
import { mealPlanShareLinks } from '$lib/server/db/schema';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const user = requireUser(locals.user);
	if (user.role !== 'patient') throw error(403, 'الرابط متاح للمريض فقط');
	const token = params.token?.trim();
	if (!token) throw error(404, 'الرابط غير صالح');

	const share = db
		.select({
			sessionId: mealPlanShareLinks.sessionId,
			scope: mealPlanShareLinks.scope,
			anchorDate: mealPlanShareLinks.anchorDate,
			expiresAt: mealPlanShareLinks.expiresAt
		})
		.from(mealPlanShareLinks)
		.where(and(eq(mealPlanShareLinks.token, token), isNull(mealPlanShareLinks.revokedAt)))
		.get();

	if (!share) throw error(404, 'الرابط غير موجود');
	if (Date.parse(share.expiresAt) <= Date.now()) throw error(410, 'انتهت صلاحية الرابط');

	requireSessionAccess(user, share.sessionId);

	const dateParam = encodeURIComponent(share.anchorDate);
	throw redirect(302, `/patient/dashboard/${share.sessionId}?date=${dateParam}`);
};
