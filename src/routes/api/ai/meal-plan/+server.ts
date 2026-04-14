import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { checkAiRateLimit } from '$lib/server/ai/rate-limiter';
import {
	generateAiMealPlan,
	type AiMealPlanRequestBody
} from '$lib/server/modules/meal-plan/ai-meal-plan.service';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) error(401, 'Unauthorized');

	const rateCheck = checkAiRateLimit(locals.user.id);
	if (!rateCheck.allowed) error(429, 'Too many requests. Please wait before generating again.');

	const body = (await request.json()) as AiMealPlanRequestBody;
	const result = await generateAiMealPlan(body);

	if (!result.ok) {
		if (result.status === 404) error(404, result.body.error);
		return json(result.body, { status: result.status });
	}

	return json(result.body);
};
