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
import { resetDemo } from "@/demo/reset";
import { runJobs } from "@/jobs/run";
import {
  assertWithinBudget,
  MAX_EVENTS_PER_MINUTE,
  runScenario,
  SimulatorLimitError,
} from "./run";
import type { ScenarioKind } from "./scenarios";

const db = createTestClient();
const NOW = new Date("2026-10-02T12:00:00Z");

let run = 0;
const simulate = (kind: ScenarioKind) =>
  runScenario(db, kind, { runId: `t${++run}`, now: NOW, random: () => 0 });
const checks = () => runJobs(db, { now: NOW });

// With random() = 0: seller acct_sim_001, charge 2500, seller share 2250.
const SELLER = "seller:acct_sim_001";
async function state() {
  const [accounts, payouts, unprocessed, mismatches, alerts] =
    await Promise.all([
      db.account.findMany(),
      db.payout.findMany(),
      db.stripeEvent.count({ where: { processedAt: null } }),
      db.mismatch.findMany({ where: { resolvedAt: null } }),
      db.alert.findMany({ where: { resolvedAt: null } }),
    ]);
  return {
    balances: Object.fromEntries(accounts.map((a) => [a.code, a.balance])),
    payoutStatuses: payouts.map((p) => p.status),
    unprocessed,
    mismatches: mismatches.map((m) => m.type),
    alerts: alerts.map((a) => a.type),
  };
}
const PAID = {
  balances: { external: -250n, platform: 250n, [SELLER]: 0n },
  payoutStatuses: ["paid"],
  unprocessed: 0,
  mismatches: [],
  alerts: [],
};

beforeEach(async () => {
  vi.stubEnv("DATABASE_URL", TEST_DATABASE_URL);
  vi.stubEnv("SIMULATOR_WEBHOOK_SECRET", "whsec_test_simulator");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", undefined);
  await resetDatabase(db);
});
afterEach(() => vi.unstubAllEnvs());
afterAll(() => db.$disconnect());

describe("scenarios, end to end through the webhook handler", () => {
  it("happy: the payout is paid and the checks find nothing", async () => {
    await simulate("happy");
    await checks();

    expect(await state()).toEqual(PAID);
    expect(await db.stripeEvent.count()).toBe(5);
  });

  it("duplicate: ends exactly like a normal payout", async () => {
    expect(await simulate("duplicate")).toEqual({ sent: 10 });
    await checks();

    expect(await state()).toEqual(PAID);
    expect(await db.stripeEvent.count()).toBe(5);
  });

  it("out_of_order: early events wait, then the checks bring it to the same end state", async () => {
    await simulate("out_of_order");
    expect((await state()).unprocessed).toBeGreaterThan(0);

    await checks();

    expect(await state()).toEqual(PAID);
  });

  it("dropped: the checks flag the payout as behind the source", async () => {
    await simulate("dropped");
    await checks();

    expect(await state()).toMatchObject({
      payoutStatuses: ["in_transit"],
      mismatches: ["status_mismatch"],
      alerts: [],
    });
  });

  it("failed: the money returns to the seller and an alert is raised", async () => {
    await simulate("failed");
    await checks();

    expect(await state()).toMatchObject({
      balances: { [SELLER]: 2250n },
      payoutStatuses: ["failed"],
      mismatches: [],
      alerts: ["payout_failed"],
    });
  });

  it("stuck: an alert is raised, and resolved once the payout moves on", async () => {
    await simulate("stuck");
    await checks();
    expect(await state()).toMatchObject({
      payoutStatuses: ["in_transit"],
      mismatches: [],
      alerts: ["payout_stuck"],
    });

    await db.payout.updateMany({ data: { status: "paid" } });
    await db.sourceObject.updateMany({
      where: { kind: "payout" },
      data: { status: "paid" },
    });
    const second = await checks();

    expect(second.alerts).toMatchObject({ resolved: 1, open: 0 });
    expect((await state()).alerts).toEqual([]);
  });

  it("does not raise the same alert twice across repeated checks", async () => {
    await simulate("failed");
    await checks();
    await checks();
    await Promise.all([checks(), checks(), checks()]);

    expect(await db.alert.count()).toBe(1);
  });
});

describe("simulator budget", () => {
  it("allows a run on an empty database", async () => {
    await expect(assertWithinBudget(db)).resolves.toBeUndefined();
  });

  it("refuses once the per-minute budget is used up", async () => {
    await db.stripeEvent.createMany({
      data: Array.from({ length: MAX_EVENTS_PER_MINUTE }, (_, i) => ({
        id: `evt_fill_${i}`,
        type: "smoke.test",
        source: "simulator" as const,
        apiCreated: new Date(),
        payload: {},
      })),
    });

    await expect(assertWithinBudget(db)).rejects.toThrow(SimulatorLimitError);
    // A minute later the same events no longer count.
    await expect(
      assertWithinBudget(db, new Date(Date.now() + 61_000)),
    ).resolves.toBeUndefined();
  });
});

describe("resetDemo", () => {
  it("wipes existing data and leaves a seeded, consistent demo", async () => {
    await simulate("dropped");
    await checks();

    await resetDemo(db);

    const after = await state();
    expect(after.unprocessed).toBe(0);
    expect(after.mismatches).toEqual([]);
    expect(after.payoutStatuses.sort()).toEqual([
      "failed",
      "paid",
      "paid",
      "paid",
    ]);
    expect(after.alerts).toEqual(["payout_failed"]);
    // The ledger still sums to zero.
    const total = Object.values(after.balances).reduce((a, b) => a + b, 0n);
    expect(total).toBe(0n);
  });
});
