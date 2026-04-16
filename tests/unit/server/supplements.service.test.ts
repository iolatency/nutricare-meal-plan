/**
 * Unit tests — Supplement calorie & validation logic
 *
 * Tests pure calculation helpers for supplements without DB.
 */
import { describe, it, expect } from 'vitest';

interface SupplementInput {
	name: string;
	servingSize: number;
	protein: number;
	carbs: number;
	fat: number;
	scoops: number;
}

function calculateTotalKcal(protein: number, carbs: number, fat: number): number {
	return Math.round(protein * 4 + carbs * 4 + fat * 9);
}

function validateSupplementInput(input: Partial<SupplementInput>): string[] {
	const errors: string[] = [];
	if (!input.name?.trim()) errors.push('الاسم مطلوب');
	if (input.servingSize != null && input.servingSize <= 0) errors.push('حجم الحصة يجب أن يكون أكبر من صفر');
	if (input.protein != null && input.protein < 0) errors.push('البروتين لا يمكن أن يكون سالبًا');
	if (input.carbs != null && input.carbs < 0) errors.push('الكربوهيدرات لا يمكن أن تكون سالبة');
	if (input.fat != null && input.fat < 0) errors.push('الدهون لا يمكن أن تكون سالبة');
	if (input.scoops != null && (!Number.isInteger(input.scoops) || input.scoops < 1))
		errors.push('عدد السكوبات يجب أن يكون عددًا صحيحًا موجبًا');
	return errors;
}

describe('calculateTotalKcal', () => {
	it('calculates kcal from macros (4/4/9 formula)', () => {
		expect(calculateTotalKcal(25, 10, 5)).toBe(25 * 4 + 10 * 4 + 5 * 9);
	});

	it('returns 0 for all-zero macros', () => {
		expect(calculateTotalKcal(0, 0, 0)).toBe(0);
	});

	it('handles protein-only supplement', () => {
		expect(calculateTotalKcal(30, 0, 0)).toBe(120);
	});

	it('handles fat-only supplement', () => {
		expect(calculateTotalKcal(0, 0, 10)).toBe(90);
	});

	it('rounds to nearest integer', () => {
		expect(Number.isInteger(calculateTotalKcal(1.5, 2.3, 0.7))).toBe(true);
	});
});

describe('validateSupplementInput', () => {
	it('returns empty for valid input', () => {
		expect(validateSupplementInput({
			name: 'واي بروتين',
			servingSize: 30,
			protein: 25,
			carbs: 3,
			fat: 1,
			scoops: 2
		})).toEqual([]);
	});

	it('requires name', () => {
		const errors = validateSupplementInput({ name: '' });
		expect(errors).toContain('الاسم مطلوب');
	});

	it('rejects whitespace-only name', () => {
		const errors = validateSupplementInput({ name: '   ' });
		expect(errors).toContain('الاسم مطلوب');
	});

	it('rejects zero serving size', () => {
		const errors = validateSupplementInput({ name: 'test', servingSize: 0 });
		expect(errors).toContain('حجم الحصة يجب أن يكون أكبر من صفر');
	});

	it('rejects negative protein', () => {
		const errors = validateSupplementInput({ name: 'test', protein: -1 });
		expect(errors).toContain('البروتين لا يمكن أن يكون سالبًا');
	});

	it('rejects negative carbs', () => {
		const errors = validateSupplementInput({ name: 'test', carbs: -5 });
		expect(errors).toContain('الكربوهيدرات لا يمكن أن تكون سالبة');
	});

	it('rejects negative fat', () => {
		const errors = validateSupplementInput({ name: 'test', fat: -1 });
		expect(errors).toContain('الدهون لا يمكن أن تكون سالبة');
	});

	it('rejects non-integer scoops', () => {
		const errors = validateSupplementInput({ name: 'test', scoops: 1.5 });
		expect(errors).toContain('عدد السكوبات يجب أن يكون عددًا صحيحًا موجبًا');
	});

	it('rejects zero scoops', () => {
		const errors = validateSupplementInput({ name: 'test', scoops: 0 });
		expect(errors).toContain('عدد السكوبات يجب أن يكون عددًا صحيحًا موجبًا');
	});

	it('returns multiple errors for multiple violations', () => {
		const errors = validateSupplementInput({ name: '', servingSize: -1, protein: -1 });
		expect(errors.length).toBeGreaterThanOrEqual(3);
	});
});
