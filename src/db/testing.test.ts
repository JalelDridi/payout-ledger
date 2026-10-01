import { describe, expect, it } from "vitest";
import { assertLocalDatabase } from "./testing";

describe("assertLocalDatabase", () => {
  it("accepts localhost and 127.0.0.1", () => {
    expect(() =>
      assertLocalDatabase("postgresql://u:p@localhost:5433/db"),
    ).not.toThrow();
    expect(() =>
      assertLocalDatabase("postgresql://u:p@127.0.0.1:5432/db"),
    ).not.toThrow();
  });

  it("refuses a remote host", () => {
    expect(() =>
      assertLocalDatabase("postgresql://u:p@ep-example.aws.neon.tech/db"),
    ).toThrow(/non-local host/);
  });
});
