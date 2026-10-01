import type { PayoutStatus } from "@/generated/prisma/enums";

// A payout only moves forward (ADR 5). Stripe's lifecycle:
//   pending -> in_transit -> paid
//   pending | in_transit -> failed | canceled
//   paid -> failed            (the bank returned it after it was marked paid)
const NEXT: Record<PayoutStatus, readonly PayoutStatus[]> = {
  pending: ["in_transit", "paid", "failed", "canceled"],
  in_transit: ["paid", "failed", "canceled"],
  paid: ["failed"],
  failed: [],
  canceled: [],
};

export function canTransition(from: PayoutStatus, to: PayoutStatus): boolean {
  return NEXT[from].includes(to);
}

/** Statuses in which the payout amount has left the seller's balance. */
export function holdsFunds(status: PayoutStatus): boolean {
  return status === "pending" || status === "in_transit" || status === "paid";
}
