import { integer, sqliteTable, text, index } from 'drizzle-orm/sqlite-core';
import { users } from './users';

export const authSessions = sqliteTable(
	'auth_sessions',
	{
		token: text('token').primaryKey(),
		userId: integer('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		expiresAt: text('expires_at').notNull()
	},
	(t) => [index('auth_sessions_expires_at_idx').on(t.expiresAt)]
);
