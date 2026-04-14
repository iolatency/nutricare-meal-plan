/** Deterministic palette for text avatars (same order everywhere). */
export const AVATAR_FALLBACK_PALETTE = [
	{ bg: '#d1fae5', text: '#059669' },
	{ bg: '#dbeafe', text: '#2563eb' },
	{ bg: '#ede9fe', text: '#7c3aed' },
	{ bg: '#fef3c7', text: '#d97706' },
	{ bg: '#ffe4e6', text: '#e11d48' },
	{ bg: '#cffafe', text: '#0891b2' }
] as const;

export type AvatarFallbackColors = { bg: string; text: string };

export function avatarFallbackColors(seed: string): AvatarFallbackColors {
	const s = seed.trim() || '؟';
	let hash = 0;
	for (let i = 0; i < s.length; i++) hash = s.charCodeAt(i) + ((hash << 5) - hash);
	const idx = Math.abs(hash) % AVATAR_FALLBACK_PALETTE.length;
	return AVATAR_FALLBACK_PALETTE[idx];
}

/** First visible character for initials (Arabic / Latin / digits). */
export function avatarInitial(displayName: string): string {
	const t = displayName.trim();
	if (!t) return '؟';
	return t.slice(0, 1);
}
