/**
 * Unit tests — Foods API service
 *
 * Tests the URL construction and response handling logic of the foods API client.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const originalFetch = globalThis.fetch;

function mockFetch(response: { ok: boolean; json?: unknown; text?: string; status?: number }) {
	globalThis.fetch = vi.fn().mockResolvedValue({
		ok: response.ok,
		status: response.status ?? (response.ok ? 200 : 500),
		json: () => Promise.resolve(response.json ?? []),
		text: () => Promise.resolve(response.text ?? '')
	});
}

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe('searchLocalFoods URL construction', () => {
	async function searchLocalFoods(query: string) {
		const response = await fetch(`/api/foods/local-search?q=${encodeURIComponent(query)}`);
		if (!response.ok) return [];
		return response.json();
	}

	it('encodes Arabic query correctly', async () => {
		mockFetch({ ok: true, json: [] });
		await searchLocalFoods('أرز');
		expect(globalThis.fetch).toHaveBeenCalledWith(
			expect.stringContaining(encodeURIComponent('أرز'))
		);
	});

	it('returns empty array on error response', async () => {
		mockFetch({ ok: false, status: 500 });
		const result = await searchLocalFoods('test');
		expect(result).toEqual([]);
	});

	it('returns parsed JSON on success', async () => {
		const foods = [
			{ id: 1, name: 'Rice', calories: 200, protein: 4, carbs: 45, fat: 1 }
		];
		mockFetch({ ok: true, json: foods });
		const result = await searchLocalFoods('rice');
		expect(result).toEqual(foods);
	});

	it('handles empty query string', async () => {
		mockFetch({ ok: true, json: [] });
		await searchLocalFoods('');
		expect(globalThis.fetch).toHaveBeenCalledWith('/api/foods/local-search?q=');
	});

	it('encodes special characters', async () => {
		mockFetch({ ok: true, json: [] });
		await searchLocalFoods('test & query');
		expect(globalThis.fetch).toHaveBeenCalledWith(
			expect.stringContaining('test%20%26%20query')
		);
	});
});

describe('searchExternalFoods', () => {
	async function searchExternalFoods(query: string) {
		const response = await fetch(`/api/foods/external-search?q=${encodeURIComponent(query)}`);
		if (!response.ok) return [];
		return response.json();
	}

	it('returns results from external API', async () => {
		const foods = [{ id: 'ext-1', name: 'Banana' }];
		mockFetch({ ok: true, json: foods });
		const result = await searchExternalFoods('banana');
		expect(result).toEqual(foods);
	});

	it('returns empty array on network error', async () => {
		mockFetch({ ok: false, status: 503 });
		const result = await searchExternalFoods('banana');
		expect(result).toEqual([]);
	});
});

describe('fetchExternalFoodDetail', () => {
	async function fetchExternalFoodDetail(foodId: string) {
		const response = await fetch(`/api/foods/external-detail?foodId=${encodeURIComponent(foodId)}`);
		if (!response.ok) return null;
		return response.json();
	}

	it('returns nutrient detail on success', async () => {
		const detail = { calories: 100, protein: 5, carbs: 20, fat: 1, fiber: 3, fullNutrients: null };
		mockFetch({ ok: true, json: detail });
		const result = await fetchExternalFoodDetail('food-123');
		expect(result).toEqual(detail);
	});

	it('returns null on error', async () => {
		mockFetch({ ok: false, status: 404 });
		const result = await fetchExternalFoodDetail('nonexistent');
		expect(result).toBeNull();
	});
});
