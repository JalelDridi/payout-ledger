import type { Prisma } from "@/generated/prisma/client";
import type { EventOutcome, PayoutStatus } from "@/generated/prisma/enums";
import { EXTERNAL, PLATFORM, postTransaction, sellerCode } from "@/ledger/post";
import { canTransition, holdsFunds } from "@/payouts/transitions";
import {
  ChargeObject,
  type EventEnvelope,
  PayoutObject,
  TransferObject,
} from "./schema";

type Tx = Prisma.TransactionClient;

const fromUnix = (seconds: number) => new Date(seconds * 1000);

/**
 * Applies one event inside the caller's transaction. Safe to call for the
 * same business object from several events: ledger writes are keyed by the
 * object, and payout status only moves forward.
 */
export async function applyEvent(
  tx: Tx,
  event: EventEnvelope,
): Promise<EventOutcome> {
  switch (event.type) {
    case "charge.succeeded":
      return applyCharge(tx, event);
    case "transfer.created":
      return applyTransfer(tx, event);
    case "payout.created":
    case "payout.updated":
    case "payout.paid":
    case "payout.failed":
    case "payout.canceled":
      return applyPayout(tx, event);
    default:
      return "ignored";
  }
}

// Customer payment lands in the platform's balance.
async function applyCharge(tx: Tx, event: EventEnvelope) {
  if (event.account) return "ignored"; // a connected account's own charge
  const charge = ChargeObject.parse(event.data.object);
  const posted = await postTransaction(tx, {
    kind: "charge",
    stripeObjectId: charge.id,
    sourceEventId: event.id,
    idempotencyKey: `charge:${charge.id}`,
    movements: [
      { account: EXTERNAL, amount: BigInt(-charge.amount) },
      { account: PLATFORM, amount: BigInt(charge.amount) },
    ],
  });
  return posted ? "applied" : "stale";
}

// Platform moves the seller's share to their connected account.
async function applyTransfer(tx: Tx, event: EventEnvelope) {
  const transfer = TransferObject.parse(event.data.object);
  const posted = await postTransaction(tx, {
    kind: "transfer",
    stripeObjectId: transfer.id,
    sourceEventId: event.id,
    idempotencyKey: `transfer:${transfer.id}`,
    movements: [
      { account: PLATFORM, amount: BigInt(-transfer.amount) },
      {
        account: sellerCode(transfer.destination),
        amount: BigInt(transfer.amount),
      },
    ],
  });
  return posted ? "applied" : "stale";
}

async function applyPayout(tx: Tx, event: EventEnvelope) {
  if (!event.account) return "ignored"; // the platform's own payout
  const payout = PayoutObject.parse(event.data.object);
  const amount = BigInt(payout.amount);
  const seller = sellerCode(event.account);
  const eventTime = fromUnix(event.created);

  const debit = () =>
    postTransaction(tx, {
      kind: "payout",
      stripeObjectId: payout.id,
      sourceEventId: event.id,
      idempotencyKey: `payout:${payout.id}:debit`,
      movements: [
        { account: seller, amount: -amount },
        { account: EXTERNAL, amount },
      ],
    });

  // First event seen for this payout, whichever it is: create the payout in
  // the state the event describes. A concurrent creator makes this a no-op.
  const created = await tx.payout.createMany({
    data: [
      {
        id: payout.id,
        connectedAccountId: event.account,
        amount,
        currency: payout.currency,
        status: payout.status,
        failureCode: payout.failure_code ?? null,
        arrivalDate: payout.arrival_date ? fromUnix(payout.arrival_date) : null,
        statusChangedAt: eventTime,
      },
    ],
    skipDuplicates: true,
  });
  if (created.count === 1) {
    if (holdsFunds(payout.status)) await debit();
    return "applied";
  }

  const [current] = await tx.$queryRaw<{ status: PayoutStatus }[]>`
    SELECT status FROM payouts WHERE id = ${payout.id} FOR UPDATE`;
  if (!canTransition(current.status, payout.status)) return "stale";

  await tx.payout.update({
    where: { id: payout.id },
    data: {
      status: payout.status,
      failureCode: payout.failure_code ?? null,
      arrivalDate: payout.arrival_date ? fromUnix(payout.arrival_date) : null,
      statusChangedAt: eventTime,
    },
  });

  // The money comes back to the seller when a payout fails or is canceled.
  if (holdsFunds(current.status) && !holdsFunds(payout.status)) {
    await postTransaction(tx, {
      kind: "payout_reversal",
      stripeObjectId: payout.id,
      sourceEventId: event.id,
      idempotencyKey: `payout:${payout.id}:reversal`,
      movements: [
        { account: EXTERNAL, amount: -amount },
        { account: seller, amount },
      ],
    });
  }
  return "applied";
}
