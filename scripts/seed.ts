/**
 * Master seed runner — executes all seeds in dependency order.
 * (Demo meal-plan journey is optional: `npm run db:seed-demo-journey` — not part of this pipeline.)
 * Run with: DATABASE_URL=file:local.db npm run db:seed
 */
import { execSync } from 'node:child_process';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
	console.error('DATABASE_URL is not set. Example: DATABASE_URL=file:local.db npm run db:seed');
	process.exit(1);
}

const env = { ...process.env, DATABASE_URL };

function run(script: string) {
	console.log(`\n▶ Running ${script}...`);
	execSync(`npx tsx scripts/${script}`, { stdio: 'inherit', env });
}

run('seed-dev-user.ts');
run('seed-patients.ts');
run('seed-meal-domain.ts');

console.log('\n✅ All seeds complete.');
