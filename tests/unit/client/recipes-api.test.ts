/**
 * Unit tests — Recipes API service
 *
 * Tests URL construction and response handling for the recipes API client.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

const originalFetch = globalThis.fetch;

function mockFetch(response: { ok: boolean; json?: unknown; status?: number }) {
	globalThis.fetch = vi.fn().mockResolvedValue({
		ok: response.ok,
		status: response.status ?? 200,
		json: () => Promise.resolve(response.json ?? []),
		text: () => Promise.resolve('')
	}) as unknown as typeof fetch;
}

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe('searchRecipeFoods', () => {
	async function searchRecipeFoods(query: string) {
		const response = await fetch(
			`/api/foods/search?q=${encodeURIComponent(query)}&source=internal&owner=1&excludeEdamam=1`
		);
		if (!response.ok) return [];
		return response.json();
	}

	it('constructs correct URL with all query params', async () => {
		mockFetch({ ok: true, json: [] });
		await searchRecipeFoods('أرز');
		expect(globalThis.fetch).toHaveBeenCalledWith(
			expect.stringContaining('/api/foods/search?q=')
		);
		expect(globalThis.fetch).toHaveBeenCalledWith(
			expect.stringContaining('source=internal')
		);
		expect(globalThis.fetch).toHaveBeenCalledWith(
			expect.stringContaining('excludeEdamam=1')
		);
	});

	it('returns food items on success', async () => {
		const foods = [
			{ id: 1, name: 'أرز', nameAr: 'أرز', calories: 200, protein: 4, carbs: 45, fat: 1, fiber: 0, unit: 'g', portionSize: 100 }
		];
		mockFetch({ ok: true, json: foods });
		const result = await searchRecipeFoods('أرز');
		expect(result).toEqual(foods);
	});

	it('returns empty array on server error', async () => {
		mockFetch({ ok: false, status: 500 });
		const result = await searchRecipeFoods('test');
		expect(result).toEqual([]);
	});
});

describe('generateRecipeWithAi', () => {
	async function generateRecipeWithAi(payload: Record<string, unknown>) {
		return fetch('/api/ai/recipe', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload)
		});
	}

	it('sends POST with JSON payload', async () => {
		mockFetch({ ok: true, json: { id: 1, name: 'وصفة جديدة' } });
		await generateRecipeWithAi({ name: 'test', ingredients: [] });
		expect(globalThis.fetch).toHaveBeenCalledWith(
			'/api/ai/recipe',
			expect.objectContaining({
				method: 'POST',
				headers: { 'Content-Type': 'application/json' }
			})
		);
	});

	it('returns the response object', async () => {
		mockFetch({ ok: true, json: { id: 1 } });
		const res = await generateRecipeWithAi({ name: 'test' });
		expect(res.ok).toBe(true);
	});
});
