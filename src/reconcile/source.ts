import type { PrismaClient } from "@/generated/prisma/client";
import type { ObjectKind } from "@/generated/prisma/enums";
import {
  ChargeObject,
  type EventEnvelope,
  PayoutObject,
  TransferObject,
} from "@/events/schema";

const KIND_BY_PREFIX: Record<string, ObjectKind> = {
  charge: "charge",
  transfer: "transfer",
  payout: "payout",
};

/**
 * Records, on the source side, the object an event describes. The simulator
 * calls this for every event it generates, including ones it then "drops",
 * so the source keeps the truth even when the webhook never arrives.
 */
export async function recordAtSource(
  db: PrismaClient,
  event: EventEnvelope,
  at: Date,
): Promise<void> {
  const kind = KIND_BY_PREFIX[event.type.split(".")[0]];
  if (!kind) return;

  const object =
    kind === "charge"
      ? { ...ChargeObject.parse(event.data.object), status: null }
      : kind === "transfer"
        ? { ...TransferObject.parse(event.data.object), status: null }
        : PayoutObject.parse(event.data.object);

  const data = {
    kind,
    connectedAccountId: event.account ?? null,
    amount: BigInt(object.amount),
    status: object.status,
    updatedAt: at,
  };
  await db.sourceObject.upsert({
    where: { id: object.id },
    create: { id: object.id, ...data },
    update: data,
  });
}
