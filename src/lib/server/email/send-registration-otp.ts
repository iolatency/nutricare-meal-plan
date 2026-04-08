import { dev } from '$app/environment';
import { Resend } from 'resend';
import { getRegistrationConfig } from '$lib/server/config/registration';

export type SendRegistrationOtpParams = {
	toEmail: string;
	code: string;
	firstName: string;
	expireMinutes: number;
};

function buildBodies(firstName: string, code: string, expireMinutes: number) {
	const greeting = firstName.trim() || 'مرحباً';
	const subject = 'NutriCare — رمز التحقق من البريد';
	const textBody =
		`${greeting}\n\n` +
		`رمز التحقق الخاص بك: ${code}\n\n` +
		`الرمز صالح لمدة ${expireMinutes} دقيقة.\n` +
		'إذا لم تطلب إنشاء حساب في NutriCare، يمكنك تجاهل هذه الرسالة.\n\n' +
		'---\n' +
		`Your verification code: ${code}\n` +
		`This code expires in ${expireMinutes} minutes.\n` +
		'If you did not sign up for NutriCare, you can ignore this email.\n';

	const htmlBody = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head><meta charset="utf-8"></head>
<body style="font-family:Segoe UI,Tahoma,Arial,sans-serif;line-height:1.6;color:#1a1a1a;padding:24px;">
  <p style="margin:0 0 8px;font-size:18px;font-weight:700;color:#16a34a;">NutriCare</p>
  <p style="margin:0 0 16px;">${greeting}</p>
  <p style="margin:0 0 8px;">رمز التحقق:</p>
  <p style="margin:0 0 16px;font-size:28px;font-weight:700;letter-spacing:4px;font-family:monospace;">${code}</p>
  <p style="margin:0 0 8px;font-size:14px;color:#6b7280;">صالح لمدة ${expireMinutes} دقيقة.</p>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
  <p dir="ltr" style="margin:0;font-size:13px;color:#6b7280;">English: Your code is <strong>${code}</strong> (expires in ${expireMinutes} min).</p>
</body>
</html>`;

	return { subject, textBody, htmlBody };
}

export async function sendRegistrationOtp(params: SendRegistrationOtpParams): Promise<void> {
	const toEmail = params.toEmail.trim();
	if (!toEmail) throw new Error('toEmail is required');

	const { resendApiKey, emailFrom } = getRegistrationConfig();
	const { subject, textBody, htmlBody } = buildBodies(
		params.firstName,
		params.code,
		params.expireMinutes
	);

	if (!resendApiKey) {
		if (dev) {
			console.warn(
				`[registration OTP] RESEND_API_KEY not set; code for ${toEmail} is ${params.code}`
			);
			return;
		}
		throw new Error('RESEND_API_KEY is not configured');
	}

	const resend = new Resend(resendApiKey);
	const result = await resend.emails.send({
		from: emailFrom,
		to: toEmail,
		subject,
		html: htmlBody,
		text: textBody
	});

	if (result.error) {
		if (dev) {
			console.warn(
				`[registration OTP] Resend failed for ${toEmail}; code=${params.code}`,
				result.error
			);
			return;
		}
		throw new Error(result.error.message || 'Resend send failed');
	}
}
