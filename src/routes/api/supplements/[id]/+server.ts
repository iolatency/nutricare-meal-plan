import type { RequestHandler } from './$types';
import { requireRole } from '$lib/server/authz/policy';
import { json, error } from '@sveltejs/kit';
import {
	deleteSupplement,
	updateSupplement
} from '$lib/server/modules/supplements/supplements.service';

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	requireRole(locals.user, 'dietitian');
	const id = parseInt(params.id);
	const body = await request.json();
	const updated = updateSupplement(id, body as Record<string, unknown>);
	if (!updated) error(400, 'No valid fields to update');
	return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	requireRole(locals.user, 'dietitian');
	const id = parseInt(params.id);
	deleteSupplement(id);
	return json({ ok: true });
};
