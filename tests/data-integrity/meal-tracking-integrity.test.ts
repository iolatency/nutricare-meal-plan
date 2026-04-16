/**
 * Data Integrity — Meal tracking
 *
 * Tests that the upsert logic for meal tracking prevents duplicate rows.
 */
import { describe, it, expect } from 'vitest';

type TrackingRow = {
	sessionId: number;
	mealId: number;
	date: string;
	status: 'eaten' | 'skipped' | 'not_eaten';
};

// Simulates the upsert pattern used in setMealStatus()
function upsertTracking(
	existing: TrackingRow[],
	sessionId: number,
	mealId: number,
	date: string,
	status: TrackingRow['status']
): TrackingRow[] {
	const idx = existing.findIndex(
		(r) => r.sessionId === sessionId && r.mealId === mealId && r.date === date
	);
	if (idx >= 0) {
		// Update
		return existing.map((r, i) => (i === idx ? { ...r, status } : r));
	}
	// Insert
	return [...existing, { sessionId, mealId, date, status }];
}

describe('Meal tracking upsert logic', () => {
	it('inserts a new row when no existing record', () => {
		const result = upsertTracking([], 1, 10, '2026-04-14', 'eaten');
		expect(result).toHaveLength(1);
		expect(result[0].status).toBe('eaten');
	});

	it('updates existing row instead of inserting duplicate', () => {
		const initial: TrackingRow[] = [{ sessionId: 1, mealId: 10, date: '2026-04-14', status: 'not_eaten' }];
		const result = upsertTracking(initial, 1, 10, '2026-04-14', 'eaten');
		expect(result).toHaveLength(1); // No duplicate
		expect(result[0].status).toBe('eaten'); // Status updated
	});

	it('does not affect other meal rows when updating', () => {
		const initial: TrackingRow[] = [
			{ sessionId: 1, mealId: 10, date: '2026-04-14', status: 'not_eaten' },
			{ sessionId: 1, mealId: 20, date: '2026-04-14', status: 'eaten' }
		];
		const result = upsertTracking(initial, 1, 10, '2026-04-14', 'skipped');
		expect(result).toHaveLength(2);
		expect(result.find((r) => r.mealId === 20)?.status).toBe('eaten'); // Unchanged
		expect(result.find((r) => r.mealId === 10)?.status).toBe('skipped'); // Updated
	});

	it('allows same meal tracked on different dates (no false duplicate)', () => {
		const initial: TrackingRow[] = [{ sessionId: 1, mealId: 10, date: '2026-04-14', status: 'eaten' }];
		const result = upsertTracking(initial, 1, 10, '2026-04-15', 'not_eaten');
		expect(result).toHaveLength(2); // Different date = new row
	});
});
