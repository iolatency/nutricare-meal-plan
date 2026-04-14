import { db } from '$lib/server/db';
import { supplements } from '$lib/server/db/schema';
import { eq, like } from 'drizzle-orm';

const ALLOWED_SUPPLEMENT_FIELDS = new Set([
	'name',
	'kcalPerMl',
	'totalKcal',
	'volumeMl',
	'carbs',
	'fat',
	'protein',
	'sodium',
	'potassium',
	'magnesium',
	'phosphorus',
	'calcium',
	'waterMl',
	'fiber',
	'osmolality',
	'osmolarity',
	'reference',
	'patientCategory',
	'formulaCategory',
	'isActive'
]);

export function listSupplements(query: string, limit: number, offset: number) {
	return query.length >= 2
		? db
				.select()
				.from(supplements)
				.where(like(supplements.name, `%${query}%`))
				.limit(limit)
				.offset(offset)
				.all()
		: db.select().from(supplements).limit(limit).offset(offset).all();
}

export function createSupplement(payload: unknown) {
	const [created] = db.insert(supplements).values(payload as typeof supplements.$inferInsert).returning().all();
	return created;
}

export function updateSupplement(id: number, payload: Record<string, unknown>) {
	const safe = Object.fromEntries(
		Object.entries(payload).filter(([key]) => ALLOWED_SUPPLEMENT_FIELDS.has(key))
	);
	if (!Object.keys(safe).length) return false;
	db.update(supplements).set(safe).where(eq(supplements.id, id)).run();
	return true;
}

export function deleteSupplement(id: number) {
	db.delete(supplements).where(eq(supplements.id, id)).run();
}
