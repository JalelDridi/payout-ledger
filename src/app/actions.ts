"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { newRunId } from "@/demo/reset";
import { runJobs } from "@/jobs/run";
import {
  assertWithinBudget,
  runScenario,
  SimulatorLimitError,
} from "@/simulator/run";
import {
  SCENARIO_KINDS,
  type ScenarioKind,
  SCENARIOS,
} from "@/simulator/scenarios";

export type ActionResult = { ok: boolean; message: string } | null;

/** Checks can be triggered by anyone, so space them out. */
const CHECK_COOLDOWN_MS = 3000;

/** Single entry point for the panel, so it shows one result at a time. */
export async function act(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  return formData.get("intent") === "check" ? runChecks() : simulate(formData);
}

async function simulate(formData: FormData): Promise<ActionResult> {
  const kind = formData.get("kind");
  if (!SCENARIO_KINDS.includes(kind as ScenarioKind)) {
    return { ok: false, message: "Unknown scenario." };
  }
  const scenario = SCENARIOS[kind as ScenarioKind];
  const db = getDb();

  try {
    await assertWithinBudget(db);
  } catch (error) {
    if (error instanceof SimulatorLimitError) {
      return { ok: false, message: error.message };
    }
    throw error;
  }

  const { sent } = await runScenario(db, kind as ScenarioKind, {
    runId: newRunId(),
    now: new Date(),
    random: Math.random,
  });
  revalidatePath("/");
  return {
    ok: true,
    message: `${scenario.title}: ${sent} webhooks sent. ${scenario.expect}`,
  };
}

async function runChecks(): Promise<ActionResult> {
  const db = getDb();
  const last = await db.reconciliationRun.findFirst({
    orderBy: { finishedAt: "desc" },
  });
  if (last && Date.now() - last.finishedAt.getTime() < CHECK_COOLDOWN_MS) {
    return { ok: false, message: "The checks ran a moment ago." };
  }

  const { sweep, reconciliation, alerts } = await runJobs(db);
  revalidatePath("/");

  const retried = sweep.applied + sweep.stale + sweep.ignored;
  const open = reconciliation
    ? reconciliation.opened + reconciliation.stillOpen
    : null;
  return {
    ok: true,
    message: [
      "Checks finished.",
      `${retried} waiting ${retried === 1 ? "event" : "events"} applied,`,
      open === null
        ? "reconciliation was already running,"
        : `${open} open ${open === 1 ? "mismatch" : "mismatches"},`,
      `${alerts.open} open ${alerts.open === 1 ? "alert" : "alerts"}.`,
    ].join(" "),
  };
}
