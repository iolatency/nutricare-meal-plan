import type { PageServerLoad } from './$types';
import { loadMealPlanTrackingPage } from '$lib/server/modules/meal-plan/meal-plan-tracking.service';

function toLocalYmd(d: Date) {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${y}-${m}-${day}`;
}

export const load: PageServerLoad = async ({ locals, params, url }) => {
	const dietitianId = locals.user!.id;
	const sessionId = parseInt(params.sessionId);
	const planType = (url.searchParams.get('type') ?? 'weekly') as 'daily' | 'weekly';
	const dateParam = url.searchParams.get('date') ?? toLocalYmd(new Date());

	return loadMealPlanTrackingPage({ sessionId, dietitianId, planType, dateParam });
};
