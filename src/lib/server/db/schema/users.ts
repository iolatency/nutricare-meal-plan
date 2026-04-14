import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull(),
	email: text('email').notNull().unique(),
	username: text('username').unique(),
	phone: text('phone').unique(),
	emailVerifiedAt: text('email_verified_at'),
	password: text('password').notNull(),
	createdAt: text('created_at'),
	updatedAt: text('updated_at'),
	/** When false, patient accounts cannot use /patient routes until a dietitian activates them. */
	canAccessPatientApp: integer('can_access_patient_app', { mode: 'boolean' })
		.notNull()
		.default(true)
});
