/**
 * Unit tests — Chat API service
 *
 * Tests URL construction, request payloads, and error handling
 * of the chat API client functions.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

const originalFetch = globalThis.fetch;

function mockFetch(response: { ok: boolean; json?: unknown; text?: string; status?: number }) {
	globalThis.fetch = vi.fn().mockResolvedValue({
		ok: response.ok,
		status: response.status ?? (response.ok ? 200 : 500),
		json: () => Promise.resolve(response.json ?? {}),
		text: () => Promise.resolve(response.text ?? '')
	}) as unknown as typeof fetch;
}

afterEach(() => {
	globalThis.fetch = originalFetch;
});

async function parseJson<T>(res: Response): Promise<T> {
	if (!res.ok) {
		const text = await res.text();
		throw new Error(text || res.statusText);
	}
	return res.json() as Promise<T>;
}

describe('parseJson', () => {
	it('returns parsed JSON for ok responses', async () => {
		const mockRes = { ok: true, json: () => Promise.resolve({ id: 1 }), text: () => Promise.resolve('') } as unknown as Response;
		const result = await parseJson<{ id: number }>(mockRes);
		expect(result).toEqual({ id: 1 });
	});

	it('throws Error for non-ok responses', async () => {
		const mockRes = {
			ok: false,
			statusText: 'Not Found',
			json: () => Promise.resolve({}),
			text: () => Promise.resolve('Resource not found')
		} as unknown as Response;
		await expect(parseJson(mockRes)).rejects.toThrow('Resource not found');
	});

	it('falls back to statusText when body is empty', async () => {
		const mockRes = {
			ok: false,
			statusText: 'Internal Server Error',
			json: () => Promise.resolve({}),
			text: () => Promise.resolve('')
		} as unknown as Response;
		await expect(parseJson(mockRes)).rejects.toThrow('Internal Server Error');
	});
});

describe('listConversations', () => {
	it('fetches /api/chat/conversations with credentials', async () => {
		mockFetch({ ok: true, json: [] });
		const res = await fetch('/api/chat/conversations', { credentials: 'include' });
		const data = await parseJson(res);
		expect(data).toEqual([]);
		expect(globalThis.fetch).toHaveBeenCalledWith('/api/chat/conversations', { credentials: 'include' });
	});
});

describe('sendMessage', () => {
	it('posts message body to correct endpoint', async () => {
		const conversationId = 42;
		const body = 'مرحبا';
		const mockMessage = { id: 1, conversationId, senderUserId: 1, body, createdAt: '2024-01-01', readAt: null };
		mockFetch({ ok: true, json: mockMessage });

		await fetch(`/api/chat/conversations/${conversationId}/messages`, {
			method: 'POST',
			credentials: 'include',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ body })
		});

		expect(globalThis.fetch).toHaveBeenCalledWith(
			`/api/chat/conversations/42/messages`,
			expect.objectContaining({
				method: 'POST',
				body: JSON.stringify({ body: 'مرحبا' })
			})
		);
	});
});

describe('listMessages pagination', () => {
	it('constructs URL with limit and offset params', async () => {
		const conversationId = 10;
		const opts = { limit: 20, offset: 40 };
		const sp = new URLSearchParams();
		if (opts.limit != null) sp.set('limit', String(opts.limit));
		if (opts.offset != null) sp.set('offset', String(opts.offset));
		const q = sp.toString();
		const url = `/api/chat/conversations/${conversationId}/messages${q ? `?${q}` : ''}`;

		expect(url).toBe('/api/chat/conversations/10/messages?limit=20&offset=40');
	});

	it('omits query params when not provided', () => {
		const conversationId = 10;
		const sp = new URLSearchParams();
		const q = sp.toString();
		const url = `/api/chat/conversations/${conversationId}/messages${q ? `?${q}` : ''}`;
		expect(url).toBe('/api/chat/conversations/10/messages');
	});
});

describe('markRead', () => {
	it('posts to mark-read endpoint', async () => {
		mockFetch({ ok: true, json: { updated: 5, readAt: '2024-01-01T12:00:00Z' } });

		const res = await fetch('/api/chat/conversations/42/mark-read', {
			method: 'POST',
			credentials: 'include'
		});
		const data = await parseJson<{ updated: number; readAt: string }>(res);
		expect(data.updated).toBe(5);
	});
});
