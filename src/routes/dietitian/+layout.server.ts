import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(302, '/login');
	if (locals.user.role !== 'dietitian') redirect(302, '/');
	return { user: locals.user };
};
