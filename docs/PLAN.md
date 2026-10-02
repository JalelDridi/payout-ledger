# Plan

## Foundation

- [x] Next.js app scaffolded (App Router, TypeScript, Tailwind)
- [x] CI: lint, format, typecheck, test, build
- [x] Health endpoint
- [x] ADR 1 — scope
- [x] Deployed to Vercel (https://payout-ledger-gamma.vercel.app)
- [x] Neon database created and reachable locally (pooled and direct)
- [x] `DATABASE_URL` set in Vercel
- [x] ADRs 2–6 decided and written
- [x] Schema: inbox and ledger tables, first migration
- [x] Database-enforced invariants, tested against real Postgres in CI
- [x] Migration applied to the Neon database on deploy

## Ingestion and ledger

- [x] Webhook endpoint: signature verification, dedupe on event ID
- [x] Event inbox: stored raw, processed exactly once
- [x] Ledger posting with sorted row locks and idempotency keys
- [x] Payout state machine that only moves forward
- [x] Retry sweep for events that arrive before what they depend on (ADR 7)
- [x] Tests: duplicate, out-of-order and concurrent delivery

## Correctness

- [x] Concurrency tests against real Postgres (Docker locally, service container in CI)
- [x] Property-based test: any delivery order reaches the same final state
- [x] Reconciler with mismatch classification (ADR 8)
- [x] Mismatches open, refresh and resolve across runs; concurrent runs are safe

## Demo surface

- [x] Dashboard: summary, alerts, mismatches, payouts, webhook inbox
- [x] Event simulator: normal, duplicate, out-of-order, dropped, failed, stuck
- [x] Alerts for failed payouts, stuck payouts and unprocessable events
- [x] Checks run on a schedule (GitHub Actions, every 15 minutes) and on demand
- [x] Global simulator budget and a cooldown on manual checks
- [x] Nightly reset that reseeds the demo (Vercel Cron)

## Hardening and docs

- [x] Structured logs; health check reports database reachability
- [x] Optional error tracking (Sentry), active once a DSN is set
- [x] Playwright smoke tests and accessibility scan, in CI
- [x] README case study: live link, screenshot, architecture diagram, decisions, failure modes, limitations

## If time allows

- [ ] Real Stripe test-mode account alongside the simulator
- [ ] Slack or Discord alert webhook
- [ ] Stripe API as a second reconciliation source
- [x] Measured concurrency result in the README
- [ ] Demo GIF
