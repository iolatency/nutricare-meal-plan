import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { users } from './users';

export const organizations = sqliteTable('organizations', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull(),
	type: text('type').notNull(),
	createdAt: text('created_at'),
	updatedAt: text('updated_at')
});

export const memberships = sqliteTable('memberships', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	organizationId: integer('organization_id')
		.notNull()
		.references(() => organizations.id),
	userId: integer('user_id')
		.notNull()
		.references(() => users.id),
	roles: text('roles').notNull(),
	createdAt: text('created_at'),
	updatedAt: text('updated_at')
});

export const inputs = sqliteTable('inputs', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull(),
	trackable: integer('trackable', { mode: 'boolean' }).notNull(),
	required: integer('required', { mode: 'boolean' }).notNull(),
	createdAt: text('created_at'),
	updatedAt: text('updated_at')
});

export const calculations = sqliteTable('calculations', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull(),
	relatedFunction: text('related_function').notNull(),
	createdAt: text('created_at'),
	updatedAt: text('updated_at')
});

export const calculationDependencies = sqliteTable('calculation_dependencies', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	calculationId: integer('calculation_id')
		.notNull()
		.references(() => calculations.id),
	dependableType: text('dependable_type').notNull(),
	dependableId: integer('dependable_id').notNull(),
	createdAt: text('created_at'),
	updatedAt: text('updated_at')
});

export const patients = sqliteTable('patients', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	organizationId: integer('organization_id')
		.notNull()
		.references(() => organizations.id),
	createdAt: text('created_at'),
	updatedAt: text('updated_at')
});

export const patientLogs = sqliteTable('patient_logs', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	patientId: integer('patient_id')
		.notNull()
		.references(() => patients.id),
	inputId: integer('input_id')
		.notNull()
		.references(() => inputs.id),
	value: text('value').notNull(),
	createdAt: text('created_at'),
	updatedAt: text('updated_at')
});

export const patientVisits = sqliteTable('patient_visits', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	patientId: integer('patient_id')
		.notNull()
		.references(() => patients.id),
	createdAt: text('created_at'),
	updatedAt: text('updated_at')
});
