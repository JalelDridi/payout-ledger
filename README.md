# Payout Ledger

A Stripe payout reconciliation monitor built on a double-entry ledger.

**Live:** https://payout-ledger-gamma.vercel.app

> **Status: work in progress.** Webhook ingestion, the ledger and the payout state machine are built and tested. Reconciliation, the dashboard and the event simulator are not built yet. See [docs/PLAN.md](docs/PLAN.md).

## What it will do

- Ingest Stripe webhooks idempotently: signature verification, dedupe by event ID, out-of-order handling.
- Record charges, transfers and payouts in a double-entry ledger whose balances cannot go negative, even under concurrent writes.
- Reconcile the ledger against Stripe and classify every mismatch.
- Alert on failed or stuck payouts.
- Offer a built-in event simulator so the demo runs without live Stripe traffic.

## Run locally

Needs Node 22+, pnpm and Docker.

```bash
pnpm install
pnpm db:up        # local Postgres on port 5433
pnpm test:db      # applies migrations, then runs the database tests
pnpm dev
```

## Checks

```bash
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm test:db && pnpm build
```

`pnpm test` runs unit tests. `pnpm test:db` runs tests that need a real Postgres, including concurrent writes; they refuse to run against a non-local database.

## Design

- [Schema and database-enforced invariants](docs/schema.md)
- [Architectural decisions](docs/decisions)

## Licence

MIT
