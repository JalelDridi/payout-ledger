import type {
  MismatchType,
  ObjectKind,
  PayoutStatus,
} from "@/generated/prisma/enums";

/** An object as the payment provider reports it. */
export type SourceRecord = {
  id: string;
  kind: ObjectKind;
  amount: bigint;
  status: PayoutStatus | null;
  updatedAt: Date;
};

/** The same object as this system recorded it. */
export type LocalRecord = {
  id: string;
  kind: ObjectKind;
  amount: bigint;
  status: PayoutStatus | null;
};

export type FoundMismatch = {
  objectId: string;
  objectKind: ObjectKind;
  type: MismatchType;
  details: {
    expected?: { amount?: string; status?: string };
    actual?: { amount?: string; status?: string };
    /** Events for this object that were received but not applied yet. */
    pendingEvents?: number;
  };
};

export type DiffOptions = {
  now: Date;
  /**
   * Source objects changed more recently than this are skipped: their
   * webhook may simply not have arrived yet.
   */
  graceMs: number;
  /** Unapplied inbox events per object ID. */
  pendingEvents?: ReadonlyMap<string, number>;
};

/**
 * Compares what the source says against what was recorded locally.
 * Pure: no database access, so every rule is unit-tested directly.
 */
export function findMismatches(
  source: readonly SourceRecord[],
  local: readonly LocalRecord[],
  options: DiffOptions,
): FoundMismatch[] {
  const localById = new Map(local.map((l) => [l.id, l]));
  const sourceIds = new Set(source.map((s) => s.id));
  const pending = (id: string) => {
    const count = options.pendingEvents?.get(id) ?? 0;
    return count > 0 ? { pendingEvents: count } : {};
  };
  const found: FoundMismatch[] = [];

  for (const expected of source) {
    const settled =
      options.now.getTime() - expected.updatedAt.getTime() >= options.graceMs;
    if (!settled) continue;

    const actual = localById.get(expected.id);
    const base = { objectId: expected.id, objectKind: expected.kind };

    if (!actual) {
      found.push({
        ...base,
        type: "missing_locally",
        details: {
          expected: describe(expected),
          ...pending(expected.id),
        },
      });
      continue;
    }
    if (actual.amount !== expected.amount) {
      found.push({
        ...base,
        type: "amount_mismatch",
        details: {
          expected: { amount: expected.amount.toString() },
          actual: { amount: actual.amount.toString() },
        },
      });
    }
    if (expected.status !== actual.status) {
      found.push({
        ...base,
        type: "status_mismatch",
        details: {
          expected: { status: expected.status ?? undefined },
          actual: { status: actual.status ?? undefined },
          ...pending(expected.id),
        },
      });
    }
  }

  // Recorded here but unknown to the source: money this system believes
  // moved that the provider has no record of.
  for (const actual of local) {
    if (sourceIds.has(actual.id)) continue;
    found.push({
      objectId: actual.id,
      objectKind: actual.kind,
      type: "missing_at_source",
      details: { actual: describe(actual) },
    });
  }

  return found;
}

function describe(record: { amount: bigint; status: PayoutStatus | null }) {
  return {
    amount: record.amount.toString(),
    ...(record.status ? { status: record.status } : {}),
  };
}
