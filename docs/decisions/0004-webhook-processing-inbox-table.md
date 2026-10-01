# 4. Webhook processing: store first in an inbox table, process after

Date: 2026-10-02 · Status: accepted

## Context

Stripe delivers webhooks at least once. The same event can arrive twice, events can arrive out of order, and Stripe retries when the endpoint is slow or returns an error. The endpoint has to acknowledge quickly and must never apply an event twice.

## Options

1. **Process inline.** Verify the signature and run all business logic before responding.
   - Trade-off: a slow or failing handler causes Stripe to retry, and a crash midway can leave an event half-applied with no record that it arrived.
2. **Inbox table.** Verify the signature, insert the raw event keyed by Stripe's event ID, respond 200. A processor then applies each stored event in its own transaction and marks it processed.
   - Trade-off: processing is a second step that needs its own trigger and retry handling.
3. **External queue** (SQS, a hosted queue service).
   - Trade-off: another service to run and pay for; still needs deduplication on the consumer side.

## Decision

Option 2. The event ID is the primary key of `stripe_events`, so a duplicate delivery is an insert conflict and is acknowledged without being stored or applied again.

## Consequences

- Deduplication is enforced by the database, not by a lookup that could race.
- Every event received is kept raw, which makes replay and debugging possible.
- Applying an event and marking it processed happen in one transaction, so an event is applied exactly once even if the processor crashes and retries.
- Processing runs right after the insert for low latency, and the scheduled job sweeps anything left unprocessed.
- Failed events record an attempt count and the last error instead of disappearing.
