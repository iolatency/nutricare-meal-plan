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
