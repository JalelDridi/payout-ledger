import Stripe from "stripe";
import type { PrismaClient } from "@/generated/prisma/client";
import { POST as webhook } from "@/app/api/webhooks/stripe/route";
import type { EventEnvelope } from "@/events/schema";
import { recordAtSource } from "@/reconcile/source";
import {
  buildScenario,
  type ScenarioContext,
  type ScenarioKind,
} from "./scenarios";

export class SimulatorLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SimulatorLimitError";
  }
}

/** Simulated events accepted per minute, across all visitors. */
export const MAX_EVENTS_PER_MINUTE = 120;
/** Once the inbox holds this many events, wait for the nightly reset. */
export const MAX_EVENTS_STORED = 3000;

/**
 * The demo is public and unauthenticated, so the budget is global rather
 * than per visitor: it protects the free-tier database, not fairness.
 */
export async function assertWithinBudget(
  db: PrismaClient,
  now = new Date(),
): Promise<void> {
  const [recent, total] = await Promise.all([
    db.stripeEvent.count({
      where: {
        source: "simulator",
        receivedAt: { gt: new Date(now.getTime() - 60_000) },
      },
    }),
    db.stripeEvent.count(),
  ]);
  if (recent >= MAX_EVENTS_PER_MINUTE) {
    throw new SimulatorLimitError(
      "The simulator is busy. Try again in a minute.",
    );
  }
  if (total >= MAX_EVENTS_STORED) {
    throw new SimulatorLimitError(
      "The demo database is full. It resets every night.",
    );
  }
}

/**
 * Sends an event to the webhook handler exactly as the provider would: a
 * JSON body with a Stripe-Signature header. The handler is called in
 * process, so simulated events go through the same verification, storage
 * and processing code as real ones.
 */
async function deliver(event: EventEnvelope): Promise<void> {
  const secret = process.env.SIMULATOR_WEBHOOK_SECRET;
  if (!secret) throw new Error("SIMULATOR_WEBHOOK_SECRET is not set");

  const body = JSON.stringify(event);
  const response = await webhook(
    new Request("http://simulator.local/api/webhooks/stripe", {
      method: "POST",
      body,
      headers: {
        "stripe-signature": Stripe.webhooks.generateTestHeaderString({
          payload: body,
          secret,
        }),
      },
    }),
  );
  if (!response.ok) {
    throw new Error(`Webhook rejected simulated event: ${response.status}`);
  }
}

export async function runScenario(
  db: PrismaClient,
  kind: ScenarioKind,
  ctx: ScenarioContext,
): Promise<{ sent: number }> {
  const { truth, deliveries } = buildScenario(kind, ctx);

  // The provider's side first: it knows about every event, delivered or not.
  for (const event of truth) {
    await recordAtSource(db, event, new Date(event.created * 1000));
  }
  for (const event of deliveries) await deliver(event);

  return { sent: deliveries.length };
}
