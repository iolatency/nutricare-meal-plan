import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		redirect(302, '/login');
	}

	// Route dietitians directly to the dietitian workspace instead of
	// showing the temporary placeholder page.
	if (locals.user.role === 'dietitian') {
		redirect(302, '/dietitian/recipes');
	}

	if (locals.user.role === 'patient') {
		if (!locals.user.canAccessPatientApp) {
			redirect(302, '/patient/awaiting-activation');
		}
		redirect(302, '/patient');
	}

	return { user: locals.user };
};
