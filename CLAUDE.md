@AGENTS.md

# Payout Ledger

Stripe payout reconciliation monitor built on a double-entry ledger. Public portfolio project; the commit history, tests and docs are part of the deliverable.

## Commands

- `pnpm dev` — run locally (uses the Docker database via `.env.development`)
- `pnpm db:up` — start local Postgres (Docker, port 5433)
- `pnpm lint` · `pnpm format:check` · `pnpm typecheck` · `pnpm test` · `pnpm test:db` · `pnpm build` · `pnpm test:e2e` — the CI checks, in order
- New migration: `DATABASE_URL_UNPOOLED=postgresql://postgres:postgres@localhost:5433/payout_ledger_test pnpm exec prisma migrate dev --name <name>`. Without the override, Prisma targets the Neon database from `.env.local`.
- `pnpm format` — apply Prettier

Run all seven checks before every commit.

## Layout

- `src/app` — Next.js App Router (pages and route handlers)
- `src/events` — webhook verification, inbox, applying events to the ledger
- `src/ledger` — posting balanced transactions
- `src/payouts` — payout state machine
- `src/alerts`, `src/jobs` — alert detection; the periodic checks
- `src/simulator`, `src/demo` — demo scenarios; nightly reset
- `src/reconcile` — compare source and local state, track mismatches
- `src/db` — Prisma client and database tests (`*.db.test.ts`)
- `prisma/` — schema and migrations; invariants are raw SQL in the migration, described in `docs/schema.md`
- `docs/PLAN.md` — checklist; update it after each feature
- `docs/decisions/` — ADRs, one per architectural decision

## Rules

- **Jalel decides.** For any architectural choice, present 2–3 options with trade-offs and wait. Record the outcome as a short ADR.
- **No employer code or detail.** Nothing from Potluck, Offa or Pearls: no code, schemas, names or incident specifics. Design from Stripe's public docs.
- **No secrets in the repo.** `.env.example` documents variables; real values live in `.env.local` and Vercel.
- **Free tiers only.** No paid services or plans.
- **Stripe test mode only.**
- Small conventional commits (`feat:`, `fix:`, `test:`, `docs:`, `chore:`), one concern each.
- Tests accompany behaviour. Concurrency and idempotency tests run against real Postgres, never mocks.
- Cut features before cutting tests or docs.
- If something goes wrong mid-task, stop and re-plan instead of patching.

## Conventions

- TypeScript strict; no `any` without a comment explaining why.
- Tests live next to the code as `*.test.ts`.
- Money is integer minor units (cents), never floats.
