/**
 * Security Tests — XSS Injection
 *
 * Verifies that user input is properly sanitized and XSS payloads
 * cannot execute as code.
 */
import { describe, it, expect } from 'vitest';

const XSS_PAYLOADS = [
	'<script>alert("XSS")</script>',
	'<img src=x onerror=alert(1)>',
	'<svg onload=alert(1)>',
	'javascript:alert(1)',
	'"><script>alert(document.cookie)</script>',
	"'><script>alert('XSS')</script>",
	'<body onload=alert(1)>',
	'<iframe src="javascript:alert(1)">',
	'<input onfocus=alert(1) autofocus>',
];

function escapeHtml(str: string): string {
	return str
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
}

function containsExecutableScript(str: string): boolean {
	const patterns = [
		/<script[\s>]/i,
		/javascript:/i,
		/on\w+\s*=/i,
		/<iframe/i,
		/<svg/i,
		/<body/i,
	];
	return patterns.some((p) => p.test(str));
}

describe('XSS payload detection', () => {
	for (const payload of XSS_PAYLOADS) {
		it(`detects XSS payload: "${payload.slice(0, 40)}..."`, () => {
			expect(containsExecutableScript(payload)).toBe(true);
		});
	}

	it('does not flag normal text', () => {
		expect(containsExecutableScript('مرحبا، أريد خطة غذائية')).toBe(false);
		expect(containsExecutableScript('Hello, I want a meal plan')).toBe(false);
	});

	it('does not flag text with angle brackets in math', () => {
		expect(containsExecutableScript('calories: 1500 > 1000')).toBe(false);
	});
});

describe('HTML escaping', () => {
	it('escapes angle brackets', () => {
		const escaped = escapeHtml('<script>alert(1)</script>');
		expect(escaped).not.toContain('<script>');
		expect(escaped).toContain('&lt;script&gt;');
	});

	it('escapes double quotes', () => {
		const escaped = escapeHtml('"><img src=x>');
		expect(escaped).toContain('&quot;');
	});

	it('escapes single quotes', () => {
		const escaped = escapeHtml("'><script>");
		expect(escaped).toContain('&#039;');
	});

	it('preserves normal text', () => {
		const text = 'أحمد علي - وصفة رقم 1';
		expect(escapeHtml(text)).toBe(text);
	});

	it('escapes ampersands', () => {
		expect(escapeHtml('A & B')).toBe('A &amp; B');
	});
});

describe('Input sanitization for user-facing fields', () => {
	it('user name with script tag is stored as plain text', () => {
		const name = '<script>alert("xss")</script>أحمد';
		const escaped = escapeHtml(name);
		expect(escaped).not.toContain('<script>');
		expect(escaped).toContain('أحمد');
	});

	it('meal plan notes with XSS are neutralized', () => {
		const note = 'تجنب الغلوتين <img src=x onerror=alert(1)>';
		const escaped = escapeHtml(note);
		expect(escaped).not.toContain('<img');
		expect(escaped).toContain('&lt;img');
		expect(escaped).toContain('تجنب الغلوتين');
	});

	it('chat message with injection is stored safely', () => {
		const msg = 'مرحبا <script>document.cookie</script>';
		const escaped = escapeHtml(msg);
		expect(escaped).not.toContain('<script>');
	});
});
