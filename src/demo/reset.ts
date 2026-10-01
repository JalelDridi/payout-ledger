import { randomBytes } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import { truncateAll } from "@/db/truncate";
import { runJobs } from "@/jobs/run";
import { runScenario } from "@/simulator/run";
import type { ScenarioKind } from "@/simulator/scenarios";

const SEED: ScenarioKind[] = ["happy", "happy", "duplicate", "failed"];

export const newRunId = () => randomBytes(4).toString("hex");

/** Wipes the demo and seeds a few scenarios so the dashboard is not empty. */
export async function resetDemo(db: PrismaClient): Promise<void> {
  await truncateAll(db);
  for (const kind of SEED) {
    await runScenario(db, kind, {
      runId: newRunId(),
      now: new Date(),
      random: Math.random,
    });
  }
  await runJobs(db);
}
