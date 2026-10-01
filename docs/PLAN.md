# Plan

## Foundation

- [x] Next.js app scaffolded (App Router, TypeScript, Tailwind)
- [x] CI: lint, format, typecheck, test, build
- [x] Health endpoint
- [x] ADR 1 — scope
- [ ] Deployed to Vercel
- [ ] Neon database connected (pooled connection)
- [ ] ADRs 2–6 decided and written
- [ ] Schema drafted

## Ingestion and ledger

- [ ] Webhook endpoint: signature verification, dedupe on event ID
- [ ] Event inbox: stored raw, processed once
- [ ] Double-entry ledger with database-enforced invariants
- [ ] Tests: duplicate and out-of-order events

## Correctness

- [ ] Concurrency tests against real Postgres (Docker locally, service container in CI)
- [ ] Property-based tests for ledger invariants
- [ ] Idempotency keys on write endpoints; replay tests
- [ ] Reconciler with mismatch classification

## Demo surface

- [ ] Dashboard: payout health, failed and stuck payouts
- [ ] Event simulator (duplicate, out-of-order, dropped)
- [ ] Alert feed
- [ ] Scheduled reconciliation and "run now"
- [ ] Rate limiting and nightly reset to seed data

## Hardening and docs

- [ ] Error tracking, structured logs
- [ ] Playwright smoke test
- [ ] README case study: live link, screenshot, architecture diagram, decisions, failure modes, limitations

## If time allows

- [ ] Real Stripe test-mode account alongside the simulator
- [ ] Slack or Discord alert webhook
- [ ] Measured concurrency result in the README
- [ ] Demo GIF
