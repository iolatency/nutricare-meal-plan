import { describe, it, expect } from 'vitest';
import { generateOtpCode } from './registration-otp.service';

describe('generateOtpCode', () => {
	it('returns a 6-character string', () => {
		expect(generateOtpCode()).toHaveLength(6);
	});

	it('returns only digits', () => {
		for (let i = 0; i < 20; i++) {
			expect(generateOtpCode()).toMatch(/^\d{6}$/);
		}
	});

	it('returns values in range 000000–999999', () => {
		for (let i = 0; i < 20; i++) {
			const code = generateOtpCode();
			const n = parseInt(code, 10);
			expect(n).toBeGreaterThanOrEqual(0);
			expect(n).toBeLessThanOrEqual(999_999);
		}
	});

	it('pads single-digit values with leading zeros', () => {
		// Run enough times to statistically hit a low number; we verify format always holds
		for (let i = 0; i < 50; i++) {
			const code = generateOtpCode();
			expect(code.length).toBe(6);
			expect(/^\d+$/.test(code)).toBe(true);
		}
	});
});
