import { describe, expect, it } from 'vitest';
import { pickDietitianFromSessionRows } from './chat.service';

describe('pickDietitianFromSessionRows', () => {
	it('returns null for empty rows', () => {
		expect(pickDietitianFromSessionRows([])).toBeNull();
	});

	it('prefers active over newer draft', () => {
		const d = pickDietitianFromSessionRows([
			{ id: 10, dietitianId: 2, status: 'draft' },
			{ id: 5, dietitianId: 1, status: 'active' }
		]);
		expect(d).toBe(1);
	});

	it('picks newest active by id when multiple active', () => {
		const d = pickDietitianFromSessionRows([
			{ id: 1, dietitianId: 1, status: 'active' },
			{ id: 3, dietitianId: 7, status: 'active' }
		]);
		expect(d).toBe(7);
	});

	it('falls back to draft when no active', () => {
		const d = pickDietitianFromSessionRows([
			{ id: 2, dietitianId: 4, status: 'completed' },
			{ id: 5, dietitianId: 9, status: 'draft' }
		]);
		expect(d).toBe(9);
	});

	it('returns null when only completed', () => {
		expect(
			pickDietitianFromSessionRows([
				{ id: 1, dietitianId: 1, status: 'completed' },
				{ id: 2, dietitianId: 2, status: 'completed' }
			])
		).toBeNull();
	});
});
