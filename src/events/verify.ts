import Stripe from "stripe";
import type { EventSource } from "@/generated/prisma/enums";
import { EventEnvelope } from "./schema";

export type WebhookSecrets = { stripe?: string; simulator?: string };

export class InvalidSignatureError extends Error {
  constructor() {
    super("Webhook signature verification failed");
    this.name = "InvalidSignatureError";
  }
}

/**
 * Verifies the Stripe-Signature header against the raw request body and
 * returns the event with the source whose secret matched. Simulated events
 * are signed the same way with a separate secret, so they take exactly the
 * same path as real ones.
 */
export function verifyWebhook(
  rawBody: string,
  signature: string | null,
  secrets: WebhookSecrets,
): { event: EventEnvelope; source: EventSource } {
  if (!signature) throw new InvalidSignatureError();

  const candidates: [EventSource, string | undefined][] = [
    ["stripe", secrets.stripe],
    ["simulator", secrets.simulator],
  ];
  for (const [source, secret] of candidates) {
    if (!secret) continue;
    try {
      const event = Stripe.webhooks.constructEvent(rawBody, signature, secret);
      return { event: EventEnvelope.parse(event), source };
    } catch (error) {
      if (error instanceof Stripe.errors.StripeSignatureVerificationError) {
        continue;
      }
      throw error;
    }
  }
  throw new InvalidSignatureError();
}
