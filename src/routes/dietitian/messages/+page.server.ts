import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { requireUser } from '$lib/server/authz/policy';
import {
	listConversationsForUser,
	loadDietitianChatPatients
} from '$lib/server/modules/chat/chat.service';

export const load: PageServerLoad = async ({ locals }) => {
	const user = requireUser(locals.user);
	if (user.role !== 'dietitian') redirect(302, '/');
	const patients = loadDietitianChatPatients(user.id);
	const conversations = listConversationsForUser(user.id, 'dietitian');
	return { patients, conversations, user: locals.user };
};
