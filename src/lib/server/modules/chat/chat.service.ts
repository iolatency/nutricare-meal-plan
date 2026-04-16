import { db } from '$lib/server/db';
import {
	chatConversations,
	chatMessages,
	memberships,
	mealPlanSessions,
	users
} from '$lib/server/db/schema';
import { and, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { publishChatEvent } from './chat-events';
import type { ChatConversationDTO, ChatMessageDTO } from './chat.types';
import { membershipRolesToAppRole } from '$lib/server/modules/auth/membership-role';

export class ChatForbiddenError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ChatForbiddenError';
	}
}

export class ChatNotFoundError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ChatNotFoundError';
	}
}

export class ChatValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ChatValidationError';
	}
}

/** Same org + patient/client role membership as dietitian meal-plan list. */
export function getOrgPatientUserIdsForDietitian(dietitianId: number): number[] {
	const myMembership = db
		.select({ orgId: memberships.organizationId })
		.from(memberships)
		.where(eq(memberships.userId, dietitianId))
		.get();
	if (!myMembership) return [];

	const orgMembers = db
		.select({ userId: memberships.userId, roles: memberships.roles })
		.from(memberships)
		.where(eq(memberships.organizationId, myMembership.orgId))
		.all();

	return orgMembers
		.filter((m) => {
			const lower = (m.roles ?? '').toLowerCase();
			return lower.includes('patient') || lower.includes('client');
		})
		.map((m) => m.userId);
}

export function isClientInDietitianOrg(dietitianId: number, clientId: number): boolean {
	return getOrgPatientUserIdsForDietitian(dietitianId).includes(clientId);
}

export function hasMealPlanSessionPair(clientId: number, dietitianId: number): boolean {
	return !!db
		.select({ id: mealPlanSessions.id })
		.from(mealPlanSessions)
		.where(
			and(eq(mealPlanSessions.clientId, clientId), eq(mealPlanSessions.dietitianId, dietitianId))
		)
		.limit(1)
		.get();
}

export type SessionPickRow = {
	id: number;
	dietitianId: number;
	status: 'draft' | 'active' | 'completed';
};

/** Prefer latest-by-id active, else latest-by-id draft; else null (completed-only or empty). */
export function pickDietitianFromSessionRows(rows: SessionPickRow[]): number | null {
	if (!rows.length) return null;
	const sorted = [...rows].sort((a, b) => b.id - a.id);
	const active = sorted.find((s) => s.status === 'active');
	if (active) return active.dietitianId;
	const draft = sorted.find((s) => s.status === 'draft');
	if (draft) return draft.dietitianId;
	return null;
}

/**
 * Prefer latest active session, else latest draft; else a dietitian in the patient's organization
 * (e.g. after activation before any meal plan exists); else null.
 */
export function resolveDietitianIdForPatient(clientId: number): number | null {
	const rows = db
		.select({
			id: mealPlanSessions.id,
			dietitianId: mealPlanSessions.dietitianId,
			status: mealPlanSessions.status
		})
		.from(mealPlanSessions)
		.where(eq(mealPlanSessions.clientId, clientId))
		.orderBy(desc(mealPlanSessions.id))
		.all() as SessionPickRow[];

	const fromSessions = pickDietitianFromSessionRows(rows);
	if (fromSessions != null) return fromSessions;

	const patientMemberships = db
		.select({ organizationId: memberships.organizationId })
		.from(memberships)
		.where(eq(memberships.userId, clientId))
		.all();

	for (const { organizationId } of patientMemberships) {
		const orgMembers = db
			.select({ userId: memberships.userId, roles: memberships.roles })
			.from(memberships)
			.where(eq(memberships.organizationId, organizationId))
			.all();

		for (const m of orgMembers) {
			if (m.userId === clientId) continue;
			if (membershipRolesToAppRole(m.roles) === 'dietitian') {
				return m.userId;
			}
		}
	}

	return null;
}

function userSnippet(row: { id: number; name: string; phone: string | null } | undefined): {
	id: number;
	phone: string | null;
	name: string;
} | null {
	if (!row) return null;
	return { id: row.id, phone: row.phone, name: row.name };
}

