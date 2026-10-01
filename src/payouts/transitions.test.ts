import { describe, expect, it } from "vitest";
import type { PayoutStatus } from "@/generated/prisma/enums";
import { canTransition, holdsFunds } from "./transitions";

const ALL: PayoutStatus[] = [
  "pending",
  "in_transit",
  "paid",
  "failed",
  "canceled",
];

describe("canTransition", () => {
  it("allows the normal lifecycle", () => {
    expect(canTransition("pending", "in_transit")).toBe(true);
    expect(canTransition("in_transit", "paid")).toBe(true);
    expect(canTransition("pending", "paid")).toBe(true);
  });

  it("never moves backwards", () => {
    expect(canTransition("in_transit", "pending")).toBe(false);
    expect(canTransition("paid", "in_transit")).toBe(false);
    expect(canTransition("paid", "pending")).toBe(false);
  });

  it("allows a paid payout to fail when the bank returns it", () => {
    expect(canTransition("paid", "failed")).toBe(true);
    expect(canTransition("paid", "canceled")).toBe(false);
  });

  it("treats failed and canceled as final", () => {
    for (const to of ALL) {
      expect(canTransition("failed", to)).toBe(false);
      expect(canTransition("canceled", to)).toBe(false);
    }
  });

  it("never transitions a status to itself", () => {
    for (const s of ALL) expect(canTransition(s, s)).toBe(false);
  });
});

describe("holdsFunds", () => {
  it("is true while the money is out of the seller's balance", () => {
    expect(ALL.filter(holdsFunds)).toEqual(["pending", "in_transit", "paid"]);
  });
});
