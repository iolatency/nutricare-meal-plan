import type { PageServerLoad, Actions } from './$types';
import { error } from '@sveltejs/kit';
import {
	loadDietitianSupplementsPage,
	actionCreateSupplementFromForm,
	actionDeleteSupplement
} from '$lib/server/modules/supplements/dietitian-supplements-page.service';

export const load: PageServerLoad = async ({ url, locals }) => {
	if (!locals.user) error(401, 'يرجى تسجيل الدخول');
	if (locals.user.role !== 'dietitian') error(403, 'غير مصرح');
	const q = url.searchParams.get('q') ?? '';
	return loadDietitianSupplementsPage(q);
};

export const actions: Actions = {
	create: async ({ request }) => {
		const data = await request.formData();
		return actionCreateSupplementFromForm(data);
	},
	delete: async ({ request }) => {
		const data = await request.formData();
		return actionDeleteSupplement(data);
	}
};
