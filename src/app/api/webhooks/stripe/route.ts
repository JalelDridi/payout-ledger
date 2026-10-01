import { ZodError } from "zod";
import { getDb } from "@/db/client";
import { processEvent, storeEvent } from "@/events/inbox";
import { InvalidSignatureError, verifyWebhook } from "@/events/verify";

export async function POST(request: Request) {
  const secrets = {
    stripe: process.env.STRIPE_WEBHOOK_SECRET,
    simulator: process.env.SIMULATOR_WEBHOOK_SECRET,
  };
  if (!secrets.stripe && !secrets.simulator) {
    return Response.json(
      { error: "No webhook secret is configured" },
      { status: 500 },
    );
  }

  // The signature covers the exact bytes sent, so read the body as text.
  const rawBody = await request.text();

  let verified;
  try {
    verified = verifyWebhook(
      rawBody,
      request.headers.get("stripe-signature"),
      secrets,
    );
  } catch (error) {
    if (error instanceof InvalidSignatureError) {
      return Response.json({ error: "Invalid signature" }, { status: 400 });
    }
    if (error instanceof ZodError) {
      return Response.json({ error: "Malformed event" }, { status: 400 });
    }
    throw error;
  }

  const db = getDb();
  const stored = await storeEvent(db, verified.event, verified.source);
  if (!stored) {
    return Response.json({ received: true, duplicate: true });
  }

  // The event is safely stored, so the sender gets a 200 whatever happens
  // next. If processing fails, the scheduled sweep retries it.
  const result = await processEvent(db, verified.event.id);
  return Response.json({ received: true, duplicate: false, result });
}
