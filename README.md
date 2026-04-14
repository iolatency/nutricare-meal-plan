# NutriCare Meal Plan

A full-stack nutrition management platform for dietitians and their patients. Built with SvelteKit, Drizzle ORM, and SQLite. The UI is in Arabic (RTL).

---

## Table of contents

1. [What it does](#what-it-does)
2. [Stack](#stack)
3. [Requirements](#requirements)
4. [Getting the system running (step-by-step)](#getting-the-system-running)
5. [Logging in for the first time](#logging-in-for-the-first-time)
6. [How the dietitian uses the system](#how-the-dietitian-uses-the-system)
7. [How a patient uses the system](#how-a-patient-uses-the-system)
8. [Environment variables](#environment-variables)
9. [Database scripts reference](#database-scripts-reference)
10. [Development commands](#development-commands)
11. [Project layout](#project-layout)

---

## What it does

**Dietitian portal** — everything a dietitian needs to manage their patients:
- View and activate patient accounts
- Create meal plan sessions per patient
- Browse and manage a food items catalog
- Create AI-generated or manual recipes
- Prescribe supplement regimens

**Auth flow:**
- Registration with OTP email verification
- Cookie-based sessions (no JWT)
- Role-based routing: dietitians and patients see completely separate portals

---

## Stack

| Layer | Technology |
|-------|-----------|
| Framework | SvelteKit (`@sveltejs/adapter-node`) |
| ORM | Drizzle ORM + Drizzle Kit |
| Database | SQLite (`better-sqlite3`) |
| Styling | Tailwind CSS v4 |
| Email | Resend (OTP codes) |
| AI | DeepSeek API (recipe generation) |
| Food search | Edamam API (optional) |
| Storage sync | Supabase Storage (optional) |

---

## Requirements

Install prerequisites before [getting the system running](#getting-the-system-running). Full detail is in **[REQUIREMENTS.md](REQUIREMENTS.md)** — Node.js **22+**, npm, and a native build toolchain for `better-sqlite3` (plus optional **k6** for load tests and **Playwright** browsers for E2E tests).

**Project packages:** this app uses **Node**, not Python. Dependencies are in **`package.json`** / **`package-lock.json`** — run **`npm install`**. A **`requirements.txt`** file exists only as a short note for contributors (this repo has no pip packages); use npm for installs.

---

## Getting the system running

Follow these steps in order. Every step is required unless marked optional.

### Step 1 — clone and install dependencies

```bash
git clone <repo-url>
cd nutricare-meal-plan
npm install
```

This installs all packages and runs a small post-install shim for UUID compatibility.

---

### Step 2 — create your environment file

```bash
cp .env.example .env
```

Open `.env` and set at minimum:

```env
DATABASE_URL=file:local.db
```

That single line is all you need to run locally. Everything else is optional (email, AI, Supabase). See the [Environment variables](#environment-variables) section for the full list.

> **Note:** `.env` is git-ignored so your secrets will never be committed.

---

### Step 3 — create the database and apply the schema

This creates `local.db` in the project root and applies all Drizzle table definitions:

```bash
DATABASE_URL=file:local.db npm run db:push
```

You only need to run this once. If you change the schema later, run it again to sync.

If you hit a conflict (e.g. you already have a DB from a previous version), use the force flag:

```bash
DATABASE_URL=file:local.db npm run db:push:force
```

---

### Step 4 — seed the database with starter data

This creates the dev dietitian account, a patient account, and fills the food/meal catalog:

```bash
DATABASE_URL=file:local.db npm run db:seed
```

What gets created:

| Account | Email | Password | Role |
|---------|-------|----------|------|
| Dev Dietitian | `dev@example.com` | `password` | dietitian |
| Patient | `patient@example.com` | `password` | patient |

The meal catalog (food items, categories) is also loaded from `scripts/seed-meal-domain.ts`.

---

### Step 5 — start the development server

```bash
npm run dev
```

Open your browser at `http://localhost:5173`.

The app is now fully functional. You can log in as the dietitian or as the patient.

---

### Optional: seed a full demo journey

If you want to see the system populated with a complete realistic workflow (dietitian + patient + meal plan already created), run:

```bash
DATABASE_URL=file:local.db npm run db:seed-demo-journey
```

This runs on top of the existing seed — it does not replace it.

---

### Resetting the database

If you want to start fresh at any point:

```bash
# Wipe all rows and re-seed (keeps the schema)
DATABASE_URL=file:local.db npm run db:reset

# Nuclear option: drop the file, recreate schema, seed
DATABASE_URL=file:local.db npm run db:hard-reset
```

---

## Logging in for the first time

1. Go to `http://localhost:5173/login`
2. Use one of the seeded accounts:
   - Dietitian: `dev@example.com` / `password`
   - Patient: `patient@example.com` / `password`
3. You are redirected to the home page (`/`), which sends you to the correct portal based on your role

> **Patients see an "awaiting activation" screen** until a dietitian activates them. The seeded patient account is already activated, so you can log in directly.

---

## How the dietitian uses the system

After logging in as a dietitian you land on the dietitian portal. Here is the step-by-step workflow:

### 1. Activate a patient

When a new patient self-registers, they appear in the system but cannot access the patient portal until a dietitian activates them.

- Go to `/dietitian/meal-plan`
- Find the patient in the list
- Click the activate button and confirm with their email address
- The patient can now log in and see their portal

### 2. Start a meal plan session for a patient

A meal plan session ties a dietitian to a specific patient for a period of work.

- Go to `/dietitian/meal-plan`
- Select a patient and create a new session
- The session opens at `/dietitian/meal-plan/[sessionId]`
- From inside the session you can assign meals, track progress, and view the plan

### 3. Manage foods

The food catalog is the source of ingredients for meal plans and recipes.

- Go to `/dietitian/foods`
- Browse existing food items
- Add custom foods or search the Edamam database (if `EDAMAM_APP_ID` and `EDAMAM_APP_KEY` are set in `.env`)

### 4. Create recipes

Recipes are reusable meal components you can attach to meal plans.

- Go to `/dietitian/recipes`
- **Manual:** fill in ingredients and nutritional info yourself
- **AI-generated:** click the AI button, describe the meal in Arabic, and DeepSeek generates the recipe for you (requires `DEEPSEEK_API_KEY` in `.env`)
- Saved recipes appear in the list and can be added to any patient's meal plan

### 5. Prescribe supplements

- Go to `/dietitian/supplements`
- Add supplement items and dosage notes for the patient

---

## How a patient uses the system

After logging in as a patient:

1. **If not yet activated:** you see the "awaiting activation" page. Wait for your dietitian to activate your account.
2. **After activation:** you are signed in; dedicated patient views for meal plans and messaging the dietitian are not implemented yet.

---

## Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | **Yes** | — | SQLite file path. Use `file:local.db` for local dev |
| `RESEND_API_KEY` | No | — | Resend API key for OTP emails. **Required in production.** Without it, OTP codes are printed to the server console in dev |
| `EMAIL_FROM` | No | — | Sender address, e.g. `NutriCare <no-reply@example.com>` |
| `DEEPSEEK_API_KEY` | No | — | Enables the AI recipe generation button. Without it, the button is hidden |
| `EDAMAM_APP_ID` | No | — | Edamam food search app ID (get free keys at developer.edamam.com) |
| `EDAMAM_APP_KEY` | No | — | Edamam food search app key |
| `SQLITE_STORAGE_SYNC` | No | `0` | Set to `1` to sync the SQLite file to Supabase Storage on every request |
| `SUPABASE_URL` | No | — | Required when `SQLITE_STORAGE_SYNC=1` |
| `SUPABASE_SERVICE_ROLE_KEY` | No | — | Required when `SQLITE_STORAGE_SYNC=1`. Server-only — never expose to the client |
| `SQLITE_STORAGE_BUCKET` | No | — | Supabase Storage bucket name, e.g. `media` |
| `SQLITE_STORAGE_OBJECT_PATH` | No | — | Path inside the bucket, e.g. `nutricare.sqlite` |
| `SKIP_DB_SEED` | No | — | Set to `1` to prevent auto-seed on server start |
| `RUN_DB_SEED_ON_START` | No | — | Set to `1` to force re-seed even when users already exist |
| `SEED_PATIENT_NAME` | No | `Patient` | Name for the patient created by `db:seed` |
| `SEED_PATIENT_EMAIL` | No | `patient@example.com` | Email for the seeded patient |
| `SEED_PATIENT_USERNAME` | No | `patient` | Username for the seeded patient |
| `SEED_PATIENT_PASSWORD` | No | `password` | Password for the seeded patient |

---

## Database scripts reference

Run all scripts with `DATABASE_URL=file:local.db npm run <script>`.

| Script | What it does |
|--------|-------------|
| `db:push` | Apply the current Drizzle schema to the database. Run this after any schema change |
| `db:push:force` | Same as above but forces changes that would normally require manual review (e.g. dropping columns) |
| `db:generate` | Generate SQL migration files from schema changes (writes to `drizzle/`) |
| `db:migrate` | Run pending SQL migration files from `drizzle/` |
| `db:studio` | Open Drizzle Studio — a browser-based GUI to inspect and edit the database live |
| `db:seed` | Full seed: creates dietitian + patient + meal catalog |
| `db:seed-dev-user` | Seed only the dev dietitian account (`dev@example.com` / `password`) |
| `db:seed-demo-journey` | Seed a complete realistic workflow on top of the base seed |
| `db:reset` | Delete all rows, then re-run `db:seed` |
| `db:hard-reset` | Drop the database file, re-push the schema, then seed |
| `db:clear` | Delete all rows but keep the schema and file |
| `db:drop` | Delete the database file entirely |
| `db:import-v0` | Import data from a legacy NutriCare v0 SQLite file. Set `NUTRICARE_V0_DB=/path/to/file.sqlite` |
| `db:patch-v2` | One-time patch to migrate supplement data to the v2 format |
| `db:dedupe-sessions` | Remove duplicate meal plan sessions (maintenance script) |
| `db:verify-seed` | Run checks to confirm seed data is present and correctly formed |

---

## Development commands

```bash
npm run dev            # start dev server with hot reload
npm run check          # TypeScript + Svelte type checking
npm run lint           # check formatting (Prettier) and linting (ESLint)
npm run format         # auto-fix all formatting issues
npm test               # run unit tests (Vitest)
npm run test:watch     # run unit tests in watch mode
npm run test:coverage  # run unit tests with coverage report
npm run test:e2e       # run end-to-end tests (Playwright)
npm run test:e2e:ui    # run Playwright tests with the interactive UI
npm run build          # production build (outputs to build/)
npm run preview        # preview the production build locally
npm start              # run the built app (requires npm run build first)
```

---

## Project layout

```
src/
  routes/
    login/                     # Login page
    register/                  # Registration + OTP verification (multi-step)
    logout/                    # Clears the session cookie
    dietitian/                 # Dietitian portal — requires dietitian role
      meal-plan/               # Patient list + session management
        [sessionId]/           # Individual meal plan session view
          tracking/            # Meal tracking within a session
      foods/                   # Food catalog browser
      recipes/                 # Recipe library + AI generation
      supplements/             # Supplement prescription management
      messages/                # Chat with patients
    patient/                   # Patient portal — requires patient role
      awaiting-activation/     # Shown to patients not yet activated
      dashboard/[sessionId]    # Patient's meal plan view
      messages/                # Chat with the dietitian
    api/                       # Server-only API endpoints
      ai/                      # AI endpoints (meal-plan, recipe generation)
      chat/                    # Messaging endpoints
      foods/                   # Food CRUD
      supplements/             # Supplement CRUD
      users/                   # User management
  lib/
    server/
      db/                      # Drizzle schema, migration runner, DB init
      modules/                 # Business logic per domain
        auth/                  # Session handling, OTP, registration
        chat/                  # Messaging service
        meal-plan/             # Meal plan session logic
        recipes/               # Recipe CRUD
        foods/                 # Food catalog logic
        supplements/           # Supplement logic
        users/                 # User registration, activation
      ai/                      # DeepSeek API integration
      email/                   # Resend email sending
      config/                  # Server config helpers
    features/                  # Svelte UI component libraries per feature
    components/                # Shared UI components
    locales/ar/                # Arabic locale strings (all UI text)
    validation/                # Shared input validation
scripts/                       # One-off Node scripts (seed, import, patch)
drizzle/                       # SQL migration files generated by Drizzle Kit
tests/
  e2e/                         # Playwright end-to-end tests
  security/                    # Security-focused API and injection tests
  data-integrity/              # SQLite FK and constraint validation scripts
load-tests/                    # Load testing scenarios
```

---

## Notes

- SQLite pragmas applied at runtime: `journal_mode = WAL`, `foreign_keys = ON`, `busy_timeout = 8000`
- The entire UI is in Arabic; RTL layout is applied via `dir="rtl"` on root elements
- Unit tests run sequentially (not in parallel) to avoid SQLite lock contention on `local.db`
- All locale strings live in `src/lib/locales/ar/` — edit them there to change any UI text
