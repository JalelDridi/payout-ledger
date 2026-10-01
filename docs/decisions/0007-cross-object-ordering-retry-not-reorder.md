# 7. Events that arrive before what they depend on: fail and retry

Date: 2026-10-02 · Status: accepted

## Context

ADR 5 handles events for one object arriving out of order. A second kind of disorder crosses objects: a payout event can arrive before the transfer that funded the seller's balance, or a transfer before the charge that funded the platform's. Applying such an event immediately would drive a balance negative, which the ledger forbids (ADR 3).

## Options

1. **Buffer and reorder.** Hold events and release them in dependency order.
   - Trade-off: needs to know the dependency graph up front, and how long to wait for an event that may never come.
2. **Allow temporary negative balances.** Apply everything on arrival and expect it to net out.
   - Trade-off: gives up the never-negative invariant, so a real overdraft can no longer be told apart from a timing artefact.
3. **Fail and retry.** Applying the event fails with "insufficient funds" and rolls back completely. The event stays in the inbox, unprocessed, with an attempt count and the error. A later sweep retries it, oldest first.
   - Trade-off: the event is applied late, by up to one sweep interval.

## Decision

Option 3. Each event is applied in a single transaction, so a failed attempt leaves no partial state. After 8 failed attempts the sweep stops retrying and the event is left for a person to inspect.

## Consequences

- The ledger never shows a state that did not happen: balances are non-negative at every commit.
- The final state is independent of delivery order. A property-based test delivers a scenario's events in random orders, each event twice, and checks that balances and payout statuses always end the same.
- An event that can never succeed (for example, a payout that truly exceeds the balance) surfaces as a stuck inbox entry with its error, which is exactly the signal the monitor exists to raise.
- A webhook whose event cannot be applied yet still gets a 200: it was received and stored, and retrying is this system's job, not Stripe's.
