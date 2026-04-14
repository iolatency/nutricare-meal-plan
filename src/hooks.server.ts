import type { Handle } from '@sveltejs/kit';
import { flushSqliteToSupabaseStorage } from '$lib/server/db';
import { getUserFromCookie } from '$lib/server/modules/auth/auth.service';
import { deleteExpiredSessions } from '$lib/server/modules/auth/session.repository';

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.user = await getUserFromCookie(event);

	// Probabilistic cleanup of expired sessions (~1% of requests)
	if (Math.random() < 0.01) {
		deleteExpiredSessions().catch(() => {});
	}

	const response = await resolve(event);
	await flushSqliteToSupabaseStorage().catch((err) =>
		console.error('[db] Supabase Storage upload failed:', err)
	);
	return response;
};
