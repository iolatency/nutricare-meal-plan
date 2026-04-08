import type { Handle } from '@sveltejs/kit';
import { getUserFromCookie } from '$lib/server/modules/auth/auth.service';

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.user = await getUserFromCookie(event);
	return resolve(event);
};
