import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { requireUser } from '$lib/server/authz/policy';
import {
	ChatForbiddenError,
	ChatValidationError,
	getOrCreateForPatient,
	listMessages,
	resolveDietitianIdForPatient
} from '$lib/server/modules/chat/chat.service';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export const load: PageServerLoad = async ({ locals }) => {
	const user = requireUser(locals.user);
	if (user.role !== 'patient') redirect(302, '/');

	// Resolve dietitian ID so the client can poll presence
	const dietitianId = resolveDietitianIdForPatient(user.id);
	let dietitianName: string | null = null;
	if (dietitianId) {
		const d = db.select({ name: users.name }).from(users).where(eq(users.id, dietitianId)).get();
		dietitianName = d?.name ?? null;
	}

	try {
		const conversation = getOrCreateForPatient(user.id);
		const { results } = listMessages(conversation.id, user.id, { limit: 50, offset: 0 });
		return {
			conversation,
			initialMessages: results,
			chatError: null as string | null,
			user,
			dietitianId,
			dietitianName
		};
	} catch (e) {
		if (e instanceof ChatValidationError || e instanceof ChatForbiddenError) {
			return {
				conversation: null,
				initialMessages: [],
				chatError: e.message,
				user,
				dietitianId,
				dietitianName
			};
		}
		throw e;
	}
};
