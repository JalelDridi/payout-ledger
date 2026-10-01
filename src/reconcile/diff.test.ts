import { describe, expect, it } from "vitest";
import { findMismatches, type LocalRecord, type SourceRecord } from "./diff";

const NOW = new Date("2026-10-02T12:00:00Z");
const OLD = new Date("2026-10-02T11:00:00Z");
const options = { now: NOW, graceMs: 60_000 };

const sourcePayout = (o: Partial<SourceRecord> = {}): SourceRecord => ({
  id: "po_1",
  kind: "payout",
  amount: 500n,
  status: "paid",
  updatedAt: OLD,
  ...o,
});
const localPayout = (o: Partial<LocalRecord> = {}): LocalRecord => ({
  id: "po_1",
  kind: "payout",
  amount: 500n,
  status: "paid",
  ...o,
});

describe("findMismatches", () => {
  it("finds nothing when both sides agree", () => {
    expect(findMismatches([sourcePayout()], [localPayout()], options)).toEqual(
      [],
    );
  });

  it("flags an object the source has and we do not", () => {
    expect(findMismatches([sourcePayout()], [], options)).toEqual([
      {
        objectId: "po_1",
        objectKind: "payout",
        type: "missing_locally",
        details: { expected: { amount: "500", status: "paid" } },
      },
    ]);
  });

  it("flags a payout whose status is behind the source", () => {
    const found = findMismatches(
      [sourcePayout({ status: "failed" })],
      [localPayout({ status: "in_transit" })],
      options,
    );

    expect(found).toEqual([
      {
        objectId: "po_1",
        objectKind: "payout",
        type: "status_mismatch",
        details: {
          expected: { status: "failed" },
          actual: { status: "in_transit" },
        },
      },
    ]);
  });

  it("flags a different amount", () => {
    const found = findMismatches(
      [sourcePayout({ id: "tr_1", kind: "transfer", status: null })],
      [{ id: "tr_1", kind: "transfer", amount: 450n, status: null }],
      options,
    );

    expect(found).toEqual([
      {
        objectId: "tr_1",
        objectKind: "transfer",
        type: "amount_mismatch",
        details: { expected: { amount: "500" }, actual: { amount: "450" } },
      },
    ]);
  });

  it("reports amount and status separately for the same object", () => {
    const found = findMismatches(
      [sourcePayout()],
      [localPayout({ amount: 400n, status: "pending" })],
      options,
    );

    expect(found.map((m) => m.type)).toEqual([
      "amount_mismatch",
      "status_mismatch",
    ]);
  });

  it("flags an object we recorded that the source does not know", () => {
    expect(findMismatches([], [localPayout()], options)).toEqual([
      {
        objectId: "po_1",
        objectKind: "payout",
        type: "missing_at_source",
        details: { actual: { amount: "500", status: "paid" } },
      },
    ]);
  });

  it("skips source objects changed within the grace period", () => {
    const recent = new Date(NOW.getTime() - 59_000);
    const justSettled = new Date(NOW.getTime() - 60_000);

    expect(
      findMismatches([sourcePayout({ updatedAt: recent })], [], options),
    ).toEqual([]);
    expect(
      findMismatches([sourcePayout({ updatedAt: justSettled })], [], options),
    ).toHaveLength(1);
  });

  it("notes when events for the object were received but not applied", () => {
    const found = findMismatches([sourcePayout()], [], {
      ...options,
      pendingEvents: new Map([["po_1", 2]]),
    });

    expect(found[0].details.pendingEvents).toBe(2);
  });
});
