import type { PrismaClient } from "@/generated/prisma/client";

/** Everything the dashboard shows, loaded in one place. */
export async function loadDashboard(db: PrismaClient) {
  const [
    eventCount,
    waitingEvents,
    payoutGroups,
    accounts,
    entrySum,
    alerts,
    openMismatches,
    resolvedMismatches,
    payouts,
    events,
    lastRun,
  ] = await Promise.all([
    db.stripeEvent.count(),
    db.stripeEvent.count({ where: { processedAt: null } }),
    db.payout.groupBy({ by: ["status"], _count: true }),
    db.account.findMany({ orderBy: { code: "asc" } }),
    db.ledgerEntry.aggregate({ _sum: { amount: true } }),
    db.alert.findMany({
      where: { resolvedAt: null },
      orderBy: { raisedAt: "desc" },
      take: 10,
    }),
    db.mismatch.findMany({
      where: { resolvedAt: null },
      orderBy: { detectedAt: "desc" },
      take: 10,
    }),
    db.mismatch.findMany({
      where: { resolvedAt: { not: null } },
      orderBy: { resolvedAt: "desc" },
      take: 3,
    }),
    db.payout.findMany({ orderBy: { updatedAt: "desc" }, take: 10 }),
    db.stripeEvent.findMany({
      orderBy: { receivedAt: "desc" },
      take: 15,
      select: {
        id: true,
        type: true,
        receivedAt: true,
        processedAt: true,
        outcome: true,
        attempts: true,
        lastError: true,
      },
    }),
    db.reconciliationRun.findFirst({ orderBy: { startedAt: "desc" } }),
  ]);

  const payoutCounts = Object.fromEntries(
    payoutGroups.map((g) => [g.status, g._count]),
  );
  const sellers = accounts.filter((a) => a.kind === "seller");

  return {
    eventCount,
    waitingEvents,
    payoutCount: payoutGroups.reduce((n, g) => n + g._count, 0),
    payoutsPaid: payoutCounts.paid ?? 0,
    payoutsInFlight:
      (payoutCounts.pending ?? 0) + (payoutCounts.in_transit ?? 0),
    payoutsFailed: payoutCounts.failed ?? 0,
    sellerBalance: sellers.reduce((sum, a) => sum + a.balance, 0n),
    sellerCount: sellers.length,
    platformBalance: accounts.find((a) => a.code === "platform")?.balance ?? 0n,
    /** Zero when every transaction is balanced. */
    ledgerSum: entrySum._sum.amount ?? 0n,
    alerts,
    openMismatches,
    resolvedMismatches,
    payouts,
    events,
    lastRun,
  };
}

export type Dashboard = Awaited<ReturnType<typeof loadDashboard>>;
