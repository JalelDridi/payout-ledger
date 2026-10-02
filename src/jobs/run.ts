import type { PrismaClient } from "@/generated/prisma/client";
import { type AlertSummary, detectAlerts } from "@/alerts/detect";
import { processPending, type ProcessResult } from "@/events/inbox";
import { log } from "@/log";
import { type RunSummary, runReconciliation } from "@/reconcile/run";

export type JobsSummary = {
  sweep: Record<ProcessResult, number>;
  /** null when another reconciliation was already running. */
  reconciliation: RunSummary | null;
  alerts: AlertSummary;
};

/**
 * The periodic checks, in dependency order: retry unapplied events, compare
 * against the source, then raise or resolve alerts. Each step is safe to
 * repeat, so a scheduled run and a manual run may overlap.
 */
export async function runJobs(
  db: PrismaClient,
  options: { now?: Date } = {},
): Promise<JobsSummary> {
  const sweep = await processPending(db);
  const reconciliation = await runReconciliation(db, options);
  const alerts = await detectAlerts(db, options);
  log("jobs.finished", {
    retried: sweep.applied + sweep.stale + sweep.ignored,
    stillFailing: sweep.failed,
    mismatchesOpen: reconciliation
      ? reconciliation.opened + reconciliation.stillOpen
      : null,
    alertsOpen: alerts.open,
  });
  return { sweep, reconciliation, alerts };
}
