import type { RequestEvent } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import {
	getMembershipRolesForUser,
	findUserByEmail
} from '$lib/server/modules/users/user.repository';
import { membershipRolesToAppRole } from './membership-role';
import {
	deleteAuthSessionByToken,
	findUserBasicsForValidToken,
	getSessionExpiry,
	insertAuthSession,
	refreshAuthSession
} from './session.repository';
import type { SessionUser } from './auth.types';

export type { SessionUser } from './auth.types';

const SESSION_COOKIE = 'nc_session';
const SESSION_DAYS = 30;

export function generateToken(): string {
	return randomBytes(32).toString('hex');
}

export async function createSession(userId: number): Promise<string> {
	const token = generateToken();
	const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000).toISOString();
	await insertAuthSession(userId, token, expiresAt);
	return token;
}

export async function getUserFromToken(token: string): Promise<SessionUser | null> {
	const row = await findUserBasicsForValidToken(token);
	if (!row) return null;

	const rolesText = await getMembershipRolesForUser(row.id);
	const role = membershipRolesToAppRole(rolesText);

	return {
		id: row.id,
		name: row.name,
		email: row.email,
		role,
		canAccessPatientApp: role === 'dietitian' ? true : Boolean(row.canAccessPatientApp)
	};
}

export async function getUserFromCookie(event: RequestEvent): Promise<SessionUser | null> {
	const token = event.cookies.get(SESSION_COOKIE);
	if (!token) return null;

	const user = await getUserFromToken(token);
	if (!user) return null;

	// Sliding session: refresh expiry when less than 7 days remain
	const sessionRow = await getSessionExpiry(token);
	if (sessionRow) {
		const daysRemaining = (new Date(sessionRow.expiresAt).getTime() - Date.now()) / 86_400_000;
		if (daysRemaining < 7) {
			const newExpiry = new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString();
			await refreshAuthSession(token, newExpiry);
			setSessionCookie(event, token);
		}
	}

	return user;
}

export function setSessionCookie(event: RequestEvent, token: string) {
	event.cookies.set(SESSION_COOKIE, token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		maxAge: SESSION_DAYS * 86400,
		secure: !dev
	});
}

export function clearSessionCookie(event: RequestEvent) {
	event.cookies.delete(SESSION_COOKIE, { path: '/' });
}

export async function deleteSession(token: string) {
	await deleteAuthSessionByToken(token);
}

export type VerifyPasswordResult =
	| { ok: true; userId: number }
	| { ok: false; reason?: 'invalid_credentials' | 'email_unverified' };

export async function verifyEmailPassword(
	identifier: string,
	password: string
): Promise<VerifyPasswordResult> {
	const user = await findUserByEmail(identifier);
	if (!user) return { ok: false, reason: 'invalid_credentials' };
	const valid = await bcrypt.compare(password, user.password);
	if (!valid) return { ok: false, reason: 'invalid_credentials' };
	if (!user.emailVerifiedAt) return { ok: false, reason: 'email_unverified' };
	return { ok: true, userId: user.id };
}
