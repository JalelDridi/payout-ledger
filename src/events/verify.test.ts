import Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { chargeSucceeded } from "./fixtures";
import { InvalidSignatureError, verifyWebhook } from "./verify";

const secrets = { stripe: "whsec_stripe", simulator: "whsec_simulator" };
const body = JSON.stringify(chargeSucceeded({ charge: "ch_1", amount: 1000 }));

const sign = (payload: string, secret: string, timestamp?: number) =>
  Stripe.webhooks.generateTestHeaderString({ payload, secret, timestamp });

describe("verifyWebhook", () => {
  it("accepts a body signed with the Stripe secret", () => {
    const result = verifyWebhook(body, sign(body, secrets.stripe), secrets);

    expect(result.source).toBe("stripe");
    expect(result.event.type).toBe("charge.succeeded");
  });

  it("accepts a body signed with the simulator secret and labels it", () => {
    const result = verifyWebhook(body, sign(body, secrets.simulator), secrets);

    expect(result.source).toBe("simulator");
  });

  it("rejects a body that was changed after signing", () => {
    const signature = sign(body, secrets.stripe);
    const tampered = body.replace("1000", "9999");

    expect(() => verifyWebhook(tampered, signature, secrets)).toThrow(
      InvalidSignatureError,
    );
  });

  it("rejects a signature made with an unknown secret", () => {
    expect(() =>
      verifyWebhook(body, sign(body, "whsec_other"), secrets),
    ).toThrow(InvalidSignatureError);
  });

  it("rejects a missing signature header", () => {
    expect(() => verifyWebhook(body, null, secrets)).toThrow(
      InvalidSignatureError,
    );
  });

  it("rejects a signature older than the tolerance window (replay)", () => {
    const tenMinutesAgo = Math.floor(Date.now() / 1000) - 600;

    expect(() =>
      verifyWebhook(body, sign(body, secrets.stripe, tenMinutesAgo), secrets),
    ).toThrow(InvalidSignatureError);
  });

  it("does not fall back to a secret that is not configured", () => {
    expect(() =>
      verifyWebhook(body, sign(body, secrets.simulator), {
        stripe: secrets.stripe,
      }),
    ).toThrow(InvalidSignatureError);
  });

  it("rejects a correctly signed body that is not an event", () => {
    const notAnEvent = JSON.stringify({ hello: "world" });

    expect(() =>
      verifyWebhook(notAnEvent, sign(notAnEvent, secrets.stripe), secrets),
    ).toThrow(ZodError);
  });
});
