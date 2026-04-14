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
<html lang="ar" dir="rtl" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>رمز التحقق — NutriCare</title>
</head>
<body style="margin:0;padding:0;background-color:#f0f4f1;font-family:'Segoe UI',Tahoma,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <!-- Outer wrapper -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f0f4f1;padding:40px 16px;">
    <tr>
      <td align="center" valign="top">

        <!-- Card -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:540px;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 28px rgba(0,0,0,0.09);">

          <!-- Header -->
          <tr>
            <td align="center" bgcolor="#1a9e60" style="background:linear-gradient(135deg,#2ec27e 0%,#1a9e60 100%);padding:28px 32px 24px;">
              <p style="margin:0;font-size:26px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;font-family:'Segoe UI',Tahoma,Arial,sans-serif;">NutriCare</p>
              <p style="margin:6px 0 0;font-size:13px;color:rgba(255,255,255,0.82);font-family:'Segoe UI',Tahoma,Arial,sans-serif;">منصة إدارة التغذية الاحترافية</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 40px 28px;direction:rtl;">

              <!-- Greeting -->
              <p style="margin:0 0 8px;font-size:18px;font-weight:700;color:#111827;font-family:'Segoe UI',Tahoma,Arial,sans-serif;">مرحباً ${greeting}،</p>
              <p style="margin:0 0 28px;font-size:14px;color:#6b7280;line-height:1.8;font-family:'Segoe UI',Tahoma,Arial,sans-serif;">
                تلقّينا طلباً لإنشاء حساب جديد في NutriCare. أدخل الرمز أدناه لتأكيد بريدك الإلكتروني والمتابعة.
              </p>

              <!-- OTP Code Box -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="padding-bottom:28px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td align="center" bgcolor="#f0fdf4" style="background-color:#f0fdf4;border:2px solid #86efac;border-radius:14px;padding:22px 48px;">
                          <p style="margin:0 0 8px;font-size:11px;font-weight:600;color:#6b7280;letter-spacing:1.5px;text-transform:uppercase;font-family:'Segoe UI',Tahoma,Arial,sans-serif;">رمز التحقق</p>
                          <p style="margin:0;font-size:40px;font-weight:800;letter-spacing:14px;color:#15803d;font-family:'Courier New',Courier,monospace;direction:ltr;padding-right:14px;">${code}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Expiry warning -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
                <tr>
                  <td bgcolor="#fefce8" style="background-color:#fefce8;border:1px solid #fef08a;border-radius:10px;padding:13px 18px;">
                    <p style="margin:0;font-size:13px;color:#854d0e;line-height:1.55;font-family:'Segoe UI',Tahoma,Arial,sans-serif;">
                      هذا الرمز صالح لمدة <strong>${expireMinutes} دقيقة</strong> فقط. لا تشاركه مع أي شخص.
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Security note -->
              <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.7;font-family:'Segoe UI',Tahoma,Arial,sans-serif;">
                إذا لم تطلب إنشاء حساب في NutriCare، يمكنك تجاهل هذه الرسالة بأمان — لن يُفعَّل أي حساب بدون تأكيدك.
              </p>
            </td>
          </tr>

          <!-- Divider + English fallback -->
          <tr>
            <td style="padding:0 40px 28px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="border-top:1px solid #f3f4f6;padding-top:20px;" dir="ltr">
                    <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.7;font-family:'Segoe UI',Tahoma,Arial,sans-serif;">
                      <strong style="color:#6b7280;">English:</strong> Your verification code is
                      <strong style="color:#15803d;letter-spacing:3px;font-family:'Courier New',Courier,monospace;">${code}</strong>.
                      Valid for ${expireMinutes} minutes. If you did not request this, please ignore this email.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" bgcolor="#f9fafb" style="background-color:#f9fafb;border-top:1px solid #f3f4f6;padding:16px 40px;border-radius:0 0 16px 16px;">
              <p style="margin:0;font-size:11px;color:#d1d5db;font-family:'Segoe UI',Tahoma,Arial,sans-serif;">NutriCare &mdash; جميع الحقوق محفوظة</p>
            </td>
          </tr>

        </table>
        <!-- /Card -->

      </td>
    </tr>
  </table>
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
