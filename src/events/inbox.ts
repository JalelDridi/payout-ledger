import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type { EventOutcome, EventSource } from "@/generated/prisma/enums";
import { applyEvent } from "./apply";
import { log } from "@/log";
import { EventEnvelope } from "./schema";

/** After this many failures an event is left for a human to look at. */
export const MAX_ATTEMPTS = 8;

/**
 * Stores a verified event. Returns false if this event ID was already
 * stored: the primary key makes a duplicate delivery a no-op.
 */
export async function storeEvent(
  db: PrismaClient,
  event: EventEnvelope,
  source: EventSource,
): Promise<boolean> {
  const result = await db.stripeEvent.createMany({
    data: [
      {
        id: event.id,
        type: event.type,
        source,
        apiCreated: new Date(event.created * 1000),
        payload: event as Prisma.InputJsonObject,
      },
    ],
    skipDuplicates: true,
  });
  return result.count === 1;
}

export type ProcessResult = EventOutcome | "skipped" | "failed";

/**
 * Applies a stored event exactly once. The event row is locked, applied and
 * marked processed in a single transaction, so a crash or a concurrent
 * worker can never apply it twice.
 *
 * - "skipped": already processed, or another worker holds it right now.
 * - "failed": the error is recorded on the event and it stays unprocessed.
 */
export async function processEvent(
  db: PrismaClient,
  id: string,
): Promise<ProcessResult> {
  try {
    return await db.$transaction(
      async (tx) => {
        const locked = await tx.$queryRaw<{ payload: unknown }[]>`
          SELECT payload
            FROM stripe_events
           WHERE id = ${id} AND processed_at IS NULL
             FOR UPDATE SKIP LOCKED`;
        if (locked.length === 0) return "skipped";

        const outcome = await applyEvent(
          tx,
          EventEnvelope.parse(locked[0].payload),
        );
        await tx.stripeEvent.update({
          where: { id },
          data: { processedAt: new Date(), outcome, lastError: null },
        });
        return outcome;
      },
      { maxWait: 10_000, timeout: 15_000 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.stripeEvent.update({
      where: { id },
      data: { attempts: { increment: 1 }, lastError: message.slice(0, 500) },
    });
    log("event.failed", { id, error: message.slice(0, 200) });
    return "failed";
  }
}

/**
 * Processes stored events that are still unprocessed, oldest first. This is
 * the retry path: an event that failed because something it depends on had
 * not arrived yet (a payout before the transfer that funds it) succeeds on
 * a later sweep.
 */
export async function processPending(
  db: PrismaClient,
  limit = 100,
): Promise<Record<ProcessResult, number>> {
  const pending = await db.stripeEvent.findMany({
    where: { processedAt: null, attempts: { lt: MAX_ATTEMPTS } },
    orderBy: [{ apiCreated: "asc" }, { id: "asc" }],
    take: limit,
    select: { id: true },
  });

  const counts: Record<ProcessResult, number> = {
    applied: 0,
    stale: 0,
    ignored: 0,
    skipped: 0,
    failed: 0,
  };
  for (const { id } of pending) counts[await processEvent(db, id)]++;
  return counts;
}
