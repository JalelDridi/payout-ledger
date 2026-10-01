import type { Prisma } from "@/generated/prisma/client";
import type { AccountKind, TransactionKind } from "@/generated/prisma/enums";

type Tx = Prisma.TransactionClient;

export class InsufficientFundsError extends Error {
  constructor(
    readonly accountCode: string,
    readonly balance: bigint,
    readonly amount: bigint,
  ) {
    super(
      `Insufficient funds in ${accountCode}: balance ${balance}, movement ${amount}`,
    );
    this.name = "InsufficientFundsError";
  }
}

export const EXTERNAL = "external";
export const PLATFORM = "platform";
export const sellerCode = (connectedAccountId: string) =>
  `seller:${connectedAccountId}`;

type AccountSpec = {
  code: string;
  kind: AccountKind;
  connectedAccountId?: string;
  allowNegative?: boolean;
};

const SPECS: Record<string, AccountSpec> = {
  [EXTERNAL]: { code: EXTERNAL, kind: "external", allowNegative: true },
  [PLATFORM]: { code: PLATFORM, kind: "platform" },
};

function specFor(code: string): AccountSpec {
  const known = SPECS[code];
  if (known) return known;
  if (code.startsWith("seller:")) {
    return { code, kind: "seller", connectedAccountId: code.slice(7) };
  }
  throw new Error(`Unknown account code: ${code}`);
}

export type Movement = { account: string; amount: bigint };

export type PostInput = {
  kind: TransactionKind;
  stripeObjectId: string;
  sourceEventId?: string;
  idempotencyKey: string;
  movements: Movement[];
};

type LockedAccount = {
  id: string;
  code: string;
  balance: bigint;
  allow_negative: boolean;
};

/**
 * Posts one balanced transaction. Must run inside a database transaction.
 *
 * Returns false without writing if the idempotency key was already used.
 * Throws InsufficientFundsError if a movement would overdraw an account
 * that may not go negative.
 */
export async function postTransaction(
  tx: Tx,
  input: PostInput,
): Promise<boolean> {
  const existing = await tx.ledgerTransaction.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
    select: { id: true },
  });
  if (existing) return false;

  const codes = [...new Set(input.movements.map((m) => m.account))];

  // Create any missing accounts. Concurrent creators both succeed.
  await tx.account.createMany({
    data: codes.map(specFor),
    skipDuplicates: true,
  });

  // Lock in a fixed order (by ID) so two transactions touching the same
  // accounts can never wait on each other in a cycle.
  const accounts = await tx.$queryRaw<LockedAccount[]>`
    SELECT id, code, balance, allow_negative
      FROM accounts
     WHERE code = ANY(${codes})
     ORDER BY id
       FOR UPDATE`;
  const byCode = new Map(accounts.map((a) => [a.code, a]));

  const delta = new Map<string, bigint>();
  for (const m of input.movements) {
    delta.set(m.account, (delta.get(m.account) ?? 0n) + m.amount);
  }
  for (const [code, change] of delta) {
    const account = byCode.get(code);
    if (!account) throw new Error(`Account ${code} was not created`);
    if (!account.allow_negative && account.balance + change < 0n) {
      throw new InsufficientFundsError(code, account.balance, change);
    }
  }

  await tx.ledgerTransaction.create({
    data: {
      kind: input.kind,
      stripeObjectId: input.stripeObjectId,
      sourceEventId: input.sourceEventId,
      idempotencyKey: input.idempotencyKey,
      entries: {
        create: input.movements.map((m) => ({
          accountId: byCode.get(m.account)!.id,
          amount: m.amount,
        })),
      },
    },
  });
  return true;
}
