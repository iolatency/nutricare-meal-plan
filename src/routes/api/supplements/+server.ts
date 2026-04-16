import type { RequestHandler } from './$types';
import { requireRole, requireUser } from '$lib/server/authz/policy';
import {
	createSupplement,
	listSupplements
} from '$lib/server/modules/supplements/supplements.service';
import { json } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ url, locals }) => {
	requireUser(locals.user);
	const q = url.searchParams.get('q') ?? '';
	const limitRaw = parseInt(url.searchParams.get('limit') ?? '50');
	const limit = Math.min(100, Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 50);
	const offset = Math.max(0, parseInt(url.searchParams.get('offset') ?? '0') || 0);
	return json(listSupplements(q, limit, offset));
};

export const POST: RequestHandler = async ({ request, locals }) => {
	requireRole(locals.user, 'dietitian');
	const body = await request.json();
	return json(createSupplement(body));
};
