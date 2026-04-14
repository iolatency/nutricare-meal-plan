export type ChatUserSnippet = {
	id: number;
	phone: string | null;
	name: string;
};

export type ChatConversation = {
	id: number;
	dietitianId: number;
	clientId: number;
	clientUser: ChatUserSnippet | null;
	dietitianUser: ChatUserSnippet | null;
	lastMessageBody: string | null;
	lastMessageAt: string | null;
	unreadCount: number;
	createdAt: string;
	updatedAt: string;
};

export type ChatMessage = {
	id: string;
	conversationId: number;
	senderUserId: number;
	body: string;
	createdAt: string;
	readAt: string | null;
};

export type ChatSseEvent =
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

async function parseJson<T>(res: Response): Promise<T> {
	if (!res.ok) {
		const text = await res.text();
		throw new Error(text || res.statusText);
	}
	return res.json() as Promise<T>;
}

export async function listConversations(): Promise<ChatConversation[]> {
	const res = await fetch('/api/chat/conversations', { credentials: 'include' });
	return parseJson<ChatConversation[]>(res);
}

export async function getOrCreateConversation(payload?: {
	clientId?: number;
}): Promise<ChatConversation> {
	const res = await fetch('/api/chat/conversations/get-or-create', {
		method: 'POST',
		credentials: 'include',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(payload ?? {})
	});
	return parseJson<ChatConversation>(res);
}

export async function listMessages(
	conversationId: number,
	opts?: { limit?: number; offset?: number }
): Promise<{ results: ChatMessage[]; count: number; limit: number; offset: number }> {
	const sp = new URLSearchParams();
	if (opts?.limit != null) sp.set('limit', String(opts.limit));
	if (opts?.offset != null) sp.set('offset', String(opts.offset));
	const q = sp.toString();
	const res = await fetch(`/api/chat/conversations/${conversationId}/messages${q ? `?${q}` : ''}`, {
		credentials: 'include'
	});
	return parseJson(res);
}

export async function sendMessage(conversationId: number, body: string): Promise<ChatMessage> {
	const res = await fetch(`/api/chat/conversations/${conversationId}/messages`, {
		method: 'POST',
		credentials: 'include',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ body })
	});
	return parseJson<ChatMessage>(res);
}

export async function markRead(
	conversationId: number
): Promise<{ updated: number; readAt: string }> {
	const res = await fetch(`/api/chat/conversations/${conversationId}/mark-read`, {
		method: 'POST',
		credentials: 'include'
	});
	return parseJson(res);
}

export function openChatEventSource(
	conversationId: number,
	onEvent: (ev: ChatSseEvent) => void,
	opts?: {
		onConnectionChange?: (open: boolean) => void;
	}
): { close: () => void } {
	const es = new EventSource(`/api/chat/conversations/${conversationId}/events`);
	es.onopen = () => opts?.onConnectionChange?.(true);
	es.onmessage = (evt) => {
		try {
			const data = JSON.parse(evt.data) as ChatSseEvent;
			onEvent(data);
		} catch {
			// ignore parse errors (e.g. comments)
		}
	};
	es.onerror = () => {
		if (es.readyState === EventSource.CLOSED) opts?.onConnectionChange?.(false);
	};
	return {
		close: () => {
			opts?.onConnectionChange?.(false);
			es.close();
		}
	};
}
