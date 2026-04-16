/**
 * Data Integrity — Recipe deduplication
 *
 * Verifies that the patient recipes endpoint logic correctly deduplicates
 * recipes that appear in multiple meals/sessions.
 */
import { describe, it, expect } from 'vitest';

// Pure function extracted from the endpoint logic for unit testing
type MealRow = { recipeId: number | null; mealDayId: number };
type SessionInfo = {
	sessionId: number;
	startDate: string;
	endDate: string;
	status: 'draft' | 'active' | 'completed';
	lastUsedDate: string | null;
};

function buildRecipeToSessionMap(
	sessions: Array<{ id: number; startDate: string; endDate: string; status: 'draft' | 'active' | 'completed' }>,
	getMealsForSession: (sessionId: number) => MealRow[],
	getDateForMeal: (mealDayId: number) => string | null
): Map<number, SessionInfo> {
	const map = new Map<number, SessionInfo>();

	for (const session of sessions) {
		const mealRows = getMealsForSession(session.id);
		for (const meal of mealRows) {
			if (!meal.recipeId) continue;
			const date = getDateForMeal(meal.mealDayId);
			if (!map.has(meal.recipeId)) {
				map.set(meal.recipeId, {
					sessionId: session.id,
					startDate: session.startDate,
					endDate: session.endDate,
					status: session.status,
					lastUsedDate: date
				});
			} else {
				const existing = map.get(meal.recipeId)!;
				if (date && (!existing.lastUsedDate || date > existing.lastUsedDate)) {
					existing.lastUsedDate = date;
				}
			}
		}
	}

	return map;
}

describe('Recipe deduplication', () => {
	const sessions = [
		{ id: 1, startDate: '2026-01-01', endDate: '2026-01-07', status: 'completed' as const },
		{ id: 2, startDate: '2026-01-08', endDate: '2026-01-14', status: 'active' as const }
	];

	const meals: Record<number, MealRow[]> = {
		1: [{ recipeId: 10, mealDayId: 1 }, { recipeId: 20, mealDayId: 2 }],
		2: [{ recipeId: 10, mealDayId: 3 }, { recipeId: 30, mealDayId: 4 }] // recipe 10 used again
	};

	const dates: Record<number, string> = {
		1: '2026-01-01',
		2: '2026-01-02',
		3: '2026-01-10',
		4: '2026-01-11'
	};

	it('deduplicates recipes used in multiple sessions', () => {
		const map = buildRecipeToSessionMap(
			sessions,
			(sid) => meals[sid] ?? [],
			(mid) => dates[mid] ?? null
		);

		// Recipes 10, 20, 30 — 3 unique, not 4
		expect(map.size).toBe(3);
		expect(map.has(10)).toBe(true);
		expect(map.has(20)).toBe(true);
		expect(map.has(30)).toBe(true);
	});

	it('assigns recipe to the FIRST session it appears in', () => {
		const map = buildRecipeToSessionMap(
			sessions,
			(sid) => meals[sid] ?? [],
			(mid) => dates[mid] ?? null
		);

		// Recipe 10 first appeared in session 1
		expect(map.get(10)?.sessionId).toBe(1);
	});

	it('tracks the most recent lastUsedDate across all sessions', () => {
		const map = buildRecipeToSessionMap(
			sessions,
			(sid) => meals[sid] ?? [],
			(mid) => dates[mid] ?? null
		);

		// Recipe 10 was used on 2026-01-01 (session 1) and 2026-01-10 (session 2)
		// lastUsedDate should be the later date
		expect(map.get(10)?.lastUsedDate).toBe('2026-01-10');
	});

	it('handles recipes not in any session', () => {
		const map = buildRecipeToSessionMap(
			sessions,
			(_sid) => [],
			(_mid) => null
		);
		expect(map.size).toBe(0);
	});

	it('skips null recipeIds', () => {
		const map = buildRecipeToSessionMap(
			[{ id: 1, startDate: '2026-01-01', endDate: '2026-01-07', status: 'active' }],
			() => [{ recipeId: null, mealDayId: 1 }, { recipeId: 5, mealDayId: 2 }],
			() => '2026-01-01'
		);
		expect(map.size).toBe(1);
		expect(map.has(5)).toBe(true);
	});
});
