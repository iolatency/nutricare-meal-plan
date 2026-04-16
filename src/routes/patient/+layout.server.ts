import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { resolveDietitianIdForPatient, listConversationsForUser } from '$lib/server/modules/chat/chat.service';
import { db } from '$lib/server/db';
import { users, mealPlanSessions } from '$lib/server/db/schema';
import { eq, desc } from 'drizzle-orm';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	if (!locals.user) redirect(302, '/login');
	if (locals.user.role !== 'patient') redirect(302, '/');
	if (!locals.user.canAccessPatientApp && !url.pathname.startsWith('/patient/awaiting-activation')) {
		redirect(302, '/patient/awaiting-activation');
	}

	const userId = locals.user.id;

	// Resolve dietitian for this patient
	const dietitianId = resolveDietitianIdForPatient(userId);

	let dietitianName: string | null = null;
	if (dietitianId) {
		const d = db.select({ name: users.name }).from(users).where(eq(users.id, dietitianId)).get();
		dietitianName = d?.name ?? null;
	}

	// Unread message count for the nav badge
	let unreadCount = 0;
	try {
		const conversations = listConversationsForUser(userId, 'patient');
		unreadCount = conversations.reduce((sum, c) => sum + (c.unreadCount ?? 0), 0);
	} catch {
		// ignore — best effort
	}

	// Resolve active session ID for root redirect
	const activeSession = db
		.select({ id: mealPlanSessions.id, status: mealPlanSessions.status })
		.from(mealPlanSessions)
		.where(eq(mealPlanSessions.clientId, userId))
		.orderBy(desc(mealPlanSessions.id))
		.all()
		.find((s) => s.status === 'active');

	return {
		user: locals.user,
		dietitianId,
		dietitianName,
		unreadCount,
		activeSessionId: activeSession?.id ?? null
	};
};
