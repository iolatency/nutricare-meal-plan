import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { requireUser } from '$lib/server/authz/policy';
import {
	ChatForbiddenError,
	ChatNotFoundError,
	ChatValidationError,
	getOrCreateForDietitian,
	getOrCreateForPatient
} from '$lib/server/modules/chat/chat.service';

export const POST: RequestHandler = async ({ request, locals }) => {
	const user = requireUser(locals.user);
	try {
		if (user.role === 'patient') {
			const conv = getOrCreateForPatient(user.id);
			return json(conv);
		}
		if (user.role === 'dietitian') {
			const body = (await request.json().catch(() => ({}))) as { clientId?: number };
			const clientId = body.clientId;
			if (typeof clientId !== 'number' || !Number.isFinite(clientId)) {
				throw error(400, 'clientId is required for dietitian.');
			}
			const conv = getOrCreateForDietitian(user.id, clientId);
			return json(conv);
		}
		throw error(403, 'Forbidden');
	} catch (e) {
		if (e && typeof e === 'object' && 'status' in e) throw e;
		if (e instanceof ChatValidationError) throw error(400, e.message);
		if (e instanceof ChatForbiddenError) throw error(403, e.message);
		if (e instanceof ChatNotFoundError) throw error(404, e.message);
		throw error(500, 'Chat error');
	}
};
