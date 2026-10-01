import type { PrismaClient } from "@/generated/prisma/client";
import type { AlertType } from "@/generated/prisma/enums";
import { MAX_ATTEMPTS } from "@/events/inbox";
import { formatCents } from "@/money";

/** A payout still pending or in transit after this long counts as stuck. */
export const STUCK_AFTER_MS = 48 * 60 * 60 * 1000;

type Condition = { type: AlertType; subjectId: string; message: string };

export type AlertSummary = { raised: number; resolved: number; open: number };

/**
 * Raises an alert for each condition that holds and resolves alerts whose
 * condition no longer does. Safe to run repeatedly and concurrently: the
 * database allows one open alert per type and subject.
 */
export async function detectAlerts(
  db: PrismaClient,
  options: { now?: Date; stuckAfterMs?: number } = {},
): Promise<AlertSummary> {
  const now = options.now ?? new Date();
  const stuckBefore = new Date(
    now.getTime() - (options.stuckAfterMs ?? STUCK_AFTER_MS),
  );

  const [failed, stuck, dead] = await Promise.all([
    db.payout.findMany({ where: { status: "failed" } }),
    db.payout.findMany({
      where: {
        status: { in: ["pending", "in_transit"] },
        statusChangedAt: { lt: stuckBefore },
      },
    }),
    db.stripeEvent.findMany({
      where: { processedAt: null, attempts: { gte: MAX_ATTEMPTS } },
      select: { id: true, type: true, attempts: true, lastError: true },
    }),
  ]);

  const conditions: Condition[] = [
    ...failed.map((p) => ({
      type: "payout_failed" as const,
      subjectId: p.id,
      message: `Payout of ${formatCents(p.amount)} to ${p.connectedAccountId} failed${
        p.failureCode ? ` (${p.failureCode})` : ""
      }. The amount was returned to the seller's balance.`,
    })),
    ...stuck.map((p) => ({
      type: "payout_stuck" as const,
      subjectId: p.id,
      message: `Payout of ${formatCents(p.amount)} to ${p.connectedAccountId} has been ${p.status.replace("_", " ")} for ${hoursBetween(p.statusChangedAt, now)} hours.`,
    })),
    ...dead.map((e) => ({
      type: "event_unprocessable" as const,
      subjectId: e.id,
      message: `Event ${e.type} could not be applied after ${e.attempts} attempts: ${e.lastError ?? "unknown error"}`,
    })),
  ];

  const key = (a: { type: string; subjectId: string }) =>
    `${a.type}|${a.subjectId}`;
  const holding = new Set(conditions.map(key));
  const open = await db.alert.findMany({ where: { resolvedAt: null } });
  const openKeys = new Set(open.map(key));

  const toRaise = conditions.filter((c) => !openKeys.has(key(c)));
  const toResolve = open.filter((a) => !holding.has(key(a)));

  const raised = await db.alert.createMany({
    data: toRaise.map((c) => ({ ...c, raisedAt: now })),
    skipDuplicates: true,
  });
  await db.alert.updateMany({
    where: { id: { in: toResolve.map((a) => a.id) }, resolvedAt: null },
    data: { resolvedAt: now },
  });

  return {
    raised: raised.count,
    resolved: toResolve.length,
    open: holding.size,
  };
}

function hoursBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 3_600_000);
}
