import type { PayoutStatus } from "@/generated/prisma/enums";
import type { EventEnvelope } from "./schema";

// Builders for Stripe-shaped events, used by tests and the simulator.

let sequence = 0;
const nextId = () => `evt_${(++sequence).toString().padStart(6, "0")}`;

type Common = { id?: string; created?: number };

export function chargeSucceeded(
  o: Common & { charge: string; amount: number },
): EventEnvelope {
  return {
    id: o.id ?? nextId(),
    type: "charge.succeeded",
    created: o.created ?? 1_800_000_000,
    data: { object: { id: o.charge, amount: o.amount, currency: "usd" } },
  };
}

export function transferCreated(
  o: Common & { transfer: string; amount: number; destination: string },
): EventEnvelope {
  return {
    id: o.id ?? nextId(),
    type: "transfer.created",
    created: o.created ?? 1_800_000_000,
    data: {
      object: {
        id: o.transfer,
        amount: o.amount,
        currency: "usd",
        destination: o.destination,
      },
    },
  };
}

const PAYOUT_EVENT_TYPE: Record<PayoutStatus, string> = {
  pending: "payout.created",
  in_transit: "payout.updated",
  paid: "payout.paid",
  failed: "payout.failed",
  canceled: "payout.canceled",
};

export function payoutEvent(
  o: Common & {
    payout: string;
    account: string;
    amount: number;
    status: PayoutStatus;
  },
): EventEnvelope {
  return {
    id: o.id ?? nextId(),
    type: PAYOUT_EVENT_TYPE[o.status],
    created: o.created ?? 1_800_000_000,
    account: o.account,
    data: {
      object: {
        id: o.payout,
        amount: o.amount,
        currency: "usd",
        status: o.status,
        failure_code: o.status === "failed" ? "account_closed" : null,
      },
    },
  };
}
