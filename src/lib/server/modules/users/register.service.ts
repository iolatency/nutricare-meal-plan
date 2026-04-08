import bcrypt from 'bcryptjs';
import { eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { memberships, organizations, users } from '$lib/server/db/schema';
import { issueRegistrationOtp } from '$lib/server/modules/auth/registration-otp.service';
import {
	passwordIssuesToMessage,
	validatePasswordIssues,
	validateUsername
} from '$lib/validation/register';
import { AR_REGISTER } from '$lib/locales/ar/register';
import { AR_AUTH } from '$lib/locales/ar/auth';

export type RegisterRole = 'dietitian' | 'patient';

export type RegisterPayload = {
	role: RegisterRole;
	username: string;
	phone: string;
	email: string;
	firstName: string;
	lastName: string;
	password: string;
};

export type RegisterFormInput = RegisterPayload & { confirmPassword: string };

export type RegisterResult =
	| { ok: true; email: string }
	| { ok: false; fieldErrors: Record<string, string> }
	| { ok: false; mailError: true };

function validateFields(p: RegisterFormInput): Record<string, string> | null {
	const err: Record<string, string> = {};
	const u = validateUsername(p.username);
	if (u) err.username = u;
	if (!p.firstName.trim()) err.first_name = AR_REGISTER.firstNameRequired;
	if (!p.lastName.trim()) err.last_name = AR_REGISTER.lastNameRequired;
	if (!p.phone.trim()) err.phone = AR_REGISTER.phoneRequired;
	if (!p.email.trim()) err.email = AR_REGISTER.emailRequired;

	const pwIssues = validatePasswordIssues(p.password);
	if (pwIssues.length) err.password = passwordIssuesToMessage(pwIssues);

	if (p.password !== p.confirmPassword) err.confirmPassword = AR_REGISTER.confirmMismatch;

	return Object.keys(err).length ? err : null;
}

async function findRegistrationConflict(
	emailLower: string,
	usernameLower: string,
	phoneTrim: string
): Promise<'email' | 'username' | 'phone' | null> {
	const [byEmail] = await db
		.select({ id: users.id })
		.from(users)
		.where(sql`lower(${users.email}) = ${emailLower}`)
		.limit(1);
	if (byEmail) return 'email';

	const [byUsername] = await db
		.select({ id: users.id })
		.from(users)
		.where(sql`lower(${users.username}) = ${usernameLower}`)
		.limit(1);
	if (byUsername) return 'username';

	const [byPhone] = await db
		.select({ id: users.id })
		.from(users)
		.where(eq(users.phone, phoneTrim))
		.limit(1);
	if (byPhone) return 'phone';

	return null;
}

export async function registerNewUser(raw: RegisterFormInput): Promise<RegisterResult> {
	const fieldErr = validateFields(raw);
	if (fieldErr) return { ok: false, fieldErrors: fieldErr };

	const emailLower = raw.email.trim().toLowerCase();
	const usernameLower = raw.username.trim().toLowerCase();
	const phoneTrim = raw.phone.trim();
	const name = `${raw.firstName.trim()} ${raw.lastName.trim()}`.trim();
	const firstName = raw.firstName.trim();
	const rolesJson =
		raw.role === 'dietitian' ? JSON.stringify(['dietitian']) : JSON.stringify(['patient']);
	const orgName =
		raw.role === 'dietitian' ? `${name} — عيادة` : `${name}`.slice(0, 200) || emailLower;
	const orgType = raw.role === 'dietitian' ? 'clinic' : 'individual';

	const conflict = await findRegistrationConflict(emailLower, usernameLower, phoneTrim);
	if (conflict === 'email') {
		return { ok: false, fieldErrors: { email: AR_REGISTER.registerEmailExists } };
	}
	if (conflict === 'username') {
		return { ok: false, fieldErrors: { username: AR_REGISTER.registerUsernameExists } };
	}
	if (conflict === 'phone') {
		return { ok: false, fieldErrors: { phone: AR_REGISTER.registerPhoneExists } };
	}

	const now = new Date().toISOString();
	const passwordHash = await bcrypt.hash(raw.password, 10);

	let userId: number;

	try {
		userId = db.transaction((tx) => {
			const u = tx
				.insert(users)
				.values({
					name,
					email: emailLower,
					username: usernameLower,
					phone: phoneTrim,
					password: passwordHash,
					emailVerifiedAt: null,
					createdAt: now,
					updatedAt: now
				})
				.returning({ id: users.id })
				.get();

			const uid = u.id;

			const org = tx
				.insert(organizations)
				.values({
					name: orgName,
					type: orgType,
					createdAt: now,
					updatedAt: now
				})
				.returning({ id: organizations.id })
				.get();

			tx.insert(memberships)
				.values({
					organizationId: org.id,
					userId: uid,
					roles: rolesJson,
					createdAt: now,
					updatedAt: now
				})
				.run();

			return uid;
		});
	} catch (e) {
		console.error(e);
		return { ok: false, fieldErrors: { _form: AR_AUTH.loginServerError } };
	}

	try {
		await issueRegistrationOtp(userId, firstName);
	} catch (e) {
		console.error(e);
		await db.delete(users).where(eq(users.id, userId));
		return { ok: false, mailError: true };
	}

	return { ok: true, email: emailLower };
}
