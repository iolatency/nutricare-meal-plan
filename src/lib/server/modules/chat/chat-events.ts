/**
 * Process-local pub/sub for chat SSE. Multi-instance deployments need Redis or similar.
 */
type ChatSsePayload =
	| {
			type: 'message.created';
			message: {
				id: string;
				conversationId: number;
				senderUserId: number;
				body: string;
				createdAt: string;
				readAt: string | null;
			};
	  }
	| {
			type: 'message.read.updated';
			conversationId: number;
			updated: number;
			readAt: string;
			readerUserId: number;
	  };

const subscribers = new Map<number, Set<ReadableStreamDefaultController>>();

function encodeSse(payload: ChatSsePayload): Uint8Array {
	const line = `data: ${JSON.stringify(payload)}\n\n`;
	return new TextEncoder().encode(line);
}

export function subscribeConversation(
	conversationId: number,
	controller: ReadableStreamDefaultController
): () => void {
	let set = subscribers.get(conversationId);
	if (!set) {
		set = new Set();
		subscribers.set(conversationId, set);
	}
	set.add(controller);
	return () => {
		set!.delete(controller);
		if (set!.size === 0) subscribers.delete(conversationId);
	};
}

export function publishChatEvent(conversationId: number, payload: ChatSsePayload): void {
	const set = subscribers.get(conversationId);
	if (!set?.size) return;
	const chunk = encodeSse(payload);
	for (const c of set) {
		try {
			c.enqueue(chunk);
		} catch {
			// stream closed
		}
	}
}
