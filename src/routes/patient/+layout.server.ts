import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	if (!locals.user) redirect(302, '/login');
	if (locals.user.role !== 'patient') redirect(302, '/');
	if (
		!locals.user.canAccessPatientApp &&
		!url.pathname.startsWith('/patient/awaiting-activation')
	) {
		redirect(302, '/patient/awaiting-activation');
	}
	return { user: locals.user };
};
