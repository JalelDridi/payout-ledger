import { z } from "zod";

// Only the fields this app reads, following Stripe's public API reference.
// Amounts are integer minor units.

export const EventEnvelope = z.object({
  id: z.string().startsWith("evt_"),
  type: z.string().min(1),
  created: z.number().int().nonnegative(),
  // Set on Connect events: the connected account the event belongs to.
  account: z.string().nullish(),
  data: z.object({ object: z.record(z.string(), z.unknown()) }),
});
export type EventEnvelope = z.infer<typeof EventEnvelope>;

export const ChargeObject = z.object({
  id: z.string(),
  amount: z.number().int().positive(),
  currency: z.string(),
});

export const TransferObject = z.object({
  id: z.string(),
  amount: z.number().int().positive(),
  currency: z.string(),
  destination: z.string(),
});

export const PayoutObject = z.object({
  id: z.string(),
  amount: z.number().int().positive(),
  currency: z.string(),
  status: z.enum(["pending", "in_transit", "paid", "failed", "canceled"]),
  arrival_date: z.number().int().nullish(),
  failure_code: z.string().nullish(),
});
