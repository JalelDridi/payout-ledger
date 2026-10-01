# 2. Database access: Prisma, with raw SQL where it stops

Date: 2026-10-02 · Status: accepted

## Context

The ledger's correctness depends on things an ORM does not model well: row locks, CHECK constraints, triggers and deferred constraints. The rest of the app (reading events, listing payouts, rendering a dashboard) is ordinary CRUD where type-safe queries save time.

## Options

1. **Prisma, plus raw SQL for the parts it cannot express.** Typed client and managed migrations for everyday queries. Constraints and triggers are written by hand in the migration files; locks use `$queryRaw`.
   - Trade-off: two styles in one codebase, and the Prisma schema does not show the constraints, so they must be documented and tested.
2. **Drizzle.** Closer to SQL, supports `FOR UPDATE` and CHECK constraints in its own syntax, lighter at runtime.
   - Trade-off: triggers still need raw SQL, and its migration tooling is less mature.
3. **Kysely or plain SQL.** Full control, nothing hidden.
   - Trade-off: more code for routine queries and hand-rolled migrations.

## Decision

Option 1: Prisma 7 with the `pg` driver adapter. Invariants live in SQL inside the migration, not in application code.

## Consequences

- The database rejects invalid ledger states no matter which client writes to it. Tests prove this by writing through Prisma and expecting the database to refuse.
- Anything Prisma cannot express is visible in `prisma/migrations/*/migration.sql` and listed in `docs/schema.md`.
- Migrations run over the direct connection (`DATABASE_URL_UNPOOLED`); the app uses the pooled one.
