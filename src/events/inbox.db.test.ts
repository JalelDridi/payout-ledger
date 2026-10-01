import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createTestClient, resetDatabase } from "@/db/testing";
import { chargeSucceeded, payoutEvent, transferCreated } from "./fixtures";
import {
  MAX_ATTEMPTS,
  processEvent,
  processPending,
  storeEvent,
} from "./inbox";
import type { EventEnvelope } from "./schema";

const db = createTestClient();
const ACCT = "acct_seller1";
const SELLER = `seller:${ACCT}`;

async function deliver(event: EventEnvelope) {
  await storeEvent(db, event, "simulator");
  return processEvent(db, event.id);
}

async function balances(): Promise<Record<string, bigint>> {
  const accounts = await db.account.findMany();
  return Object.fromEntries(accounts.map((a) => [a.code, a.balance]));
}

/** Gives the seller a balance: a charge, then a transfer of the same amount. */
async function fundSeller(amount: number) {
  await deliver(chargeSucceeded({ charge: "ch_fund", amount }));
  await deliver(
    transferCreated({ transfer: "tr_fund", amount, destination: ACCT }),
  );
}

beforeEach(() => resetDatabase(db));
afterAll(() => db.$disconnect());

describe("applying events to the ledger", () => {
  it("follows a charge, a transfer and a paid payout", async () => {
    await deliver(chargeSucceeded({ charge: "ch_1", amount: 1000 }));
    expect(await balances()).toEqual({ external: -1000n, platform: 1000n });

    await deliver(
      transferCreated({ transfer: "tr_1", amount: 900, destination: ACCT }),
    );
    expect(await balances()).toEqual({
      external: -1000n,
      platform: 100n,
      [SELLER]: 900n,
    });

    const payout = { payout: "po_1", account: ACCT, amount: 900 };
    expect(await deliver(payoutEvent({ ...payout, status: "pending" }))).toBe(
      "applied",
    );
    await deliver(payoutEvent({ ...payout, status: "in_transit" }));
    await deliver(payoutEvent({ ...payout, status: "paid" }));

    expect(await balances()).toEqual({
      external: -100n,
      platform: 100n,
      [SELLER]: 0n,
    });
    expect(
      (await db.payout.findUniqueOrThrow({ where: { id: "po_1" } })).status,
    ).toBe("paid");
  });

  it("marks unknown event types as ignored", async () => {
    const event = {
      ...chargeSucceeded({ charge: "ch_1", amount: 1000 }),
      type: "customer.created",
    };
    expect(await deliver(event)).toBe("ignored");
    expect(await db.ledgerTransaction.count()).toBe(0);
  });
});

describe("duplicates", () => {
  it("stores and applies a redelivered event once", async () => {
    const event = chargeSucceeded({ charge: "ch_1", amount: 1000 });

    expect(await storeEvent(db, event, "simulator")).toBe(true);
    expect(await storeEvent(db, event, "simulator")).toBe(false);
    expect(await processEvent(db, event.id)).toBe("applied");
    expect(await processEvent(db, event.id)).toBe("skipped");

    expect(await db.stripeEvent.count()).toBe(1);
    expect((await balances()).platform).toBe(1000n);
  });

  it("does not post the same charge twice when two events describe it", async () => {
    expect(
      await deliver(chargeSucceeded({ charge: "ch_1", amount: 1000 })),
    ).toBe("applied");
    expect(
      await deliver(chargeSucceeded({ charge: "ch_1", amount: 1000 })),
    ).toBe("stale");

    expect(await db.ledgerTransaction.count()).toBe(1);
    expect((await balances()).platform).toBe(1000n);
  });

  it("applies an event once when ten workers process it at the same time", async () => {
    const event = chargeSucceeded({ charge: "ch_1", amount: 1000 });
    await storeEvent(db, event, "simulator");

    const results = await Promise.all(
      Array.from({ length: 10 }, () => processEvent(db, event.id)),
    );

    expect(results.filter((r) => r === "applied")).toHaveLength(1);
    expect(results.filter((r) => r === "skipped")).toHaveLength(9);
    expect((await balances()).platform).toBe(1000n);
  });
});

