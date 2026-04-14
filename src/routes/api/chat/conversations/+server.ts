import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { requireUser } from '$lib/server/authz/policy';
import { listConversationsForUser } from '$lib/server/modules/chat/chat.service';

export const GET: RequestHandler = async ({ locals }) => {
	const user = requireUser(locals.user);
	if (user.role !== 'dietitian' && user.role !== 'patient') {
		throw error(403, 'Forbidden');
	}
	const list = listConversationsForUser(user.id, user.role);
	return json(list);
};
