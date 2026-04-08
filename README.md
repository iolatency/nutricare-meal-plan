# NutriCare Meal Plan

SvelteKit app for NutriCare with Drizzle ORM on SQLite.

## Stack

- SvelteKit (`@sveltejs/adapter-node`)
- Drizzle ORM + Drizzle Kit
- SQLite (`better-sqlite3`)
- Cookie-based auth sessions (`auth_sessions`)
- Arabic locale strings in `src/lib/locales/ar`

## Environment

Copy `.env.example` to `.env` and set:

- `DATABASE_URL=file:local.db`
- Optional email settings for OTP:
  - `RESEND_API_KEY`
  - `EMAIL_FROM`

If `RESEND_API_KEY` is not set in development, OTP codes are logged to console.

## Install

```bash
npm install
```

## Database

Apply schema to local SQLite DB:

```bash
DATABASE_URL=file:local.db npm run db:push
```

Force apply (drops/changes when needed):

```bash
DATABASE_URL=file:local.db npm run db:push:force
```

Seed dev login user:

```bash
DATABASE_URL=file:local.db npm run db:seed-dev-user
```

Import from legacy v0 database:

```bash
DATABASE_URL=file:local.db NUTRICARE_V0_DB=/path/to/nutricare_v0.2.sqlite npm run db:import-v0
```

## Run

Development:

```bash
npm run dev
```

Checks:

```bash
npm run check
npm run lint
```

Production build:

```bash
npm run build
npm run preview
```

## Useful scripts

- `npm run db:push`
- `npm run db:push:force`
- `npm run db:generate`
- `npm run db:migrate`
- `npm run db:studio`
- `npm run db:seed-dev-user`
- `npm run db:import-v0`

## Notes

- Database path is read from `DATABASE_URL` (`file:...` form supported).
- SQLite pragmas enabled at runtime:
  - `journal_mode = WAL`
  - `foreign_keys = ON`
