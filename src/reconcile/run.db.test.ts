import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createTestClient, resetDatabase } from "@/db/testing";
import {
  chargeSucceeded,
  payoutEvent,
  transferCreated,
} from "@/events/fixtures";
import { processEvent, storeEvent } from "@/events/inbox";
import type { EventEnvelope } from "@/events/schema";
import { runReconciliation } from "./run";
import { recordAtSource } from "./source";

const db = createTestClient();
const ACCT = "acct_seller1";

const HAPPENED = new Date("2026-10-02T10:00:00Z");
const NOW = new Date("2026-10-02T12:00:00Z");
const run = (now = NOW) => runReconciliation(db, { now });

/** The provider creates the object and the webhook arrives. */
async function delivered(event: EventEnvelope) {
  await recordAtSource(db, event, HAPPENED);
  await storeEvent(db, event, "simulator");
  return processEvent(db, event.id);
}
/** The provider creates the object but the webhook never arrives. */
const dropped = (event: EventEnvelope) => recordAtSource(db, event, HAPPENED);

const openMismatches = () =>
  db.mismatch.findMany({
    where: { resolvedAt: null },
    orderBy: [{ objectId: "asc" }, { type: "asc" }],
  });

async function fundSeller(amount: number) {
  await delivered(chargeSucceeded({ charge: "ch_fund", amount }));
  await delivered(
    transferCreated({ transfer: "tr_fund", amount, destination: ACCT }),
  );
}
const payout = { payout: "po_1", account: ACCT, amount: 400 };

beforeEach(() => resetDatabase(db));
afterAll(() => db.$disconnect());

describe("runReconciliation", () => {
  it("finds nothing when every webhook was delivered", async () => {
    await fundSeller(1000);
    await delivered(payoutEvent({ ...payout, status: "paid" }));

    expect(await run()).toEqual({
      objectsChecked: 3,
      opened: 0,
      stillOpen: 0,
      resolved: 0,
    });
    expect(await db.reconciliationRun.count()).toBe(1);
  });

  it("flags a transfer whose webhook was dropped", async () => {
    await delivered(chargeSucceeded({ charge: "ch_1", amount: 1000 }));
    await dropped(
      transferCreated({ transfer: "tr_1", amount: 900, destination: ACCT }),
    );

    const summary = await run();

    expect(summary?.opened).toBe(1);
    expect(await openMismatches()).toMatchObject([
      {
        objectId: "tr_1",
        objectKind: "transfer",
        type: "missing_locally",
        details: { expected: { amount: "900" } },
      },
    ]);
  });

  it("flags a payout stuck behind the source when its final event was dropped", async () => {
    await fundSeller(1000);
    await delivered(payoutEvent({ ...payout, status: "in_transit" }));
    await dropped(payoutEvent({ ...payout, status: "failed" }));

    await run();

    expect(await openMismatches()).toMatchObject([
      {
        objectId: "po_1",
        type: "status_mismatch",
        details: {
          expected: { status: "failed" },
          actual: { status: "in_transit" },
        },
      },
    ]);
  });

  it("notes when the event arrived but could not be applied", async () => {
    // The payout's webhook arrives; the transfer that funds it was dropped.
    await delivered(chargeSucceeded({ charge: "ch_1", amount: 1000 }));
    await dropped(
      transferCreated({ transfer: "tr_1", amount: 900, destination: ACCT }),
    );
    expect(await delivered(payoutEvent({ ...payout, status: "paid" }))).toBe(
      "failed",
    );

    await run();

    const open = await openMismatches();
    expect(open.map((m) => [m.objectId, m.type])).toEqual([
      ["po_1", "missing_locally"],
      ["tr_1", "missing_locally"],
    ]);
    expect(open[0].details).toMatchObject({ pendingEvents: 1 });
  });

  it("flags a local payout the source has no record of", async () => {
    await fundSeller(1000);
    const event = payoutEvent({ ...payout, status: "paid" });
    await storeEvent(db, event, "simulator");
    await processEvent(db, event.id);

    await run();

    expect(await openMismatches()).toMatchObject([
      { objectId: "po_1", type: "missing_at_source" },
    ]);
  });

  it("refreshes an open mismatch instead of duplicating it", async () => {
    await dropped(chargeSucceeded({ charge: "ch_1", amount: 1000 }));
    const later = new Date(NOW.getTime() + 60_000);

    await run();
    const second = await run(later);

    expect(second).toMatchObject({ opened: 0, stillOpen: 1, resolved: 0 });
    const all = await db.mismatch.findMany();
    expect(all).toHaveLength(1);
    expect(all[0].detectedAt).toEqual(NOW);
    expect(all[0].lastSeenAt).toEqual(later);
  });

  it("resolves a mismatch once the missing webhook arrives", async () => {
    const charge = chargeSucceeded({ charge: "ch_1", amount: 1000 });
    await dropped(charge);
    await run();
    expect(await openMismatches()).toHaveLength(1);

    await storeEvent(db, charge, "simulator");
    await processEvent(db, charge.id);
    const later = new Date(NOW.getTime() + 60_000);
    const summary = await run(later);

    expect(summary).toMatchObject({ opened: 0, stillOpen: 0, resolved: 1 });
    expect(await openMismatches()).toEqual([]);
    expect((await db.mismatch.findFirstOrThrow()).resolvedAt).toEqual(later);
  });

  it("reopens as a new mismatch if the same problem comes back", async () => {
    const charge = chargeSucceeded({ charge: "ch_1", amount: 1000 });
    await dropped(charge);
    await run();
    await db.sourceObject.deleteMany();
    await run();
    await dropped(charge);

    await run();

    expect(await db.mismatch.count()).toBe(2);
    expect(await openMismatches()).toHaveLength(1);
  });

  it("does not flag an object the source changed moments ago", async () => {
    const event = chargeSucceeded({ charge: "ch_1", amount: 1000 });
    await recordAtSource(db, event, new Date(NOW.getTime() - 5_000));

    expect(await run()).toMatchObject({ opened: 0 });
  });

  it("lets only one of several simultaneous runs through, with no duplicates", async () => {
    await dropped(chargeSucceeded({ charge: "ch_1", amount: 1000 }));
    await dropped(chargeSucceeded({ charge: "ch_2", amount: 500 }));

    const results = await Promise.all(Array.from({ length: 5 }, () => run()));

    expect(results.filter((r) => r !== null).length).toBeGreaterThanOrEqual(1);
    expect(await db.mismatch.count()).toBe(2);
    expect(await db.reconciliationRun.count()).toBe(
      results.filter((r) => r !== null).length,
    );
  });
});
