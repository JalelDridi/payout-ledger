# Schema

Tables are defined in [`prisma/schema.prisma`](../prisma/schema.prisma). The rules below are enforced by the database itself, in SQL that Prisma cannot express; they live in the migration files and are tested in [`src/db/invariants.db.test.ts`](../src/db/invariants.db.test.ts).

## Tables

| Table                 | Purpose                                                                               |
| --------------------- | ------------------------------------------------------------------------------------- |
| `stripe_events`       | Webhook inbox. Raw event, keyed by Stripe's event ID, with processing status.         |
| `accounts`            | Ledger accounts: `external` (the outside world), `platform`, and one per seller.      |
| `ledger_transactions` | One money movement (charge, transfer, payout, payout reversal), with idempotency key. |
| `payouts`             | Current state of each payout, built from events by a forward-only state machine.      |
| `ledger_entries`      | The signed amounts that make up a transaction. Integer minor units (cents).           |

## How money is recorded

Every transaction has two or more entries that sum to zero: money leaves one account and arrives in another. An account's balance is the sum of its entries.

```
charge of 10.00 with a 1.00 platform fee
  external        -1000
  seller:acct_1    +900
  platform         +100
```

The `external` account represents everything outside the system (card networks, bank accounts) and is the only one allowed to go negative.

## Invariants enforced by the database

| Rule                                               | Mechanism                                                                                 |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| A Stripe event is stored at most once              | Primary key on `stripe_events.id`                                                         |
| A ledger write is applied at most once             | Unique `ledger_transactions.idempotency_key`                                              |
| A transaction's entries sum to zero, and it has ≥2 | Deferred constraint triggers `ledger_transactions_balanced` and `ledger_entries_balanced` |
| An entry moves a non-zero amount                   | `CHECK ledger_entries_amount_non_zero`                                                    |
| `accounts.balance` equals the sum of its entries   | Trigger `ledger_entries_apply_balance` updates it on every insert                         |
| A balance never goes negative unless allowed       | `CHECK accounts_balance_non_negative`                                                     |
| Ledger rows are never changed or removed           | Triggers `ledger_entries_append_only` and `ledger_transactions_append_only`               |

The "sum to zero" check is deferred to commit time so that the entries of one transaction can be inserted one by one.

The balance trigger's `UPDATE` takes the account's row lock. Two concurrent writers to the same account therefore run one after the other, and the second sees the first's result before the CHECK is evaluated. See [ADR 3](decisions/0003-concurrency-row-locks-with-constraint-backstop.md).

## How an event becomes ledger entries

| Event                                  | Effect                                                                      |
| -------------------------------------- | --------------------------------------------------------------------------- |
| `charge.succeeded`                     | `external` → `platform`                                                     |
| `transfer.created`                     | `platform` → `seller:<account>`                                             |
| `payout.*`, first seen while in flight | `seller:<account>` → `external`                                             |
| `payout.failed` / `payout.canceled`    | If the payout had been debited, a reversal: `external` → `seller:<account>` |
| anything else                          | Stored and marked `ignored`                                                 |

Ledger writes are keyed by the Stripe object (`charge:<id>`, `transfer:<id>`, `payout:<id>:debit`, `payout:<id>:reversal`), so the same object described by several events is posted once.
