import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core';
import { users } from './users';

export const chatConversations = sqliteTable(
	'chat_conversations',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		dietitianId: integer('dietitian_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		clientId: integer('client_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		/** JSON array of message objects: [{id, senderUserId, body, createdAt, readAt}] */
		messages: text('messages').notNull().default('[]'),
		/** Denormalized: body of the latest message for fast list rendering. */
		lastMessageBody: text('last_message_body'),
		/** Denormalized: ISO timestamp of the latest message for sorting. */
		lastMessageAt: text('last_message_at'),
		createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
		updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`)
	},
	(t) => [
		uniqueIndex('chat_conv_dietitian_client_idx').on(t.dietitianId, t.clientId),
		index('chat_conv_last_msg_idx').on(t.lastMessageAt),
		index('chat_conv_dietitian_updated_idx').on(t.dietitianId, t.updatedAt),
		index('chat_conv_client_updated_idx').on(t.clientId, t.updatedAt)
	]
);
