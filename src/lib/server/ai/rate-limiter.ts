const requestLog = new Map<number, number[]>();

const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS = 5;   // per user per window

export function checkAiRateLimit(
	userId: number
): { allowed: boolean; retryAfterMs?: number } {
	const now = Date.now();
	const timestamps = (requestLog.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);

	if (timestamps.length >= MAX_REQUESTS) {
		const oldest = timestamps[0];
		return { allowed: false, retryAfterMs: WINDOW_MS - (now - oldest) };
	}

	timestamps.push(now);
	requestLog.set(userId, timestamps);
	return { allowed: true };
}
