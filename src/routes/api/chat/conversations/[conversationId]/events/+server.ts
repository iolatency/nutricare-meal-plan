import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { requireUser } from '$lib/server/authz/policy';
import {
	assertParticipant,
	getConversationRow,
	ChatForbiddenError
} from '$lib/server/modules/chat/chat.service';
import { subscribeConversation } from '$lib/server/modules/chat/chat-events';

export const GET: RequestHandler = async ({ params, locals }) => {
	const user = requireUser(locals.user);
	const conversationId = parseInt(params.conversationId, 10);
	if (!Number.isFinite(conversationId)) throw error(400, 'Invalid conversation');

	const conv = getConversationRow(conversationId);
	if (!conv) throw error(404, 'Conversation not found');
	try {
		assertParticipant(user.id, conv);
	} catch (e) {
		if (e instanceof ChatForbiddenError) throw error(403, e.message);
		throw e;
	}

	let unsubscribe: (() => void) | undefined;

	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			unsubscribe = subscribeConversation(conversationId, controller);
			controller.enqueue(new TextEncoder().encode(`retry: 8000\n\n`));
		},
		cancel() {
			unsubscribe?.();
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache, no-transform',
			Connection: 'keep-alive'
		}
	});
};
