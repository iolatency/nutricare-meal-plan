import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { users } from './users';
export const registrationEmailOtp = sqliteTable('registration_email_otp', {
	userId: integer('user_id')
		.primaryKey()
		.references(() => users.id, { onDelete: 'cascade' }),
	otpHash: text('otp_hash').notNull(),
	expiresAt: text('expires_at').notNull(),
	attempts: integer('attempts').notNull().default(0),
	resendCount: integer('resend_count').notNull().default(0),
	resendWindowStartedAt: text('resend_window_started_at')
});
