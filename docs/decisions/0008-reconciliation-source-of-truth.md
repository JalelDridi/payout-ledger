# 8. Reconciliation: compare against a record of what the source says

Date: 2026-10-02 · Status: accepted

## Context

Webhooks can be lost: an endpoint outage outlasts the provider's retries, or an event is never sent. A system built only on webhooks then drifts from reality without noticing. Reconciliation is the independent check: periodically ask the source what exists and compare.

The demo has to show this without live Stripe traffic, and a visitor must be able to cause a dropped webhook and watch it get caught.

## Options

1. **Call the Stripe API.** List charges, transfers and payouts and compare.
   - Trade-off: the real thing, but the demo then depends on a Stripe test account having recent activity, and simulated events have no objects behind them.
2. **Reconcile the ledger against itself.** Check internal consistency only.
   - Trade-off: cannot detect a missing webhook, which is the main failure this project is about.
3. **A source table the simulator maintains.** When the simulator "creates" an object it records it in `source_objects`, whether or not it then delivers the webhook. The reconciler reads that table as the source of truth.
   - Trade-off: it stands in for Stripe rather than being Stripe.

## Decision

Option 3. The comparison itself is a pure function over two lists (`findMismatches`), so the source can be swapped: a Stripe API adapter that produces the same records is the natural next step and needs no change to the comparison or to how mismatches are stored.

Mismatches are classified as:

| Type                | Meaning                                                   |
| ------------------- | --------------------------------------------------------- |
| `missing_locally`   | The source has the object; this system never recorded it. |
| `status_mismatch`   | A payout's status here differs from the source.           |
| `amount_mismatch`   | The amounts differ.                                       |
| `missing_at_source` | Recorded here, unknown to the source.                     |

## Consequences

- A dropped webhook becomes a visible, classified mismatch instead of silent drift.
- Objects the source changed in the last 60 seconds are skipped, so a webhook that is merely in flight is not reported.
- A mismatch that is still present on the next run is refreshed, not duplicated (a partial unique index allows one open mismatch per object and type). When the cause goes away, the mismatch is marked resolved and kept as history.
- Runs take a transaction-scoped advisory lock, so a scheduled run and a manual run cannot overlap. Unlike session-level locks, this works through a transaction-mode connection pooler.
- The reconciler reports; it does not repair. Automatically re-applying missing objects is left out so that every correction stays a deliberate, visible action.
