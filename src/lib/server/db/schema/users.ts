import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull(),
	email: text('email').notNull().unique(),
	username: text('username').unique(),
	phone: text('phone').unique(),
	emailVerifiedAt: text('email_verified_at'),
	password: text('password').notNull(),
	rememberToken: text('remember_token'),
	createdAt: text('created_at'),
	updatedAt: text('updated_at'),
	twoFactorSecret: text('two_factor_secret'),
	twoFactorRecoveryCodes: text('two_factor_recovery_codes'),
	twoFactorConfirmedAt: text('two_factor_confirmed_at')
});
