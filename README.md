# NutriCare Meal Plan

NutriCare is an Arabic-first (RTL) nutrition platform built with SvelteKit.

- Dietitian side: patients, meal plan sessions, foods, recipes, supplements, chat.
- Patient side: login flow, activation flow, dashboard/session pages.
- Backend: SQLite + Drizzle + server modules + optional external APIs.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Start (Local Activation)](#quick-start-local-activation)
3. [Environment Profiles](#environment-profiles)
4. [Seed Data, Login Accounts, and Demo Data](#seed-data-login-accounts-and-demo-data)
5. [OTP (Resend) and Console OTP Mode](#otp-resend-and-console-otp-mode)
6. [Edamam API Setup](#edamam-api-setup)
7. [Deployment Options](#deployment-options)
8. [S3 / S3-Compatible Storage Notes](#s3--s3-compatible-storage-notes)
9. [Scripts Reference](#scripts-reference)
10. [Testing Guide](#testing-guide)
11. [Project Structure](#project-structure)
12. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required

- Node.js `22+`
- npm `10+`
- Native build toolchain for `better-sqlite3`
  - macOS: Xcode Command Line Tools
  - Ubuntu/Debian: `build-essential`, `python3`, `make`, `g++`

### Install dependencies

```bash
git clone <repo-url>
cd Test-Nutri-Meal
npm install
```

---

## Quick Start (Local Activation)

This section gets the app running from zero in minutes.

### 1) Create `.env`

```bash
cp .env.example .env
```

### 2) Use simple local mode config

```env
DATABASE_URL=file:local.db
ALLOW_LOCAL_DEV_SQLITE=1
ALLOW_LOCAL_DEV_FILE_STORAGE=1
FILE_STORAGE_PROVIDER=local
SKIP_DB_SEED=0
RUN_DB_SEED_ON_START=0
```

### 3) Create/update schema

```bash
DATABASE_URL=file:local.db npm run db:push
```

### 4) Seed baseline data

```bash
DATABASE_URL=file:local.db npm run db:seed
```

### 5) Run app

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

---

## Environment Profiles

Use one of these profiles depending on your goal.

### Profile A - Pure local development (no external services)

```env
DATABASE_URL=file:local.db
ALLOW_LOCAL_DEV_SQLITE=1
ALLOW_LOCAL_DEV_FILE_STORAGE=1
FILE_STORAGE_PROVIDER=local
SKIP_DB_SEED=0
RUN_DB_SEED_ON_START=0
```

### Profile B - Local app + external APIs (Resend/Edamam)

```env
DATABASE_URL=file:local.db
ALLOW_LOCAL_DEV_SQLITE=1
ALLOW_LOCAL_DEV_FILE_STORAGE=1
FILE_STORAGE_PROVIDER=local
RESEND_API_KEY=re_...
EMAIL_FROM=NutriCare <onboarding@resend.dev>
EDAMAM_APP_ID=...
EDAMAM_APP_KEY=...
```

### Profile C - Hosted mode baseline (generic)

```env
DATABASE_URL=file:/tmp/nutricare.db
FILE_STORAGE_PROVIDER=supabase
SQLITE_STORAGE_SYNC=1
SQLITE_STORAGE_BUCKET=media
SQLITE_STORAGE_OBJECT_PATH=nutricare.sqlite
SUPABASE_STORAGE_BUCKET=media
```

---

## Seed Data, Login Accounts, and Demo Data

### Baseline seed

```bash
DATABASE_URL=file:local.db npm run db:seed
```

Creates:

- dietitian user + org + membership
- patient user + membership
- food/supplement baseline catalogs

### Seeded login accounts

After `db:seed`:

- Dietitian: `dietitian@example.com` / `password`
- Patient: `patient@example.com` / `password`

### Rich demo journey seed

```bash
DATABASE_URL=file:local.db npm run db:seed-demo-journey
```

This adds:

- realistic sessions across statuses
- recipes, tracking logs, chats
- a fuller "platform look" for demos

### Verify seed integrity

```bash
DATABASE_URL=file:local.db npm run db:verify-seed
```

---

## OTP (Resend) and Console OTP Mode

Registration requires OTP verification.

### If Resend is configured

Set:

```env
RESEND_API_KEY=re_...
EMAIL_FROM=NutriCare <onboarding@resend.dev>
```

OTP is sent by email.

### If Resend is not configured (development)

OTP is printed in server console logs.

This is useful for local dev and QA without mail setup.

---

## Edamam API Setup

Edamam powers food search/import features.

```env
EDAMAM_APP_ID=your_id
EDAMAM_APP_KEY=your_key
```

If missing, Edamam-dependent flows will be unavailable or return empty/error responses.

---

## Deployment Options

This app deploys as a Node service:

```bash
npm ci
npm run build
npm start
```

### Option 1 - Single instance + persistent disk

- Keep SQLite on mounted volume path.
- Best for simple low-traffic deployment.

### Option 2 - Ephemeral runtime + object storage snapshots/sync

- Use writable runtime path like `/tmp/nutricare.db`.
- Sync media and/or DB artifact strategy with object storage.
- Ensure startup checks and backup lifecycle.

### Option 3 - Scale-out migration

For multi-instance writes / high concurrency:

- plan migration to managed SQL (Postgres/MySQL)
- keep object storage for media assets

---

## S3 / S3-Compatible Storage Notes

You can use AWS S3, Cloudflare R2, MinIO, Backblaze B2, or any S3-compatible target for operational artifacts and media strategy.

### Practical checklist

- Use server-side credentials only (never expose secrets client-side).
- Enable bucket versioning where possible.
- Keep retention + restore policy documented.
- Validate bucket permissions in pre-prod.
- Keep startup readiness checks before serving traffic.

### Media best practices

- Upload through server routes only.
- Add size/type validation server-side.
- Keep deterministic object prefixes per environment.

---

## Scripts Reference

Use `DATABASE_URL=file:local.db` for local examples below.

### Core DB lifecycle

```bash
npm run db:push
npm run db:push:force
npm run db:generate
npm run db:migrate
npm run db:studio
```

### Seed and demo

```bash
npm run db:seed
npm run db:seed-dev-user
npm run db:seed-meal
npm run db:seed-demo-journey
npm run db:verify-seed
```

### Maintenance

```bash
npm run db:clear
npm run db:reset
npm run db:hard-reset
npm run db:drop
npm run db:dedupe-sessions
npm run db:import-v0
npm run db:patch-v2
```

### Storage/sync utility scripts

```bash
npm run db:test-storage-sync
npm run db:clear-supabase
npm run db:flush-supabase
```

---

## Testing Guide

### Main commands

```bash
npm run check
npm run lint
npm run test
npm run test:coverage
npm run test:e2e
npm run test:e2e:ui
```

### Test folders and intent

- `tests/e2e/` - end-to-end user flows (Playwright)
- `tests/security/` - API/security behavior checks
- `tests/data-integrity/` - DB constraints + integrity checks
- `tests/load/` - k6 load scripts

### Typical local test flow

1. `db:push`
2. `db:seed`
3. `npm run test`
4. `npm run test:e2e`

---

## Project Structure

```text
src/
  routes/                # pages + server endpoints
  lib/
    server/
      db/                # schema, DB bootstrap, migrations, sync helpers
      modules/           # domain services
      storage/           # file/object storage behavior
scripts/                 # seeds + maintenance scripts
drizzle/                 # SQL migration artifacts
tests/                   # e2e/security/data/load
```

---

## Troubleshooting

### `DATABASE_URL is not set`

Set in `.env` or inline:

```bash
DATABASE_URL=file:local.db npm run db:push
```

### Login fails after fresh setup

- Run `db:seed`
- Use seeded credentials exactly as listed
- verify database path is the same across commands

### OTP email not received

- If no `RESEND_API_KEY`, use console OTP mode
- if key exists, verify sender/domain settings in Resend dashboard

### Edamam search not working

- check `EDAMAM_APP_ID` and `EDAMAM_APP_KEY`
- verify keys are valid and not rate-limited

### SQLite locking issues

- avoid sharing one SQLite file across multiple writers/processes
- for scale, move to managed SQL

### Build works, runtime fails

- confirm runtime env vars exist in deploy platform
- confirm writable DB directory
- confirm storage credentials are server-only and valid

---

## Meal Plan API Timing (Debug Summary)

Runtime measurement for `POST /api/ai/meal-plan` (weekly, 7 days, 6 meals/day) shows backend overhead is negligible compared to AI generation time.

| Metric (latest run) | Time (ms) |
|---|---:|
| Hook total | 75,423 |
| Route total | 75,419 |
| Service total | 75,418 |
| DB queries total | 0 |
| Generation phase | 75,417 |
| Cross-day dedupe | 0 |
| Flush (AI route path) | 1 |

| Split | Share |
|---|---:|
| AI generation/parsing | ~99.99% |
| Backend/DB/route overhead | ~0.01% (combined) |

Kept changes from performance debugging:

- Non-blocking storage flush for AI meal-plan route in `hooks.server.ts`
- Stronger weekly cuisine hints to reduce duplicate names
- Main day generation temperature set to `0.6`, targeted replacement calls keep `0.3`

Detailed tables and run notes: `../Doc/meal-plan-api-performance-summary.md`.

