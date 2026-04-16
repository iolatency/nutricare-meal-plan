/**
 * Unit tests — Session resolution (in-memory row picker)
 *
 * Tests resolveWorkingSessionFromRows which operates on pre-fetched rows
 * without requiring a database connection.
 */
import { describe, it, expect } from 'vitest';

type SessionListRow = {
	id: number;
	clientId: number;
	status: 'draft' | 'active' | 'completed';
	startDate: string;
};

function resolveWorkingSessionFromRows(rows: SessionListRow[]): SessionListRow | null {
	if (!rows.length) return null;
	const sorted = [...rows].sort((a, b) => b.id - a.id);
	return sorted.find((s) => s.status === 'active') ?? sorted.find((s) => s.status === 'draft') ?? null;
}

const makeRow = (id: number, status: SessionListRow['status']): SessionListRow => ({
	id,
	clientId: 1,
	status,
	startDate: '2024-01-01'
});

describe('resolveWorkingSessionFromRows', () => {
	it('returns null for empty array', () => {
		expect(resolveWorkingSessionFromRows([])).toBeNull();
	});

	it('returns the only active session', () => {
		const rows = [makeRow(1, 'active')];
		expect(resolveWorkingSessionFromRows(rows)?.id).toBe(1);
	});

	it('returns the only draft session', () => {
		const rows = [makeRow(1, 'draft')];
		expect(resolveWorkingSessionFromRows(rows)?.id).toBe(1);
	});

	it('returns null when only completed sessions exist', () => {
		const rows = [makeRow(1, 'completed'), makeRow(2, 'completed')];
		expect(resolveWorkingSessionFromRows(rows)).toBeNull();
	});

	it('prefers active over draft', () => {
		const rows = [makeRow(10, 'draft'), makeRow(5, 'active')];
		const result = resolveWorkingSessionFromRows(rows);
		expect(result?.status).toBe('active');
		expect(result?.id).toBe(5);
	});

	it('picks the highest-id active session when multiple exist', () => {
		const rows = [makeRow(1, 'active'), makeRow(3, 'active'), makeRow(2, 'active')];
		expect(resolveWorkingSessionFromRows(rows)?.id).toBe(3);
	});

	it('picks the highest-id draft when no active exists', () => {
		const rows = [makeRow(1, 'draft'), makeRow(5, 'draft'), makeRow(2, 'completed')];
		expect(resolveWorkingSessionFromRows(rows)?.id).toBe(5);
	});

	it('prefers active even if draft has higher id', () => {
		const rows = [makeRow(100, 'draft'), makeRow(1, 'active')];
		expect(resolveWorkingSessionFromRows(rows)?.status).toBe('active');
	});

	it('handles mixed statuses correctly', () => {
		const rows = [
			makeRow(1, 'completed'),
			makeRow(2, 'draft'),
			makeRow(3, 'active'),
			makeRow(4, 'completed'),
			makeRow(5, 'draft')
		];
		expect(resolveWorkingSessionFromRows(rows)?.id).toBe(3);
	});

	it('does not mutate the input array', () => {
		const rows = [makeRow(2, 'draft'), makeRow(1, 'active')];
		const copy = [...rows];
		resolveWorkingSessionFromRows(rows);
		expect(rows).toEqual(copy);
	});
});
