import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { requireUser } from '$lib/server/authz/policy';
import {
	ChatForbiddenError,
	ChatValidationError,
	getOrCreateForPatient,
	listMessages
} from '$lib/server/modules/chat/chat.service';

export const load: PageServerLoad = async ({ locals }) => {
	const user = requireUser(locals.user);
	if (user.role !== 'patient') redirect(302, '/');

	try {
		const conversation = getOrCreateForPatient(user.id);
		const { results } = listMessages(conversation.id, user.id, { limit: 50, offset: 0 });
		return {
			conversation,
			initialMessages: results,
			chatError: null as string | null,
			user
		};
	} catch (e) {
		if (e instanceof ChatValidationError || e instanceof ChatForbiddenError) {
			return {
				conversation: null,
				initialMessages: [],
				chatError: e.message,
				user
			};
		}
		throw e;
	}
};
