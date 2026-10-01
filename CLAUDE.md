@AGENTS.md

# Payout Ledger

Stripe payout reconciliation monitor built on a double-entry ledger. Public portfolio project; the commit history, tests and docs are part of the deliverable.

## Commands

- `pnpm dev` — run locally
- `pnpm lint` · `pnpm format:check` · `pnpm typecheck` · `pnpm test` · `pnpm build` — the CI checks, in order
- `pnpm format` — apply Prettier

Run all five checks before every commit.

## Layout

- `src/app` — Next.js App Router (pages and route handlers)
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
