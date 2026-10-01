import fc from "fast-check";
import { afterAll, describe, expect, it } from "vitest";
import { createTestClient, resetDatabase } from "@/db/testing";
import { chargeSucceeded, payoutEvent, transferCreated } from "./fixtures";
import { processEvent, processPending, storeEvent } from "./inbox";

const db = createTestClient();
afterAll(() => db.$disconnect());

const ACCT = "acct_seller1";
const payout = (id: string, amount: number) => ({
  payout: id,
  account: ACCT,
  amount,
});

// One charge, one transfer and three payouts with different fates.
const SCENARIO = [
  chargeSucceeded({ charge: "ch_1", amount: 1500 }),
  transferCreated({ transfer: "tr_1", amount: 1100, destination: ACCT }),
  // A: paid normally.
  payoutEvent({ ...payout("po_a", 500), status: "pending" }),
  payoutEvent({ ...payout("po_a", 500), status: "in_transit" }),
  payoutEvent({ ...payout("po_a", 500), status: "paid" }),
  // B: fails in transit.
  payoutEvent({ ...payout("po_b", 400), status: "pending" }),
  payoutEvent({ ...payout("po_b", 400), status: "in_transit" }),
  payoutEvent({ ...payout("po_b", 400), status: "failed" }),
  // C: marked paid, then returned by the bank.
  payoutEvent({ ...payout("po_c", 200), status: "pending" }),
  payoutEvent({ ...payout("po_c", 200), status: "paid" }),
  payoutEvent({ ...payout("po_c", 200), status: "failed" }),
];

const EXPECTED = {
  balances: {
    external: -1000n,
    platform: 400n,
    [`seller:${ACCT}`]: 600n,
  },
  payouts: { po_a: "paid", po_b: "failed", po_c: "failed" },
};

async function finalState() {
  const [accounts, payouts, unprocessed] = await Promise.all([
    db.account.findMany(),
    db.payout.findMany(),
    db.stripeEvent.count({ where: { processedAt: null } }),
  ]);
  return {
    balances: Object.fromEntries(accounts.map((a) => [a.code, a.balance])),
    payouts: Object.fromEntries(payouts.map((p) => [p.id, p.status])),
    unprocessed,
  };
}

describe("delivery order", () => {
  it("reaches the same final state for any order, with every event delivered twice", async () => {
    // Every event appears twice, in a random order.
    const deliveries = fc.shuffledSubarray([...SCENARIO, ...SCENARIO], {
      minLength: SCENARIO.length * 2,
    });

    await fc.assert(
      fc.asyncProperty(deliveries, async (events) => {
        await resetDatabase(db);

        for (const event of events) {
          if (await storeEvent(db, event, "simulator")) {
            await processEvent(db, event.id);
          }
        }
        // Retry events that arrived before what they depend on.
        for (let pass = 0; pass < 5; pass++) {
          const remaining = await db.stripeEvent.count({
            where: { processedAt: null },
          });
          if (remaining === 0) break;
          await processPending(db);
        }

        expect(await finalState()).toEqual({ ...EXPECTED, unprocessed: 0 });
      }),
      { numRuns: 40 },
    );
  }, 120_000);
});
