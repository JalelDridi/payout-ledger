import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  createTestClient,
  resetDatabase,
  TEST_DATABASE_URL,
} from "@/db/testing";
import { GET as reset } from "../../cron/reset/route";
import { POST as runJobsRoute } from "./route";

const db = createTestClient();

const request = (path: string, method: string, token?: string) =>
  new Request(`http://localhost${path}`, {
    method,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });

beforeEach(async () => {
  vi.stubEnv("DATABASE_URL", TEST_DATABASE_URL);
  vi.stubEnv("CRON_SECRET", "test-cron-secret");
  vi.stubEnv("SIMULATOR_WEBHOOK_SECRET", "whsec_test_simulator");
  await resetDatabase(db);
});
afterEach(() => vi.unstubAllEnvs());
afterAll(() => db.$disconnect());

describe("POST /api/jobs/run", () => {
  it("rejects a request without the token", async () => {
    const response = await runJobsRoute(request("/api/jobs/run", "POST"));

    expect(response.status).toBe(401);
    expect(await db.reconciliationRun.count()).toBe(0);
  });

  it("runs the checks with the token", async () => {
    const response = await runJobsRoute(
      request("/api/jobs/run", "POST", "test-cron-secret"),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      reconciliation: { objectsChecked: 0 },
      alerts: { open: 0 },
    });
    expect(await db.reconciliationRun.count()).toBe(1);
  });
});

describe("GET /api/cron/reset", () => {
  it("rejects a request without the token and leaves data alone", async () => {
    await db.account.create({ data: { code: "platform", kind: "platform" } });

    const response = await reset(request("/api/cron/reset", "GET", "wrong"));

    expect(response.status).toBe(401);
    expect(await db.account.count()).toBe(1);
  });

  it("resets and seeds the demo with the token", async () => {
    const response = await reset(
      request("/api/cron/reset", "GET", "test-cron-secret"),
    );

    expect(response.status).toBe(200);
    expect(await db.payout.count()).toBe(4);
  });
});
