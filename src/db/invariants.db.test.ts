import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { createTestClient, resetDatabase } from "./testing";

// These tests write through Prisma with no application-level checks, to
// prove the database itself refuses invalid ledger states.

const db = createTestClient();

type Entry = { accountId: string; amount: bigint };

let key = 0;

function post(client: PrismaClient, entries: Entry[]) {
  return client.ledgerTransaction.create({
    data: {
      kind: "transfer",
      stripeObjectId: "tr_test",
      idempotencyKey: `test-${++key}`,
      entries: { create: entries },
    },
  });
}

async function balanceOf(accountId: string): Promise<bigint> {
  const account = await db.account.findUniqueOrThrow({
    where: { id: accountId },
  });
  return account.balance;
}

let external: string;
let seller: string;
let platform: string;

beforeEach(async () => {
  await resetDatabase(db);
  const [e, s, p] = await Promise.all([
    db.account.create({
      data: { code: "external", kind: "external", allowNegative: true },
    }),
    db.account.create({
      data: {
        code: "seller:acct_1",
        kind: "seller",
        connectedAccountId: "acct_1",
      },
    }),
    db.account.create({ data: { code: "platform", kind: "platform" } }),
  ]);
  external = e.id;
  seller = s.id;
  platform = p.id;
});

afterAll(async () => {
  await db.$disconnect();
});

describe("double entry", () => {
  it("accepts a balanced transaction and updates both balances", async () => {
    await post(db, [
      { accountId: external, amount: -1000n },
      { accountId: seller, amount: 900n },
      { accountId: platform, amount: 100n },
    ]);

    expect(await balanceOf(external)).toBe(-1000n);
    expect(await balanceOf(seller)).toBe(900n);
    expect(await balanceOf(platform)).toBe(100n);
  });

  it("rejects a transaction whose entries do not sum to zero", async () => {
    await expect(
      post(db, [
        { accountId: external, amount: -1000n },
        { accountId: seller, amount: 999n },
      ]),
    ).rejects.toThrow(/not balanced/);

    expect(await db.ledgerTransaction.count()).toBe(0);
    expect(await balanceOf(seller)).toBe(0n);
  });

  it("rejects a transaction with no entries", async () => {
    await expect(post(db, [])).rejects.toThrow(/not balanced/);
  });

  it("rejects a zero-amount entry", async () => {
    await expect(
      post(db, [
        { accountId: external, amount: 0n },
        { accountId: seller, amount: 0n },
      ]),
    ).rejects.toThrow(/ledger_entries_amount_non_zero/);
  });
});

describe("never negative", () => {
  it("rejects an overdraft on an account that may not go negative", async () => {
    await post(db, [
      { accountId: external, amount: -500n },
      { accountId: seller, amount: 500n },
    ]);

    await expect(
      post(db, [
        { accountId: seller, amount: -501n },
        { accountId: external, amount: 501n },
      ]),
    ).rejects.toThrow(/accounts_balance_non_negative/);

    expect(await balanceOf(seller)).toBe(500n);
  });

  it("holds under concurrent spends: only what the balance covers succeeds", async () => {
    await post(db, [
      { accountId: external, amount: -1000n },
      { accountId: seller, amount: 1000n },
    ]);

    // 25 concurrent attempts to spend 100 from a balance of 1000.
    const results = await Promise.allSettled(
      Array.from({ length: 25 }, () =>
        post(db, [
          { accountId: seller, amount: -100n },
          { accountId: external, amount: 100n },
        ]),
      ),
    );

    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    expect(succeeded).toBe(10);
    expect(await balanceOf(seller)).toBe(0n);
    expect(await balanceOf(external)).toBe(0n);
  });
});

describe("append only", () => {
  it("rejects updating or deleting a ledger entry", async () => {
    const tx = await post(db, [
      { accountId: external, amount: -100n },
      { accountId: seller, amount: 100n },
    ]);

    await expect(
      db.ledgerEntry.updateMany({
        where: { transactionId: tx.id },
        data: { amount: 1n },
      }),
    ).rejects.toThrow(/append-only/);
    await expect(
      db.ledgerEntry.deleteMany({ where: { transactionId: tx.id } }),
    ).rejects.toThrow(/append-only/);

    expect(await balanceOf(seller)).toBe(100n);
  });
});

describe("idempotency", () => {
  it("rejects a second transaction with the same idempotency key", async () => {
    const data = {
      kind: "transfer" as const,
      stripeObjectId: "tr_test",
      idempotencyKey: "same-key",
      entries: {
        create: [
          { accountId: external, amount: -100n },
          { accountId: seller, amount: 100n },
        ],
      },
    };
    await db.ledgerTransaction.create({ data });

    await expect(db.ledgerTransaction.create({ data })).rejects.toThrow(
      /Unique constraint/,
    );
    expect(await balanceOf(seller)).toBe(100n);
  });

  it("rejects a second event with the same Stripe event ID", async () => {
    const data = {
      id: "evt_1",
      type: "payout.paid",
      source: "simulator" as const,
      apiCreated: new Date(),
      payload: {},
    };
    await db.stripeEvent.create({ data });

    await expect(db.stripeEvent.create({ data })).rejects.toThrow(
      /Unique constraint/,
    );
    expect(await db.stripeEvent.count()).toBe(1);
  });
});
