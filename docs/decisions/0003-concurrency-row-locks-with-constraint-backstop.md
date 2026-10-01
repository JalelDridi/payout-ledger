# 3. Concurrency control: row locks, with database constraints as the backstop

Date: 2026-10-02 · Status: accepted

## Context

Two requests can try to move money out of the same account at the same moment. If both read a balance of 100 and both spend 80, the account ends at -60. The balance must never go negative, however requests interleave.

The app runs on serverless functions and reaches Postgres through Neon's pooler in transaction mode. That rules out session-level advisory locks, because consecutive statements outside a transaction may land on different connections.

## Options

1. **Row locks.** Inside one transaction, `SELECT … FOR UPDATE` the accounts involved, check funds, write the entries. A second writer waits for the first to commit, then sees the new balance.
   - Trade-off: writers on the same account queue up; locks taken in inconsistent order can deadlock.
2. **SERIALIZABLE isolation with retry.** Let Postgres detect conflicting transactions and abort one; the app retries.
   - Trade-off: every write path needs a retry loop, aborts rise under contention, and failures are harder to reason about.
3. **Constraints only.** No explicit locking; rely on a `CHECK (balance >= 0)` to reject the losing write.
   - Trade-off: correct, but the loser gets a constraint error instead of a clean "insufficient funds", and the check happens late.

## Decision

Option 1, with option 3 kept as a safety net.

- The application locks the affected account rows **in sorted ID order** before writing, which prevents deadlocks.
- Each account has a cached `balance` column maintained by a trigger on `ledger_entries`, so it cannot drift from the entries.
- `CHECK (allow_negative OR balance >= 0)` rejects an overdraft even if application code forgets to lock.

## Consequences

- Correctness does not depend on the application being right: the constraint holds for any client.
- Works through a transaction-mode pooler, because locks live inside a single transaction.
- Throughput per account is serial. That is acceptable here: contention is per seller, not global.
- Tested by firing concurrent spends at one account against real Postgres and asserting the balance never goes below zero.
