import { integer, sqliteTable, text, uniqueIndex, index } from 'drizzle-orm/sqlite-core';
import { users } from './users';

export const organizations = sqliteTable('organizations', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull(),
	type: text('type').notNull(),
	createdAt: text('created_at'),
	updatedAt: text('updated_at')
});

export const memberships = sqliteTable(
	'memberships',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		organizationId: integer('organization_id')
			.notNull()
			.references(() => organizations.id),
		userId: integer('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		roles: text('roles').notNull(),
		createdAt: text('created_at'),
		updatedAt: text('updated_at')
	},
	(t) => [
		uniqueIndex('memberships_org_user_idx').on(t.organizationId, t.userId),
		index('memberships_user_idx').on(t.userId)
	]
);
