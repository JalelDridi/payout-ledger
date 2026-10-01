import Stripe from "stripe";
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
import { chargeSucceeded } from "@/events/fixtures";
import { POST } from "./route";

const db = createTestClient();
const SECRET = "whsec_test_simulator";

function request(body: string, signature?: string) {
  return new Request("http://localhost/api/webhooks/stripe", {
    method: "POST",
    body,
    headers: signature ? { "stripe-signature": signature } : {},
  });
}

const sign = (payload: string, secret = SECRET) =>
  Stripe.webhooks.generateTestHeaderString({ payload, secret });

beforeEach(async () => {
  vi.stubEnv("DATABASE_URL", TEST_DATABASE_URL);
  vi.stubEnv("SIMULATOR_WEBHOOK_SECRET", SECRET);
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", undefined);
  await resetDatabase(db);
});
afterEach(() => vi.unstubAllEnvs());
afterAll(() => db.$disconnect());

describe("POST /api/webhooks/stripe", () => {
  it("stores and applies a signed event", async () => {
    const body = JSON.stringify(
      chargeSucceeded({ charge: "ch_1", amount: 1000 }),
    );

    const response = await POST(request(body, sign(body)));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      received: true,
      duplicate: false,
      result: "applied",
    });
    const stored = await db.stripeEvent.findFirstOrThrow();
    expect(stored.source).toBe("simulator");
    expect(stored.processedAt).not.toBeNull();
  });

  it("acknowledges a redelivery without applying it again", async () => {
    const body = JSON.stringify(
      chargeSucceeded({ charge: "ch_1", amount: 1000 }),
    );
    await POST(request(body, sign(body)));

    const response = await POST(request(body, sign(body)));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true, duplicate: true });
    expect(await db.ledgerTransaction.count()).toBe(1);
  });

  it("rejects a bad signature with 400 and stores nothing", async () => {
    const body = JSON.stringify(
      chargeSucceeded({ charge: "ch_1", amount: 1000 }),
    );

    const response = await POST(request(body, sign(body, "whsec_wrong")));

    expect(response.status).toBe(400);
    expect(await db.stripeEvent.count()).toBe(0);
  });

  it("rejects a request with no signature", async () => {
    const response = await POST(request("{}"));

    expect(response.status).toBe(400);
  });

  it("answers 200 when a stored event cannot be applied yet", async () => {
    // A transfer before the charge that funds the platform balance.
    const body = JSON.stringify({
      id: "evt_early",
      type: "transfer.created",
      created: 1_800_000_000,
      data: {
        object: {
          id: "tr_1",
          amount: 500,
          currency: "usd",
          destination: "acct_1",
        },
      },
    });

    const response = await POST(request(body, sign(body)));

    expect(response.status).toBe(200);
    expect((await response.json()).result).toBe("failed");
    expect(await db.stripeEvent.count({ where: { processedAt: null } })).toBe(
      1,
    );
  });

  it("returns 500 when no webhook secret is configured", async () => {
    vi.stubEnv("SIMULATOR_WEBHOOK_SECRET", undefined);

    const response = await POST(request("{}", "t=1,v1=x"));

    expect(response.status).toBe(500);
  });
});
