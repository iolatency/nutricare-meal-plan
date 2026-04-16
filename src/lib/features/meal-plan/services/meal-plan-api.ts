export async function generateMealPlanWithAi(payload: Record<string, unknown>) {
	return fetch('/api/ai/meal-plan', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(payload)
	});
}

export async function saveMealPlan(formData: FormData) {
	return fetch('?/savePlan', { method: 'POST', body: formData });
}

export async function upsertDiagnosis(action: 'createDiagnosis' | 'updateDiagnosis', formData: FormData) {
	return fetch(`?/${action}`, { method: 'POST', body: formData });
}

export async function publishMealPlan() {
	return fetch('?/publishPlan', { method: 'POST', body: new FormData() });
}

export async function clearMealPlanMeals(dateYmd?: string) {
	const body = new FormData();
	if (dateYmd) body.append('date', dateYmd);
	return fetch('?/clearMeals', { method: 'POST', body });
}

export type MealPlanShareScope = 'day' | 'week';

export async function createMealPlanShareLink(payload: {
	sessionId: number;
	scope: MealPlanShareScope;
	anchorDate: string;
}) {
	return fetch('/api/meal-plan/share', {
		method: 'POST',
		credentials: 'include',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(payload)
	});
}
