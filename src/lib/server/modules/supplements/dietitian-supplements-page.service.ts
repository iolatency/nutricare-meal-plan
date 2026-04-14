import { db } from '$lib/server/db';
import { supplements } from '$lib/server/db/schema';
import { like, eq } from 'drizzle-orm';
import { fail, type ActionFailure } from '@sveltejs/kit';

export async function loadDietitianSupplementsPage(q: string) {
	const all =
		q.length >= 2
			? db.select().from(supplements).where(like(supplements.name, `%${q}%`)).limit(100).all()
			: db.select().from(supplements).limit(100).all();
	return { supplements: all, q };
}

export async function actionCreateSupplementFromForm(
	data: FormData
): Promise<ActionFailure<{ error: string }> | { success: true }> {
	const name = data.get('name')?.toString().trim() ?? '';
	if (!name) return fail(400, { error: 'اسم المكمل مطلوب' });

	db.insert(supplements)
		.values({
			name,
			kcalPerMl: parseFloat(data.get('kcalPerMl')?.toString() ?? '0') || null,
			totalKcal: parseFloat(data.get('totalKcal')?.toString() ?? '0') || null,
			volumeMl: parseFloat(data.get('volumeMl')?.toString() ?? '0') || null,
			carbs: parseFloat(data.get('carbs')?.toString() ?? '0') || null,
			fat: parseFloat(data.get('fat')?.toString() ?? '0') || null,
			protein: parseFloat(data.get('protein')?.toString() ?? '0') || null,
			sodium: parseFloat(data.get('sodium')?.toString() ?? '0') || null,
			potassium: parseFloat(data.get('potassium')?.toString() ?? '0') || null,
			calcium: parseFloat(data.get('calcium')?.toString() ?? '0') || null,
			osmolarity: parseFloat(data.get('osmolarity')?.toString() ?? '0') || null,
			reference: data.get('reference')?.toString() || null
		})
		.run();

	return { success: true };
}

export async function actionDeleteSupplement(data: FormData): Promise<{ success: true }> {
	const id = parseInt(data.get('id')?.toString() ?? '0');
	db.delete(supplements).where(eq(supplements.id, id)).run();
	return { success: true };
}