describe("out-of-order payout events", () => {
  const payout = { payout: "po_1", account: ACCT, amount: 400 };

  it("ignores an older status that arrives after a newer one", async () => {
    await fundSeller(1000);
    await deliver(payoutEvent({ ...payout, status: "paid" }));

    expect(
      await deliver(payoutEvent({ ...payout, status: "in_transit" })),
    ).toBe("stale");
    expect(await deliver(payoutEvent({ ...payout, status: "pending" }))).toBe(
      "stale",
    );

    const stored = await db.payout.findUniqueOrThrow({ where: { id: "po_1" } });
    expect(stored.status).toBe("paid");
    expect((await balances())[SELLER]).toBe(600n);
  });

  it("returns the money when a paid payout later fails", async () => {
    await fundSeller(1000);
    await deliver(payoutEvent({ ...payout, status: "paid" }));
    expect((await balances())[SELLER]).toBe(600n);

    expect(await deliver(payoutEvent({ ...payout, status: "failed" }))).toBe(
      "applied",
    );

    const stored = await db.payout.findUniqueOrThrow({ where: { id: "po_1" } });
    expect(stored.status).toBe("failed");
    expect(stored.failureCode).toBe("account_closed");
    expect((await balances())[SELLER]).toBe(1000n);
  });

  it("moves no money when the failure arrives before the creation", async () => {
    await fundSeller(1000);
    await deliver(payoutEvent({ ...payout, status: "failed" }));
    expect(await deliver(payoutEvent({ ...payout, status: "pending" }))).toBe(
      "stale",
    );

    expect((await balances())[SELLER]).toBe(1000n);
    expect(
      await db.ledgerTransaction.count({ where: { kind: "payout" } }),
    ).toBe(0);
  });
});

describe("events that arrive before what they depend on", () => {
  it("records the failure, then succeeds on a later sweep", async () => {
    const payout = payoutEvent({
      payout: "po_1",
      account: ACCT,
      amount: 400,
      status: "paid",
    });

    // The payout arrives before the transfer that funds it.
    expect(await deliver(payout)).toBe("failed");
    const failed = await db.stripeEvent.findUniqueOrThrow({
      where: { id: payout.id },
    });
    expect(failed.processedAt).toBeNull();
    expect(failed.attempts).toBe(1);
    expect(failed.lastError).toMatch(/Insufficient funds/);
    expect(await db.payout.count()).toBe(0);

    await fundSeller(1000);
    const sweep = await processPending(db);

    expect(sweep.applied).toBe(1);
    expect((await balances())[SELLER]).toBe(600n);
  });

  it("stops retrying an event after the attempt limit", async () => {
    const event = payoutEvent({
      payout: "po_1",
      account: ACCT,
      amount: 400,
      status: "paid",
    });
    await storeEvent(db, event, "simulator");
    await db.stripeEvent.update({
      where: { id: event.id },
      data: { attempts: MAX_ATTEMPTS },
    });

    const sweep = await processPending(db);

    expect(Object.values(sweep).every((n) => n === 0)).toBe(true);
  });

  it("records a malformed object as a failure without applying it", async () => {
    const event = payoutEvent({
      payout: "po_1",
      account: ACCT,
      amount: -5,
      status: "paid",
    });

    expect(await deliver(event)).toBe("failed");
    expect(await db.payout.count()).toBe(0);
  });
});

describe("concurrent payouts from one balance", () => {
  it("pays out only what the balance covers", async () => {
    await fundSeller(1000);
    const events = Array.from({ length: 25 }, (_, i) =>
      payoutEvent({
        payout: `po_${i}`,
        account: ACCT,
        amount: 100,
        status: "pending",
      }),
    );
    for (const event of events) await storeEvent(db, event, "simulator");

    const results = await Promise.all(
      events.map((event) => processEvent(db, event.id)),
    );

    expect(results.filter((r) => r === "applied")).toHaveLength(10);
    expect(results.filter((r) => r === "failed")).toHaveLength(15);
    expect((await balances())[SELLER]).toBe(0n);
    expect(await db.payout.count()).toBe(10);
  });
});
