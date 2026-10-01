import type { PrismaClient } from "@/generated/prisma/client";

/**
 * Empties every table. TRUNCATE does not fire the row-level append-only
 * triggers, which is what lets a demo or test database be wiped at all.
 */
export async function truncateAll(db: PrismaClient): Promise<void> {
  await db.$executeRawUnsafe(
    `TRUNCATE "ledger_entries", "ledger_transactions", "accounts", "payouts",
              "stripe_events", "source_objects", "mismatches",
              "reconciliation_runs", "alerts"
     RESTART IDENTITY CASCADE`,
  );
}
