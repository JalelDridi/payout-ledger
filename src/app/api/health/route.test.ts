import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

describe("GET /api/health", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reports ok with a parseable timestamp", async () => {
    const response = GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(Number.isNaN(Date.parse(body.time))).toBe(false);
  });

  it("reports the deployed commit when Vercel provides one", async () => {
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "abc123");

    const body = await GET().json();

    expect(body.commit).toBe("abc123");
  });

  it("falls back to 'local' outside Vercel", async () => {
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", undefined);

    const body = await GET().json();

    expect(body.commit).toBe("local");
  });
});
