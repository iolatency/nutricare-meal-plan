/**
 * PDPL Consent Utility
 *
 * Manages user consent preferences in localStorage under Saudi Arabia's
 * Personal Data Protection Law (PDPL / Royal Decree No. M/19).
 *
 * This app uses server-side httpOnly session cookies for authentication.
 * This module manages *analytics preference consent* — separate from auth.
 */

export const CONSENT_KEY = 'nutricare_consent_v1';

export interface ConsentState {
	/** Whether the user has accepted optional analytics / tracking */
	analytics: boolean;
	/** Required functional consent — always true when present */
	functional: boolean;
	/** ISO 8601 timestamp of when consent was recorded */
	acceptedAt: string;
	/** Bump when privacy policy changes to re-prompt users */
	version: string;
}

const CURRENT_VERSION = '1.0';

function readConsent(): ConsentState | null {
	if (typeof localStorage === 'undefined') return null;
	try {
		const raw = localStorage.getItem(CONSENT_KEY);
		return raw ? (JSON.parse(raw) as ConsentState) : null;
	} catch {
		return null;
	}
}

function writeConsent(state: ConsentState): void {
	localStorage.setItem(CONSENT_KEY, JSON.stringify(state));
}

export function getConsent(): ConsentState | null {
	return readConsent();
}

export function hasConsented(): boolean {
	return readConsent() !== null;
}

export function acceptAll(): ConsentState {
	const state: ConsentState = {
		analytics: true,
		functional: true,
		acceptedAt: new Date().toISOString(),
		version: CURRENT_VERSION
	};
	writeConsent(state);
	return state;
}

export function acceptRequired(): ConsentState {
	const state: ConsentState = {
		analytics: false,
		functional: true,
		acceptedAt: new Date().toISOString(),
		version: CURRENT_VERSION
	};
	writeConsent(state);
	return state;
}

export function revokeConsent(): void {
	localStorage.removeItem(CONSENT_KEY);
}

/**
 * Returns true when the stored consent version differs from the current
 * policy version — prompt the user to re-consent.
 */
export function needsReConsent(): boolean {
	const existing = readConsent();
	if (!existing) return false;
	return existing.version !== CURRENT_VERSION;
}
