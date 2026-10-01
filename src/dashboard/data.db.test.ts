import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  createTestClient,
  resetDatabase,
  TEST_DATABASE_URL,
} from "@/db/testing";
import { runJobs } from "@/jobs/run";
import { runScenario } from "@/simulator/run";
import { loadDashboard } from "./data";

const db = createTestClient();
const NOW = new Date("2026-10-02T12:00:00Z");

beforeEach(async () => {
  vi.stubEnv("DATABASE_URL", TEST_DATABASE_URL);
  vi.stubEnv("SIMULATOR_WEBHOOK_SECRET", "whsec_test_simulator");
  await resetDatabase(db);
});
afterEach(() => vi.unstubAllEnvs());
afterAll(() => db.$disconnect());

describe("loadDashboard", () => {
  it("returns zeros for an empty database", async () => {
    expect(await loadDashboard(db)).toMatchObject({
      eventCount: 0,
      waitingEvents: 0,
      payoutCount: 0,
      sellerBalance: 0n,
      ledgerSum: 0n,
      alerts: [],
      openMismatches: [],
      lastRun: null,
    });
  });

  it("summarises payouts, balances, alerts and mismatches", async () => {
    const ctx = (runId: string) => ({ runId, now: NOW, random: () => 0 });
    await runScenario(db, "happy", ctx("a"));
    await runScenario(db, "failed", ctx("b"));
    await runScenario(db, "dropped", ctx("c"));
    await runScenario(db, "out_of_order", ctx("d"));

    const before = await loadDashboard(db);
    expect(before.waitingEvents).toBeGreaterThan(0);

    await runJobs(db, { now: NOW });
    const data = await loadDashboard(db);

    expect(data).toMatchObject({
      eventCount: 19,
      waitingEvents: 0,
      payoutCount: 4,
      payoutsPaid: 2,
      payoutsInFlight: 1,
      payoutsFailed: 1,
      // Only the failed payout's amount is back in a seller balance.
      sellerBalance: 2250n,
      ledgerSum: 0n,
    });
    expect(data.alerts.map((a) => a.type)).toEqual(["payout_failed"]);
    expect(data.openMismatches.map((m) => m.type)).toEqual(["status_mismatch"]);
    expect(data.lastRun?.objectsChecked).toBe(12);
  });
});
