import { describe, expect, it } from "vitest";
import { formatCents } from "./money";

describe("formatCents", () => {
  it("formats whole and fractional amounts", () => {
    expect(formatCents(0n)).toBe("$0.00");
    expect(formatCents(5n)).toBe("$0.05");
    expect(formatCents(12345n)).toBe("$123.45");
  });

  it("groups thousands", () => {
    expect(formatCents(123456789n)).toBe("$1,234,567.89");
  });

  it("puts the sign before the currency symbol", () => {
    expect(formatCents(-1050n)).toBe("-$10.50");
  });
});
