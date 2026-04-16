export type ChatUserSnippet = {
	id: number;
	phone: string | null;
	name: string;
};

export type ChatConversationDTO = {
	id: number;
	dietitianId: number;
	clientId: number;
	clientUser: ChatUserSnippet | null;
	dietitianUser: ChatUserSnippet | null;
	lastMessageBody: string | null;
	lastMessageAt: string | null;
	unreadCount: number;
	createdAt: string;
	updatedAt: string;
};

export type ChatMessageDTO = {
	id: number;
	conversationId: number;
	senderUserId: number;
	body: string;
	createdAt: string;
	readAt: string | null;
};
