import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { deleteSession, clearSessionCookie } from '$lib/server/modules/auth/auth.service';

export const POST: RequestHandler = async (event) => {
	const token = event.cookies.get('nc_session');
	if (token) await deleteSession(token);
	clearSessionCookie(event);
	redirect(302, '/login');
};

export const GET: RequestHandler = async (event) => {
	const token = event.cookies.get('nc_session');
	if (token) await deleteSession(token);
	clearSessionCookie(event);
	redirect(302, '/login');
};