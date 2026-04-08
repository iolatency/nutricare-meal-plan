import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	createSession,
	setSessionCookie,
	verifyEmailPassword
} from '$lib/server/modules/auth/auth.service';
import { AR_AUTH } from '$lib/locales/ar/auth';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (locals.user) {
		redirect(302, '/');
	}
	const sessionExpired =
		url.searchParams.get('expired') === '1' || url.searchParams.get('session') === 'expired';
	return { sessionExpired };
};

export const actions: Actions = {
	default: async (event) => {
		const data = await event.request.formData();
		const identifier = data.get('identifier')?.toString().trim() ?? '';
		const password = data.get('password')?.toString() ?? '';

		if (!identifier || !password) {
			return fail(400, {
				error: AR_AUTH.loginMissingFields,
				identifier
			});
		}

		const auth = await verifyEmailPassword(identifier, password);
		if (!auth.ok) {
			if (auth.reason === 'email_unverified') {
				return fail(400, { error: AR_AUTH.loginEmailNotVerified, identifier });
			}
			return fail(400, { error: AR_AUTH.loginFailed, identifier });
		}

		const token = await createSession(auth.userId);
		setSessionCookie(event, token);

		redirect(302, '/');
	}
};
