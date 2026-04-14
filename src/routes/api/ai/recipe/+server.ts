import type { RequestHandler } from './$types';
import { generateRecipe } from '$lib/server/ai/recipe';
import { checkAiRateLimit } from '$lib/server/ai/rate-limiter';
import { json, error } from '@sveltejs/kit';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user || locals.user.role !== 'dietitian') error(403, 'Forbidden');

	const rateCheck = checkAiRateLimit(locals.user.id);
	if (!rateCheck.allowed) error(429, 'Too many requests. Please wait before generating again.');

	const body = (await request.json()) as {
		name: string;
		categoryId?: number;
		targetCalories?: number;
		portions?: number;
		macroRatios?: { carbs: number; protein: number; fat: number };
		additionalInstructions?: string;
	};

	const recipeId = await generateRecipe(body.name, locals.user.id, {
		categoryId: body.categoryId,
		targetCalories: body.targetCalories,
		portions: body.portions,
		macroRatios: body.macroRatios,
		additionalInstructions: body.additionalInstructions
	});

	return json({ recipeId });
};
