import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type { ObjectKind } from "@/generated/prisma/enums";
import {
  findMismatches,
  type FoundMismatch,
  type LocalRecord,
  type SourceRecord,
} from "./diff";

type Tx = Prisma.TransactionClient;

export const DEFAULT_GRACE_MS = 60_000;

// Arbitrary constant identifying the "reconciliation" lock.
const RECONCILE_LOCK = 7_246_001;

export type RunSummary = {
  objectsChecked: number;
  opened: number;
  stillOpen: number;
  resolved: number;
};

export type RunOptions = { now?: Date; graceMs?: number };

/**
 * Compares the source with local state, then opens, refreshes and resolves
 * mismatches. Returns null if another run is in progress.
 *
 * Safe to call concurrently and repeatedly: a transaction-scoped advisory
 * lock lets one run through at a time, and a mismatch that is still present
 * is refreshed rather than duplicated.
 */
export async function runReconciliation(
  db: PrismaClient,
  options: RunOptions = {},
): Promise<RunSummary | null> {
  const now = options.now ?? new Date();
  const graceMs = options.graceMs ?? DEFAULT_GRACE_MS;

  return db.$transaction(
    async (tx) => {
      const [{ locked }] = await tx.$queryRaw<{ locked: boolean }[]>`
        SELECT pg_try_advisory_xact_lock(${RECONCILE_LOCK}) AS locked`;
      if (!locked) return null;

      // One connection, so these run one after the other.
      const source = await loadSource(tx);
      const local = await loadLocal(tx);
      const pendingEvents = await loadPendingEvents(tx);
      const found = findMismatches(source, local, {
        now,
        graceMs,
        pendingEvents,
      });

      const key = (m: { objectId: string; type: string }) =>
        `${m.objectId}|${m.type}`;
      const open = await tx.mismatch.findMany({ where: { resolvedAt: null } });
      const openKeys = new Set(open.map(key));
      const foundByKey = new Map(found.map((m) => [key(m), m]));

      const toOpen = found.filter((m) => !openKeys.has(key(m)));
      const toRefresh = open.filter((m) => foundByKey.has(key(m)));
      const toResolve = open.filter((m) => !foundByKey.has(key(m)));

      await tx.mismatch.createMany({
        data: toOpen.map((m: FoundMismatch) => ({
          ...m,
          detectedAt: now,
          lastSeenAt: now,
        })),
      });
      for (const m of toRefresh) {
        await tx.mismatch.update({
          where: { id: m.id },
          data: { lastSeenAt: now, details: foundByKey.get(key(m))!.details },
        });
      }
      await tx.mismatch.updateMany({
        where: { id: { in: toResolve.map((m) => m.id) } },
        data: { resolvedAt: now },
      });

      const summary: RunSummary = {
        objectsChecked: source.length,
        opened: toOpen.length,
        stillOpen: toRefresh.length,
        resolved: toResolve.length,
      };
      await tx.reconciliationRun.create({
        data: { startedAt: now, finishedAt: new Date(), ...summary },
      });
      return summary;
    },
    { maxWait: 10_000, timeout: 30_000 },
  );
}

async function loadSource(tx: Tx): Promise<SourceRecord[]> {
  return tx.sourceObject.findMany({
    select: {
      id: true,
      kind: true,
      amount: true,
      status: true,
      updatedAt: true,
    },
  });
}

/** Charges and transfers come from the ledger; payouts from their table. */
async function loadLocal(tx: Tx): Promise<LocalRecord[]> {
  const posted = await tx.$queryRaw<
    { id: string; kind: ObjectKind; amount: bigint }[]
  >`
    SELECT t.stripe_object_id AS id,
           t.kind::text AS kind,
           sum(e.amount) FILTER (WHERE e.amount > 0)::bigint AS amount
      FROM ledger_transactions t
      JOIN ledger_entries e ON e.transaction_id = t.id
     WHERE t.kind IN ('charge', 'transfer')
     GROUP BY t.stripe_object_id, t.kind`;
  const payouts = await tx.payout.findMany({
    select: { id: true, amount: true, status: true },
  });

  return [
    ...posted.map((p) => ({ ...p, status: null })),
    ...payouts.map((p) => ({ ...p, kind: "payout" as const })),
  ];
}

async function loadPendingEvents(tx: Tx): Promise<Map<string, number>> {
  const rows = await tx.$queryRaw<{ object_id: string; count: number }[]>`
    SELECT payload #>> '{data,object,id}' AS object_id, count(*)::int AS count
      FROM stripe_events
     WHERE processed_at IS NULL
       AND payload #>> '{data,object,id}' IS NOT NULL
     GROUP BY 1`;
  return new Map(rows.map((r) => [r.object_id, r.count]));
}
