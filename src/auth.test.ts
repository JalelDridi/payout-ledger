import { afterEach, describe, expect, it, vi } from "vitest";
import { isAuthorized } from "./auth";

const request = (authorization?: string) =>
  new Request("http://localhost/api/jobs/run", {
    headers: authorization ? { authorization } : {},
  });

afterEach(() => vi.unstubAllEnvs());

describe("isAuthorized", () => {
  it("accepts the configured bearer token", () => {
    vi.stubEnv("CRON_SECRET", "s3cret");

    expect(isAuthorized(request("Bearer s3cret"))).toBe(true);
  });

  it("rejects a wrong token, a missing header and a bare token", () => {
    vi.stubEnv("CRON_SECRET", "s3cret");

    expect(isAuthorized(request("Bearer wrong!"))).toBe(false);
    expect(isAuthorized(request())).toBe(false);
    expect(isAuthorized(request("s3cret"))).toBe(false);
  });

  it("rejects everything when no secret is configured", () => {
    vi.stubEnv("CRON_SECRET", undefined);

    expect(isAuthorized(request("Bearer undefined"))).toBe(false);
    expect(isAuthorized(request("Bearer "))).toBe(false);
  });
});
