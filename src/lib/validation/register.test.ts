import { describe, it, expect } from 'vitest';
import { validatePasswordIssues, passwordIssuesToMessage, validateUsername } from './register';

describe('validatePasswordIssues', () => {
	it('returns empty array for a valid password', () => {
		expect(validatePasswordIssues('StrongPass1')).toEqual([]);
	});

	it('flags passwords shorter than 8 characters', () => {
		const issues = validatePasswordIssues('Ab1');
		expect(issues).toContain('8 أحرف على الأقل');
	});

	it('flags missing uppercase letter', () => {
		const issues = validatePasswordIssues('lowercase1');
		expect(issues).toContain('حرف كبير واحد على الأقل');
	});

	it('flags missing lowercase letter', () => {
		const issues = validatePasswordIssues('UPPERCASE1');
		expect(issues).toContain('حرف صغير واحد على الأقل');
	});

	it('flags missing digit', () => {
		const issues = validatePasswordIssues('NoDigitsHere');
		expect(issues).toContain('رقم واحد على الأقل');
	});

	it('returns multiple issues for an empty password', () => {
		const issues = validatePasswordIssues('');
		expect(issues.length).toBe(4);
	});

	it('returns exactly the failing requirements', () => {
		// 8+ chars, has uppercase, has lowercase, missing digit
		const issues = validatePasswordIssues('ValidPassNoDigit');
		expect(issues).toEqual(['رقم واحد على الأقل']);
	});
});

describe('passwordIssuesToMessage', () => {
	it('returns empty string when there are no issues', () => {
		expect(passwordIssuesToMessage([])).toBe('');
	});

	it('returns a formatted Arabic message for one issue', () => {
		const msg = passwordIssuesToMessage(['8 أحرف على الأقل']);
		expect(msg).toBe('كلمة المرور يجب أن تحتوي على: 8 أحرف على الأقل');
	});

	it('joins multiple issues with Arabic comma', () => {
		const msg = passwordIssuesToMessage(['8 أحرف على الأقل', 'رقم واحد على الأقل']);
		expect(msg).toBe('كلمة المرور يجب أن تحتوي على: 8 أحرف على الأقل، رقم واحد على الأقل');
	});
});

describe('validateUsername', () => {
	it('returns null for a valid username', () => {
		expect(validateUsername('john_doe')).toBeNull();
		expect(validateUsername('user.123')).toBeNull();
		expect(validateUsername('ABCD')).toBeNull();
	});

	it('returns error for empty username', () => {
		expect(validateUsername('')).toBe('اسم المستخدم مطلوب');
		expect(validateUsername('   ')).toBe('اسم المستخدم مطلوب');
	});

	it('returns error when username contains spaces', () => {
		expect(validateUsername('john doe')).toBe('اسم المستخدم لا يمكن أن يحتوي على مسافات');
	});

	it('returns error when username is shorter than 4 characters', () => {
		expect(validateUsername('abc')).toBe('اسم المستخدم يجب أن يكون 4 أحرف على الأقل');
	});

	it('returns error for invalid characters', () => {
		const err = validateUsername('user@name');
		expect(err).toBe('اسم المستخدم يمكن أن يحتوي فقط على أحرف إنجليزية وأرقام ونقاط وشرطات سفلية');
	});

	it('accepts exactly 4 characters', () => {
		expect(validateUsername('abcd')).toBeNull();
	});
});
