# 5. Out-of-order events: a state machine that only moves forward

Date: 2026-10-02 · Status: accepted

## Context

Stripe does not guarantee delivery order. `payout.paid` can arrive before `payout.created`, and a delayed `payout.updated` can arrive after `payout.failed`. Applying events in arrival order would let a stale event overwrite a newer state.

## Options

1. **Order by the event's `created` timestamp.** Ignore any event older than the last one applied to that object.
   - Trade-off: timestamps have one-second resolution, so two events in the same second cannot be ordered.
2. **Refetch the object from Stripe.** Treat the event as a signal and read the current state from the API.
   - Trade-off: always correct for real Stripe objects, but costs an API call per event and cannot work for simulated events, which have no object behind them.
3. **One-way state machine.** Give each status a rank (`pending` < `in_transit` < `paid` / `failed` / `canceled`). An event may only move an object to a higher rank; anything else is recorded and skipped.
   - Trade-off: the allowed transitions have to be defined and kept correct by hand.

## Decision

Option 3 for every event, from Stripe or the simulator. An event for an object that does not exist yet creates it in the state the event describes, so a late `created` is a no-op rather than an error.

Refetching (option 2) is kept for the reconciler, which compares stored state against Stripe when a real account is connected.

## Consequences

- Applying the same set of events in any order ends in the same state. This is asserted with property-based tests that shuffle event sequences.
- Skipped events are still stored in the inbox, so nothing is lost.
- One exception to "forward only" exists in Stripe itself: a `paid` payout can later become `failed` when the bank returns it. That transition is allowed explicitly and reverses the ledger entries.
