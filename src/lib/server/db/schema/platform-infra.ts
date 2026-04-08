import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const schemaMigrations = sqliteTable('migrations', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	migration: text('migration').notNull(),
	batch: integer('batch').notNull()
});

export const serverSessions = sqliteTable('sessions', {
	id: text('id').primaryKey(),
	userId: integer('user_id'),
	ipAddress: text('ip_address'),
	userAgent: text('user_agent'),
	payload: text('payload').notNull(),
	lastActivity: integer('last_activity').notNull()
});

export const passwordResetTokens = sqliteTable('password_reset_tokens', {
	email: text('email').primaryKey(),
	token: text('token').notNull(),
	createdAt: text('created_at')
});

export const cache = sqliteTable('cache', {
	key: text('key').primaryKey(),
	value: text('value').notNull(),
	expiration: integer('expiration').notNull()
});

export const cacheLocks = sqliteTable('cache_locks', {
	key: text('key').primaryKey(),
	owner: text('owner').notNull(),
	expiration: integer('expiration').notNull()
});

export const jobs = sqliteTable('jobs', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	queue: text('queue').notNull(),
	payload: text('payload').notNull(),
	attempts: integer('attempts').notNull(),
	reservedAt: integer('reserved_at'),
	availableAt: integer('available_at').notNull(),
	createdAt: integer('created_at').notNull()
});

export const jobBatches = sqliteTable('job_batches', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	totalJobs: integer('total_jobs').notNull(),
	pendingJobs: integer('pending_jobs').notNull(),
	failedJobs: integer('failed_jobs').notNull(),
	failedJobIds: text('failed_job_ids').notNull(),
	options: text('options'),
	cancelledAt: integer('cancelled_at'),
	createdAt: integer('created_at').notNull(),
	finishedAt: integer('finished_at')
});

export const failedJobs = sqliteTable('failed_jobs', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	uuid: text('uuid').notNull().unique(),
	connection: text('connection').notNull(),
	queue: text('queue').notNull(),
	payload: text('payload').notNull(),
	exception: text('exception').notNull(),
	failedAt: text('failed_at')
		.notNull()
		.default(sql`(CURRENT_TIMESTAMP)`)
});
