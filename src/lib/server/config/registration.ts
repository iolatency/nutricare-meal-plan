import { env } from '$env/dynamic/private';

export function getRegistrationConfig() {
	return {
		otpExpireMinutes: Math.max(1, Number(env.REGISTRATION_OTP_EXPIRE_MINUTES ?? 15) || 15),
		otpMaxAttempts: Math.max(1, Number(env.REGISTRATION_OTP_MAX_ATTEMPTS ?? 5) || 5),
		resendApiKey: (env.RESEND_API_KEY ?? '').trim(),
		emailFrom: (env.EMAIL_FROM ?? 'NutriCare <noreply@hsn1hb.tech>').trim()
	};
}
