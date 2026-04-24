
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	allowOtpResend,
	completeRegistrationVerification,
	findUnverifiedUserIdByEmail,
	issueRegistrationOtp
} from '$lib/server/modules/auth/registration-otp.service';
import { registerNewUser } from '$lib/server/modules/users/register.service';
import { AR_REGISTER } from '$lib/locales/ar/register';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) {
		redirect(302, '/');
	}
	return {};
};

export const actions = {
	register: async ({ request }) => {
		const data = await request.formData();
		const roleRaw = data.get('role')?.toString();
		const role = roleRaw === 'dietitian' || roleRaw === 'patient' ? roleRaw : null;
		if (!role) {
			return fail(400, { fieldErrors: { role: AR_REGISTER.selectRole } });
		}

		const result = await registerNewUser({
			role,
			username: data.get('username')?.toString() ?? '',
			phone: data.get('phone')?.toString() ?? '',
			email: data.get('email')?.toString() ?? '',
			firstName: data.get('first_name')?.toString() ?? '',
			lastName: data.get('last_name')?.toString() ?? '',
			password: data.get('password')?.toString() ?? '',
			confirmPassword: data.get('confirm_password')?.toString() ?? ''
		});

		if (!result.ok) {
			if ('mailError' in result && result.mailError) {
				return fail(503, {
					message: AR_REGISTER.mailSendFailed
				});
			}
			return fail(400, { fieldErrors: 'fieldErrors' in result ? result.fieldErrors : {} });
		}

		return {
			registerOk: true as const,
			pendingEmail: result.email
		};
	},

	verify: async ({ request }) => {
		const data = await request.formData();
		const email = data.get('email')?.toString().trim() ?? '';
		const code = data.get('code')?.toString() ?? '';

		const result = await completeRegistrationVerification(email, code);
		if (!result.ok) {
			const messages = {
				no_pending: AR_REGISTER.verifyNoPending,
				expired: AR_REGISTER.verifyExpired,
				locked: AR_REGISTER.verifyLocked,
				invalid: AR_REGISTER.verifyEmailInvalid,
				invalid_email: AR_REGISTER.invalidEmailForVerify
			} as const;
			return fail(400, {
				verifyError: messages[result.err],
				pendingEmail: email
			});
		}

		return { verifyOk: true as const };
	},

	resend: async ({ request }) => {
		const data = await request.formData();
		const email = data.get('email')?.toString().trim() ?? '';

		const user = await findUnverifiedUserIdByEmail(email);
		if (!user) {
			return { resentOk: true as const, opaque: true as const };
		}

		const allowed = await allowOtpResend(user.id);
		if (!allowed) {
			return fail(429, { resendError: AR_REGISTER.resendTooMany });
		}

		try {
			await issueRegistrationOtp(user.id, user.firstName);
		} catch (e) {
			console.error(e);
			return fail(503, { resendError: AR_REGISTER.resendFailed });
		}

		return { resentOk: true as const };
	}
} satisfies Actions;
