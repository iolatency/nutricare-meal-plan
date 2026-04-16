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
		createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
		updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`)
	},
	(t) => [
		uniqueIndex('chat_conv_dietitian_client_idx').on(t.dietitianId, t.clientId),
		index('chat_conv_dietitian_updated_idx').on(t.dietitianId, t.updatedAt),
		index('chat_conv_client_updated_idx').on(t.clientId, t.updatedAt)
	]
);

export const chatMessages = sqliteTable(
	'chat_messages',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		conversationId: integer('conversation_id')
			.notNull()
			.references(() => chatConversations.id, { onDelete: 'cascade' }),
		senderUserId: integer('sender_user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'restrict' }),
		body: text('body').notNull(),
		readAt: text('read_at'),
		createdAt: text('created_at').notNull().default(sql`(datetime('now'))`)
	},
	(t) => [
		index('chat_msg_conv_created_idx').on(t.conversationId, t.createdAt),
		index('chat_msg_conv_read_idx').on(t.conversationId, t.readAt)
	]
);
