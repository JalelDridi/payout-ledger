# Payout Ledger

A Stripe payout reconciliation monitor built on a double-entry ledger.

**Live:** https://payout-ledger-gamma.vercel.app

> **Status: work in progress.** The foundation (app, CI, health endpoint) is in place. Webhook ingestion, the ledger, reconciliation and the dashboard are not built yet. See [docs/PLAN.md](docs/PLAN.md).

## What it will do

- Ingest Stripe webhooks idempotently: signature verification, dedupe by event ID, out-of-order handling.
- Record charges, transfers and payouts in a double-entry ledger whose balances cannot go negative, even under concurrent writes.
- Reconcile the ledger against Stripe and classify every mismatch.
- Alert on failed or stuck payouts.
- Offer a built-in event simulator so the demo runs without live Stripe traffic.

## Run locally

```bash
pnpm install
pnpm dev
```

## Checks

```bash
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm build
```

## Decisions

Architectural decisions are recorded in [docs/decisions](docs/decisions).

## Licence

MIT
