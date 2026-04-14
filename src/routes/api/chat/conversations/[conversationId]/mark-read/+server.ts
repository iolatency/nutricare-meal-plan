import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { requireUser } from '$lib/server/authz/policy';
import {
	ChatForbiddenError,
	ChatNotFoundError,
	markConversationRead
} from '$lib/server/modules/chat/chat.service';

export const POST: RequestHandler = async ({ params, locals }) => {
	const user = requireUser(locals.user);
	const conversationId = parseInt(params.conversationId, 10);
	if (!Number.isFinite(conversationId)) throw error(400, 'Invalid conversation');
	try {
		const out = markConversationRead(conversationId, user.id);
		return json({ updated: out.updated, readAt: out.readAt });
	} catch (e) {
		if (e instanceof ChatForbiddenError) throw error(403, e.message);
		if (e instanceof ChatNotFoundError) throw error(404, e.message);
		throw error(500, 'Chat error');
	}
};
