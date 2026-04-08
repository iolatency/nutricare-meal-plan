import { randomInt } from 'crypto';
import bcrypt from 'bcryptjs';
import { eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { registrationEmailOtp, users } from '$lib/server/db/schema';
import { getRegistrationConfig } from '$lib/server/config/registration';
import { sendRegistrationOtp } from '$lib/server/email/send-registration-otp';

const RESEND_WINDOW_MS = 3600_000;

export function generateOtpCode(): string {
	return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export async function issueRegistrationOtp(userId: number, firstName: string): Promise<void> {
	const { otpExpireMinutes } = getRegistrationConfig();
	const code = generateOtpCode();
	const otpHash = await bcrypt.hash(code, 10);
	const expiresAt = new Date(Date.now() + otpExpireMinutes * 60_000).toISOString();

	const [user] = await db
		.select({ email: users.email })
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);
	if (!user?.email) throw new Error('User email missing');

	await db
		.insert(registrationEmailOtp)
		.values({
			userId,
			otpHash,
			expiresAt,
			attempts: 0,
			resendCount: 0,
			resendWindowStartedAt: null
		})
		.onConflictDoUpdate({
			target: registrationEmailOtp.userId,
			set: {
				otpHash,
				expiresAt,
				attempts: 0
			}
		});

	await sendRegistrationOtp({
		toEmail: user.email,
		code,
		firstName,
		expireMinutes: otpExpireMinutes
	});
}

export type OtpVerifyError = 'no_pending' | 'expired' | 'locked' | 'invalid';

export async function verifyRegistrationOtp(
	userId: number,
	code: string
): Promise<{ ok: true } | { ok: false; err: OtpVerifyError }> {
	const { otpMaxAttempts } = getRegistrationConfig();
	const [r] = await db
		.select()
		.from(registrationEmailOtp)
		.where(eq(registrationEmailOtp.userId, userId))
		.limit(1);

	if (!r) return { ok: false, err: 'no_pending' };
	if (r.attempts >= otpMaxAttempts) return { ok: false, err: 'locked' };
	if (Date.now() > new Date(r.expiresAt).getTime()) return { ok: false, err: 'expired' };

	const normalized = (code || '').trim().replace(/\D/g, '').slice(0, 6);
	if (normalized.length !== 6 || !/^\d{6}$/.test(normalized)) {
		return { ok: false, err: 'invalid' };
	}

	const match = await bcrypt.compare(normalized, r.otpHash);
	if (!match) {
		await db
			.update(registrationEmailOtp)
			.set({ attempts: r.attempts + 1 })
			.where(eq(registrationEmailOtp.userId, userId));
		return { ok: false, err: 'invalid' };
	}

	await db.delete(registrationEmailOtp).where(eq(registrationEmailOtp.userId, userId));
	return { ok: true };
}

/** Max 3 resends per hour per pending registration row (same user as OTP). */
export async function allowOtpResend(userId: number): Promise<boolean> {
	const [r] = await db
		.select()
		.from(registrationEmailOtp)
		.where(eq(registrationEmailOtp.userId, userId))
		.limit(1);

	if (!r) return true;

	const now = Date.now();
	const nowIso = new Date(now).toISOString();
	const windowStartMs = r.resendWindowStartedAt
		? new Date(r.resendWindowStartedAt).getTime()
		: null;
	const windowExpired = !r.resendWindowStartedAt || now - windowStartMs! > RESEND_WINDOW_MS;

	if (windowExpired) {
		await db
			.update(registrationEmailOtp)
			.set({ resendCount: 1, resendWindowStartedAt: nowIso })
			.where(eq(registrationEmailOtp.userId, userId));
		return true;
	}

	if (r.resendCount >= 3) return false;

	await db
		.update(registrationEmailOtp)
		.set({ resendCount: r.resendCount + 1 })
		.where(eq(registrationEmailOtp.userId, userId));
	return true;
}

export async function findUnverifiedUserIdByEmail(
	email: string
): Promise<{ id: number; firstName: string } | null> {
	const key = email.trim().toLowerCase();
	const [row] = await db
		.select({
			id: users.id,
			name: users.name,
			emailVerifiedAt: users.emailVerifiedAt
		})
		.from(users)
		.where(sql`lower(${users.email}) = ${key}`)
		.limit(1);

	if (!row || row.emailVerifiedAt) return null;
	const firstName = row.name.split(/\s+/)[0] ?? row.name;
	return { id: row.id, firstName };
}

export async function completeRegistrationVerification(
	email: string,
	code: string
): Promise<{ ok: true } | { ok: false; err: OtpVerifyError | 'invalid_email' }> {
	const key = email.trim().toLowerCase();
	const [row] = await db
		.select({
			id: users.id,
			emailVerifiedAt: users.emailVerifiedAt
		})
		.from(users)
		.where(sql`lower(${users.email}) = ${key}`)
		.limit(1);

	if (!row) return { ok: false, err: 'invalid_email' };
	if (row.emailVerifiedAt) return { ok: true };

	const v = await verifyRegistrationOtp(row.id, code);
	if (!v.ok) return v;

	const now = new Date().toISOString();
	await db.update(users).set({ emailVerifiedAt: now, updatedAt: now }).where(eq(users.id, row.id));

	return { ok: true };
}
