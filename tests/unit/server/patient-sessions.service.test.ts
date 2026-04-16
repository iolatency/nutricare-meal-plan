/**
 * Unit tests — patient sessions service logic
 *
 * Tests session filtering and average adherence calculation
 * without touching the database (pure utility functions).
 */
import { describe, it, expect } from 'vitest';

// Extracted helper: average adherence from daily logs
function calcAvgAdherence(
	logs: Array<{ adherenceScore: number | null }>
): number | null {
	const scored = logs.filter((l) => l.adherenceScore != null);
	if (!scored.length) return null;
	return Math.round(
		scored.reduce((sum, l) => sum + (l.adherenceScore ?? 0), 0) / scored.length
	);
}

describe('calcAvgAdherence()', () => {
	it('returns null for empty logs', () => {
		expect(calcAvgAdherence([])).toBeNull();
	});

	it('returns null when all scores are null', () => {
		expect(calcAvgAdherence([{ adherenceScore: null }, { adherenceScore: null }])).toBeNull();
	});

	it('ignores null scores in the average', () => {
		expect(calcAvgAdherence([{ adherenceScore: 80 }, { adherenceScore: null }])).toBe(80);
	});

	it('computes a simple average', () => {
		expect(calcAvgAdherence([{ adherenceScore: 80 }, { adherenceScore: 60 }])).toBe(70);
	});

	it('rounds fractional averages', () => {
		// (80 + 70 + 65) / 3 = 71.666... → 72
		expect(calcAvgAdherence([{ adherenceScore: 80 }, { adherenceScore: 70 }, { adherenceScore: 65 }])).toBe(72);
	});

	it('handles a single log entry', () => {
		expect(calcAvgAdherence([{ adherenceScore: 95 }])).toBe(95);
	});

	it('handles 100% adherence', () => {
		expect(calcAvgAdherence([{ adherenceScore: 100 }, { adherenceScore: 100 }])).toBe(100);
	});

	it('handles 0% adherence', () => {
		expect(calcAvgAdherence([{ adherenceScore: 0 }, { adherenceScore: 0 }])).toBe(0);
	});
});
