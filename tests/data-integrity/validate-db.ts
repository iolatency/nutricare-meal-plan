/**
 * Data Integrity Validation — SQLite (Drizzle)
 *
 * Adapted from the Great Expectations suite in the testing plan.
 * Runs against the local SQLite database to verify data quality constraints.
 *
 * Run: npx tsx tests/data-integrity/validate-db.ts
 *
 * Exit code 0 = all checks passed
 * Exit code 1 = one or more checks failed
 */

import Database from 'better-sqlite3';
import { resolve } from 'path';

const DB_PATH = resolve(process.cwd(), 'local.db');
const db = new Database(DB_PATH, { readonly: true });

interface CheckResult {
	name: string;
	passed: boolean;
	detail?: string;
}

const results: CheckResult[] = [];

function check(name: string, passed: boolean, detail?: string) {
	results.push({ name, passed, detail });
	const icon = passed ? '✓' : '✗';
	if (!passed) {
		console.error(`  ${icon} FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
	} else {
		console.log(`  ${icon} PASS: ${name}`);
	}
}

// ─── Users table ─────────────────────────────────────────────────────────────

console.log('\n=== Users ===');

const duplicateEmails = db
	.prepare<
		[],
		{ email: string; cnt: number }
	>(`SELECT email, COUNT(*) as cnt FROM users GROUP BY email HAVING cnt > 1`)
	.all();
check(
	'Email uniqueness',
	duplicateEmails.length === 0,
	`${duplicateEmails.length} duplicate emails found`
);

const nullEmails = db
	.prepare<
		[],
		{ cnt: number }
	>(`SELECT COUNT(*) as cnt FROM users WHERE email IS NULL OR email = ''`)
	.get()!;
check('No null/empty emails', nullEmails.cnt === 0, `${nullEmails.cnt} users without email`);

const nullNames = db
	.prepare<[], { cnt: number }>(`SELECT COUNT(*) as cnt FROM users WHERE name IS NULL OR name = ''`)
	.get()!;
check('No null/empty names', nullNames.cnt === 0, `${nullNames.cnt} users without name`);

const invalidEmails = db
	.prepare<
		[],
		{ cnt: number }
	>(`SELECT COUNT(*) as cnt FROM users WHERE email NOT LIKE '%@%' AND email != ''`)
	.get()!;
check('Email format valid', invalidEmails.cnt === 0, `${invalidEmails.cnt} malformed emails`);

// Passwords must be hashed (bcrypt starts with $2b$ or $2a$)
const plainPasswords = db
	.prepare<
		[],
		{ cnt: number }
	>(`SELECT COUNT(*) as cnt FROM users WHERE password IS NOT NULL AND password NOT LIKE '$2%'`)
	.get()!;
check(
	'Passwords are hashed (bcrypt)',
	plainPasswords.cnt === 0,
	`${plainPasswords.cnt} unhashed passwords`
);

const duplicateUsernames = db
	.prepare<
		[],
		{ username: string; cnt: number }
	>(`SELECT username, COUNT(*) as cnt FROM users WHERE username IS NOT NULL AND username != '' GROUP BY username HAVING cnt > 1`)
	.all();
check(
	'Username uniqueness',
	duplicateUsernames.length === 0,
	`${duplicateUsernames.length} duplicate usernames`
);

// ─── Sessions table ──────────────────────────────────────────────────────────

console.log('\n=== Auth Sessions ===');

const orphanedSessions = db
	.prepare<
		[],
		{ cnt: number }
	>(`SELECT COUNT(*) as cnt FROM auth_sessions WHERE user_id NOT IN (SELECT id FROM users)`)
	.get()!;
check(
	'No orphaned sessions',
	orphanedSessions.cnt === 0,
	`${orphanedSessions.cnt} orphaned sessions`
);

const sessionsWithoutExpiry = db
	.prepare<
		[],
		{ cnt: number }
	>(`SELECT COUNT(*) as cnt FROM auth_sessions WHERE expires_at IS NULL`)
	.get()!;
check(
	'All sessions have expiry',
	sessionsWithoutExpiry.cnt === 0,
	`${sessionsWithoutExpiry.cnt} sessions without expiry`
);

// ─── Meal Plan Sessions ──────────────────────────────────────────────────────

console.log('\n=== Meal Plan Sessions ===');

const mealPlanTableExists = db
	.prepare<
		[],
		{ cnt: number }
	>(`SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='table' AND name='meal_plan_sessions'`)
	.get()!;

if (mealPlanTableExists.cnt > 0) {
	const invalidStatus = db
		.prepare<
			[],
			{ cnt: number }
		>(`SELECT COUNT(*) as cnt FROM meal_plan_sessions WHERE status NOT IN ('draft', 'active', 'completed')`)
		.get()!;
	check(
		'Meal plan session status values valid',
		invalidStatus.cnt === 0,
		`${invalidStatus.cnt} invalid statuses`
	);

	const orphanedSessions2 = db
		.prepare<
			[],
			{ cnt: number }
		>(`SELECT COUNT(*) as cnt FROM meal_plan_sessions WHERE dietitian_id NOT IN (SELECT id FROM users)`)
		.get()!;
	check(
		'All meal plan sessions have valid dietitian',
		orphanedSessions2.cnt === 0,
		`${orphanedSessions2.cnt} orphaned sessions`
	);
} else {
	check('Meal plan sessions table exists', false, 'Table not found — run migrations');
}

// ─── Chat ────────────────────────────────────────────────────────────────────

console.log('\n=== Chat ===');

const chatConvsTable = db
	.prepare<
		[],
		{ cnt: number }
	>(`SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='table' AND name='chat_conversations'`)
	.get()!;

if (chatConvsTable.cnt > 0) {
	const orphanedConvs = db
		.prepare<
			[],
			{ cnt: number }
		>(`SELECT COUNT(*) as cnt FROM chat_conversations WHERE dietitian_id NOT IN (SELECT id FROM users) OR client_id NOT IN (SELECT id FROM users)`)
		.get()!;
	check(
		'No orphaned chat conversations',
		orphanedConvs.cnt === 0,
		`${orphanedConvs.cnt} orphaned conversations`
	);
} else {
	console.log('  — Chat tables not found (migration pending)');
}

// ─── OTP Records ─────────────────────────────────────────────────────────────

console.log('\n=== OTP Records ===');

const otpTable = db
	.prepare<
		[],
		{ cnt: number }
	>(`SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='table' AND name='registration_email_otp'`)
	.get()!;

if (otpTable.cnt > 0) {
	const otpWithoutExpiry = db
		.prepare<
			[],
			{ cnt: number }
		>(`SELECT COUNT(*) as cnt FROM registration_email_otp WHERE expires_at IS NULL`)
		.get()!;
	check(
		'All OTP records have expiry',
		otpWithoutExpiry.cnt === 0,
		`${otpWithoutExpiry.cnt} OTPs without expiry`
	);
} else {
	console.log('  — OTP table not found (migration pending)');
}

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log('\n=== Summary ===');
const passed = results.filter((r) => r.passed).length;
const failed = results.filter((r) => !r.passed).length;
console.log(`Checks: ${results.length} total — ${passed} passed, ${failed} failed`);

if (failed > 0) {
	console.error('\nData integrity validation FAILED');
	process.exit(1);
} else {
	console.log('\nData integrity validation PASSED');
	process.exit(0);
}
