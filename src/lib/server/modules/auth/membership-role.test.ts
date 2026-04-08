import { describe, it, expect } from 'vitest';
import { membershipRolesToAppRole } from './membership-role';

describe('membershipRolesToAppRole', () => {
	it('returns patient for null', () => {
		expect(membershipRolesToAppRole(null)).toBe('patient');
	});

	it('returns patient for undefined', () => {
		expect(membershipRolesToAppRole(undefined)).toBe('patient');
	});

	it('returns patient for empty string', () => {
		expect(membershipRolesToAppRole('')).toBe('patient');
	});

	it('returns patient for "patient" role', () => {
		expect(membershipRolesToAppRole('["patient"]')).toBe('patient');
	});

	it('returns patient for "client" role', () => {
		expect(membershipRolesToAppRole('["client"]')).toBe('patient');
	});

	it('returns dietitian for "dietitian" role', () => {
		expect(membershipRolesToAppRole('["dietitian"]')).toBe('dietitian');
	});

	it('returns dietitian for "admin" role', () => {
		expect(membershipRolesToAppRole('["admin"]')).toBe('dietitian');
	});

	it('returns dietitian for "owner" role', () => {
		expect(membershipRolesToAppRole('["owner"]')).toBe('dietitian');
	});

	it('returns dietitian for "staff" role', () => {
		expect(membershipRolesToAppRole('["staff"]')).toBe('dietitian');
	});

	it('is case-insensitive', () => {
		expect(membershipRolesToAppRole('DIETITIAN')).toBe('dietitian');
		expect(membershipRolesToAppRole('PATIENT')).toBe('patient');
		expect(membershipRolesToAppRole('Admin')).toBe('dietitian');
	});

	it('returns patient for unknown role strings', () => {
		expect(membershipRolesToAppRole('["unknown"]')).toBe('patient');
	});
});
