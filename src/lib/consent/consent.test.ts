import { describe, it, expect, beforeEach } from 'vitest';
import {
	CONSENT_KEY,
	getConsent,
	hasConsented,
	acceptAll,
	acceptRequired,
	revokeConsent,
	needsReConsent
} from './consent';

// ─── Mock localStorage for the Node test environment ────────────────────────

const store: Record<string, string> = {};

const localStorageMock = {
	getItem: (key: string) => store[key] ?? null,
	setItem: (key: string, value: string) => {
		store[key] = value;
	},
	removeItem: (key: string) => {
		delete store[key];
	},
	clear: () => {
		for (const k in store) delete store[k];
	}
};

Object.defineProperty(globalThis, 'localStorage', {
	value: localStorageMock,
	writable: true
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('getConsent / hasConsented', () => {
	beforeEach(() => localStorageMock.clear());

	it('returns null and false when no consent has been given', () => {
		expect(getConsent()).toBeNull();
		expect(hasConsented()).toBe(false);
	});

	it('returns the stored consent after acceptAll()', () => {
		acceptAll();
		expect(getConsent()).not.toBeNull();
		expect(hasConsented()).toBe(true);
	});
});

describe('acceptAll', () => {
	beforeEach(() => localStorageMock.clear());

	it('sets analytics and functional to true', () => {
		const state = acceptAll();
		expect(state.analytics).toBe(true);
		expect(state.functional).toBe(true);
	});

	it('stores an ISO timestamp in acceptedAt', () => {
		const state = acceptAll();
		expect(state.acceptedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
	});

	it('records version "1.0"', () => {
		const state = acceptAll();
		expect(state.version).toBe('1.0');
	});

	it('persists to localStorage', () => {
		acceptAll();
		const raw = localStorageMock.getItem(CONSENT_KEY);
		expect(raw).not.toBeNull();
		const parsed = JSON.parse(raw!);
		expect(parsed.analytics).toBe(true);
	});
});

describe('acceptRequired', () => {
	beforeEach(() => localStorageMock.clear());

	it('sets functional=true but analytics=false', () => {
		const state = acceptRequired();
		expect(state.functional).toBe(true);
		expect(state.analytics).toBe(false);
	});

	it('persists to localStorage', () => {
		acceptRequired();
		const raw = localStorageMock.getItem(CONSENT_KEY);
		expect(raw).not.toBeNull();
		const parsed = JSON.parse(raw!);
		expect(parsed.analytics).toBe(false);
	});

	it('stores acceptedAt timestamp', () => {
		const state = acceptRequired();
		expect(new Date(state.acceptedAt).getTime()).toBeLessThanOrEqual(Date.now());
	});
});

describe('revokeConsent', () => {
	beforeEach(() => localStorageMock.clear());

	it('removes the consent record from localStorage', () => {
		acceptAll();
		expect(hasConsented()).toBe(true);
		revokeConsent();
		expect(hasConsented()).toBe(false);
		expect(getConsent()).toBeNull();
	});

	it('is safe to call when no consent exists', () => {
		expect(() => revokeConsent()).not.toThrow();
	});
});

describe('needsReConsent', () => {
	beforeEach(() => localStorageMock.clear());

	it('returns false when no consent is stored', () => {
		expect(needsReConsent()).toBe(false);
	});

	it('returns false when version matches current policy version', () => {
		acceptAll();
		expect(needsReConsent()).toBe(false);
	});

	it('returns true when stored version differs from current', () => {
		// Manually inject an old version
		const old = {
			analytics: true,
			functional: true,
			acceptedAt: new Date().toISOString(),
			version: '0.9'
		};
		localStorageMock.setItem(CONSENT_KEY, JSON.stringify(old));
		expect(needsReConsent()).toBe(true);
	});
});