export function listConversationsForUser(
	userId: number,
	role: 'dietitian' | 'patient'
): ChatConversationDTO[] {
	const where =
		role === 'dietitian' ? `c.dietitian_id = ?` : `c.client_id = ?`;
	const rawSql = `
		SELECT
			c.id,
			c.dietitian_id AS dietitianId,
			c.client_id AS clientId,
			c.created_at AS createdAt,
			c.updated_at AS updatedAt,
			cu.id AS clientUserId,
			cu.name AS clientName,
			cu.phone AS clientPhone,
			du.id AS dietUserId,
			du.name AS dietName,
			du.phone AS dietPhone,
			(SELECT m.body FROM chat_messages m WHERE m.conversation_id = c.id
				ORDER BY datetime(m.created_at) DESC, m.id DESC LIMIT 1) AS lastMessageBody,
			(SELECT m.created_at FROM chat_messages m WHERE m.conversation_id = c.id
				ORDER BY datetime(m.created_at) DESC, m.id DESC LIMIT 1) AS lastMessageAt,
			(SELECT COUNT(*) FROM chat_messages m WHERE m.conversation_id = c.id
				AND m.read_at IS NULL AND m.sender_user_id != ?) AS unreadCount
		FROM chat_conversations c
		INNER JOIN users cu ON cu.id = c.client_id
		INNER JOIN users du ON du.id = c.dietitian_id
		WHERE ${where}
		ORDER BY datetime(c.updated_at) DESC, c.id DESC
	`;
	const stmt = db.$client.prepare(rawSql);
	const rows = stmt.all(userId, userId) as Array<{
		id: number;
		dietitianId: number;
		clientId: number;
		createdAt: string;
		updatedAt: string;
		clientUserId: number;
		clientName: string;
		clientPhone: string | null;
		dietUserId: number;
		dietName: string;
		dietPhone: string | null;
		lastMessageBody: string | null;
		lastMessageAt: string | null;
		unreadCount: number;
	}>;

	return rows.map((r) => ({
		id: r.id,
		dietitianId: r.dietitianId,
		clientId: r.clientId,
		clientUser: userSnippet({
			id: r.clientUserId,
			name: r.clientName,
			phone: r.clientPhone
		}),
		dietitianUser: userSnippet({
			id: r.dietUserId,
			name: r.dietName,
			phone: r.dietPhone
		}),
		lastMessageBody: r.lastMessageBody,
		lastMessageAt: r.lastMessageAt,
		unreadCount: Number(r.unreadCount) || 0,
		createdAt: r.createdAt,
		updatedAt: r.updatedAt
	}));
}

export function getConversationRow(conversationId: number) {
	return db.select().from(chatConversations).where(eq(chatConversations.id, conversationId)).get();
}

export function assertParticipant(userId: number, conv: typeof chatConversations.$inferSelect): void {
	if (conv.clientId !== userId && conv.dietitianId !== userId) {
		throw new ChatForbiddenError('Not a participant in this conversation.');
	}
}

export function getOrCreateForPatient(patientUserId: number): ChatConversationDTO {
	const dietitianId = resolveDietitianIdForPatient(patientUserId);
	if (dietitianId == null) {
		throw new ChatValidationError('لا يوجد أخصائي تغذية مرتبط بهذا الحساب بعد.');
	}
	if (
		!isClientInDietitianOrg(dietitianId, patientUserId) &&
		!hasMealPlanSessionPair(patientUserId, dietitianId)
	) {
		throw new ChatForbiddenError('غير مصرح ببدء المحادثة.');
	}

	const now = new Date().toISOString();
	db.insert(chatConversations)
		.values({
			dietitianId,
			clientId: patientUserId,
			createdAt: now,
			updatedAt: now
		})
		.onConflictDoNothing({
			target: [chatConversations.dietitianId, chatConversations.clientId]
		})
		.run();

	const row = db
		.select()
		.from(chatConversations)
		.where(
			and(
				eq(chatConversations.dietitianId, dietitianId),
				eq(chatConversations.clientId, patientUserId)
			)
		)
		.get();
	if (!row) throw new ChatNotFoundError('Conversation not found.');

	return listConversationsForUser(patientUserId, 'patient').find((c) => c.id === row.id)!;
}

export function getOrCreateForDietitian(dietitianId: number, clientId: number): ChatConversationDTO {
	if (!isClientInDietitianOrg(dietitianId, clientId)) {
		throw new ChatForbiddenError('You can only chat with clients in your organization.');
	}

	const now = new Date().toISOString();
	db.insert(chatConversations)
		.values({
			dietitianId,
			clientId,
			createdAt: now,
			updatedAt: now
		})
		.onConflictDoNothing({
			target: [chatConversations.dietitianId, chatConversations.clientId]
		})
		.run();

	const row = db
		.select()
		.from(chatConversations)
		.where(
			and(eq(chatConversations.dietitianId, dietitianId), eq(chatConversations.clientId, clientId))
		)
		.get();
	if (!row) throw new ChatNotFoundError('Conversation not found.');

	const list = listConversationsForUser(dietitianId, 'dietitian');
	return list.find((c) => c.id === row.id)!;
}

