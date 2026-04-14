-- Collapse chat_messages table into a JSON array on chat_conversations.
-- Eliminates one table and all per-message DB queries.

-- 1. Add new columns
ALTER TABLE chat_conversations ADD COLUMN messages TEXT NOT NULL DEFAULT '[]';
--> statement-breakpoint
ALTER TABLE chat_conversations ADD COLUMN last_message_body TEXT;
--> statement-breakpoint
ALTER TABLE chat_conversations ADD COLUMN last_message_at TEXT;
--> statement-breakpoint

-- 2. Migrate existing messages into JSON (chronological order inside array)
UPDATE chat_conversations SET
  messages = COALESCE(
    (
      SELECT json_group_array(
        json_object(
          'id',            CAST(m.id AS TEXT),
          'conversationId', m.conversation_id,
          'senderUserId',  m.sender_user_id,
          'body',          m.body,
          'createdAt',     m.created_at,
          'readAt',        m.read_at
        )
      )
      FROM (
        SELECT * FROM chat_messages
        WHERE conversation_id = chat_conversations.id
        ORDER BY datetime(created_at) ASC, id ASC
      ) m
    ),
    '[]'
  ),
  last_message_body = (
    SELECT body FROM chat_messages
    WHERE conversation_id = chat_conversations.id
    ORDER BY datetime(created_at) DESC, id DESC LIMIT 1
  ),
  last_message_at = (
    SELECT created_at FROM chat_messages
    WHERE conversation_id = chat_conversations.id
    ORDER BY datetime(created_at) DESC, id DESC LIMIT 1
  );
--> statement-breakpoint

-- 3. Add index on last_message_at for fast list sorting
CREATE INDEX IF NOT EXISTS chat_conv_last_msg_idx ON chat_conversations (last_message_at);
--> statement-breakpoint

-- 4. Drop the old table and its indexes
DROP INDEX IF EXISTS chat_msg_conv_created_idx;
--> statement-breakpoint
DROP INDEX IF EXISTS chat_msg_conv_read_idx;
--> statement-breakpoint
DROP TABLE chat_messages;
