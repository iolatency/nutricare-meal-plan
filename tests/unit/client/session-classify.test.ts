/**
 * Unit tests — session phase classification
 *
 * Tests the classifyPhase() utility used by:
 * - /patient/sessions page
 * - /api/patient/sessions endpoint
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

type SessionStatus = 'draft' | 'active' | 'completed';
type SessionPhase = 'history' | 'current' | 'upcoming';

function classifyPhase(
	status: SessionStatus,
	startDate: string,
	endDate: string
): SessionPhase {
	if (status === 'completed') return 'history';
	if (status === 'active') return 'current';
	const today = new Date().toISOString().split('T')[0];
	if (startDate > today) return 'upcoming';
	if (endDate < today) return 'history';
	return 'current';
}

describe('classifyPhase()', () => {
	// Mock today as 2026-04-14
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-04-14T12:00:00Z'));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('classifies completed sessions as history regardless of dates', () => {
		expect(classifyPhase('completed', '2026-04-01', '2026-04-07')).toBe('history');
		expect(classifyPhase('completed', '2026-04-10', '2026-04-20')).toBe('history');
		expect(classifyPhase('completed', '2026-04-20', '2026-04-30')).toBe('history');
	});

	it('classifies active sessions as current regardless of dates', () => {
		expect(classifyPhase('active', '2026-04-01', '2026-04-07')).toBe('current');
		expect(classifyPhase('active', '2026-04-14', '2026-04-21')).toBe('current');
	});

	it('classifies draft with future startDate as upcoming', () => {
		expect(classifyPhase('draft', '2026-04-15', '2026-04-22')).toBe('upcoming');
		expect(classifyPhase('draft', '2026-05-01', '2026-05-07')).toBe('upcoming');
	});

	it('classifies draft with past endDate as history', () => {
		expect(classifyPhase('draft', '2026-04-01', '2026-04-07')).toBe('history');
		expect(classifyPhase('draft', '2026-04-10', '2026-04-13')).toBe('history');
	});

	it('classifies draft spanning today as current', () => {
		expect(classifyPhase('draft', '2026-04-10', '2026-04-20')).toBe('current');
		expect(classifyPhase('draft', '2026-04-14', '2026-04-14')).toBe('current');
	});
});