export function listMessages(
	conversationId: number,
	userId: number,
	opts: { limit: number; offset: number }
): { results: ChatMessageDTO[]; count: number } {
	const conv = getConversationRow(conversationId);
	if (!conv) throw new ChatNotFoundError('Conversation not found.');
	assertParticipant(userId, conv);

	const countRow = db
		.select({ n: sql<number>`count(*)`.mapWith(Number) })
		.from(chatMessages)
		.where(eq(chatMessages.conversationId, conversationId))
		.get();
	const count = countRow?.n ?? 0;

	const rows = db
		.select({
			id: chatMessages.id,
			conversationId: chatMessages.conversationId,
			senderUserId: chatMessages.senderUserId,
			body: chatMessages.body,
			createdAt: chatMessages.createdAt,
			readAt: chatMessages.readAt
		})
		.from(chatMessages)
		.where(eq(chatMessages.conversationId, conversationId))
		.orderBy(desc(chatMessages.createdAt), desc(chatMessages.id))
		.limit(opts.limit)
		.offset(opts.offset)
		.all();

	return {
		count,
		results: rows.map((r) => ({
			id: r.id,
			conversationId: r.conversationId,
			senderUserId: r.senderUserId,
			body: r.body,
			createdAt: r.createdAt,
			readAt: r.readAt
		}))
	};
}

export function createMessage(
	conversationId: number,
	senderUserId: number,
	body: string
): ChatMessageDTO {
	const trimmed = body.trim();
	if (!trimmed) throw new ChatValidationError('Message body is required.');

	const conv = getConversationRow(conversationId);
	if (!conv) throw new ChatNotFoundError('Conversation not found.');
	assertParticipant(senderUserId, conv);

	const now = new Date().toISOString();

	const inserted = db
		.insert(chatMessages)
		.values({
			conversationId,
			senderUserId,
			body: trimmed,
			readAt: null,
			createdAt: now
		})
		.returning({
			id: chatMessages.id,
			conversationId: chatMessages.conversationId,
			senderUserId: chatMessages.senderUserId,
			body: chatMessages.body,
			createdAt: chatMessages.createdAt,
			readAt: chatMessages.readAt
		})
		.get();

	db.update(chatConversations)
		.set({ updatedAt: now })
		.where(eq(chatConversations.id, conversationId))
		.run();

	if (!inserted) throw new ChatNotFoundError('Failed to create message.');

	const dto: ChatMessageDTO = {
		id: inserted.id,
		conversationId: inserted.conversationId,
		senderUserId: inserted.senderUserId,
		body: inserted.body,
		createdAt: inserted.createdAt,
		readAt: inserted.readAt
	};

	publishChatEvent(conversationId, {
		type: 'message.created',
		message: {
			id: dto.id,
			conversationId: dto.conversationId,
			senderUserId: dto.senderUserId,
			body: dto.body,
			createdAt: dto.createdAt,
			readAt: dto.readAt
		}
	});

	return dto;
}

export function markConversationRead(
	conversationId: number,
	readerUserId: number
): { updated: number; readAt: string } {
	const conv = getConversationRow(conversationId);
	if (!conv) throw new ChatNotFoundError('Conversation not found.');
	assertParticipant(readerUserId, conv);

	const readAt = new Date().toISOString();

	const result = db
		.update(chatMessages)
		.set({ readAt })
		.where(
			and(
				eq(chatMessages.conversationId, conversationId),
				isNull(chatMessages.readAt),
				ne(chatMessages.senderUserId, readerUserId)
			)
		)
		.run();

	const updated = Number(result.changes ?? 0);

	publishChatEvent(conversationId, {
		type: 'message.read.updated',
		conversationId,
		updated,
		readAt,
		readerUserId
	});

	return { updated, readAt };
}

/** Load patient rows for dietitian inbox (same shape as meal-plan list patients). */
export function loadDietitianChatPatients(dietitianId: number) {
	const ids = getOrgPatientUserIdsForDietitian(dietitianId);
	if (!ids.length) return [];

	return db
		.select({
			id: users.id,
			name: users.name,
			email: users.email,
			phone: users.phone
		})
		.from(users)
		.where(inArray(users.id, ids))
		.all();
}
