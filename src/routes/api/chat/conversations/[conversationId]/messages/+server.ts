import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { requireUser } from '$lib/server/authz/policy';
import {
	ChatForbiddenError,
	ChatNotFoundError,
	ChatValidationError,
	createMessage,
	listMessages
} from '$lib/server/modules/chat/chat.service';

function parsePaging(url: URL) {
	const limitRaw = parseInt(url.searchParams.get('limit') ?? '50', 10);
	const offsetRaw = parseInt(url.searchParams.get('offset') ?? '0', 10);
	const limit = Math.min(100, Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 50);
	const offset = Math.max(0, Number.isFinite(offsetRaw) ? offsetRaw : 0);
	return { limit, offset };
}

export const GET: RequestHandler = async ({ params, url, locals }) => {
	const user = requireUser(locals.user);
	const conversationId = parseInt(params.conversationId, 10);
	if (!Number.isFinite(conversationId)) throw error(400, 'Invalid conversation');
	const { limit, offset } = parsePaging(url);
	try {
		const { results, count } = listMessages(conversationId, user.id, { limit, offset });
		return json({ results, count, limit, offset });
	} catch (e) {
		if (e instanceof ChatForbiddenError) throw error(403, e.message);
		if (e instanceof ChatNotFoundError) throw error(404, e.message);
		throw error(500, 'Chat error');
	}
};

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const user = requireUser(locals.user);
	const conversationId = parseInt(params.conversationId, 10);
	if (!Number.isFinite(conversationId)) throw error(400, 'Invalid conversation');
	const body = (await request.json().catch(() => ({}))) as { body?: string };
	try {
		const msg = createMessage(conversationId, user.id, body.body ?? '');
		return json(msg, { status: 201 });
	} catch (e) {
		if (e instanceof ChatValidationError) throw error(400, e.message);
		if (e instanceof ChatForbiddenError) throw error(403, e.message);
		if (e instanceof ChatNotFoundError) throw error(404, e.message);
		throw error(500, 'Chat error');
	}
};
