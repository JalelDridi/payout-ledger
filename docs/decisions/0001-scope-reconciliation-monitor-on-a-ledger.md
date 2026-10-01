# 1. Scope: a reconciliation monitor built on a double-entry ledger

Date: 2026-10-01 · Status: accepted

## Context

The project has to demonstrate correctness under concurrency, idempotency and failure handling in a payments setting, with a live demo a visitor can use in under a minute. Two candidate scopes were considered.

## Options

1. **Payout and reconciliation monitor.** Ingest Stripe webhooks, track charges, transfers and payouts, reconcile against Stripe, alert on failed or stuck payouts. Closest to real marketplace payments work, but the demo is empty unless Stripe is sending events.
2. **Never-negative credit ledger.** A standalone double-entry ledger with idempotent writes and race-condition tests. Self-contained and easy to demo, but says nothing about Stripe, webhooks or reconciliation.
3. **Monitor built on the ledger.** Option 1, with option 2's double-entry ledger as its internal record and a built-in event simulator as a second event source.

## Decision

Option 3.

## Consequences

- One project covers webhooks, idempotency, concurrency and reconciliation.
- The simulator sends signed events through the same verification path as real Stripe events, so the demo works with no Stripe traffic and the failure cases (duplicate, out-of-order, dropped) can be triggered on demand.
- Scope is larger than either option alone. To contain it, these are out: Connect onboarding flows, multi-currency, user accounts, a separate backend service, email alerts.
