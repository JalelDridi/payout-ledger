import {
  chargeSucceeded,
  payoutEvent,
  transferCreated,
} from "@/events/fixtures";
import type { EventEnvelope } from "@/events/schema";

export const SCENARIOS = {
  happy: {
    title: "Normal payout",
    description:
      "A charge, a transfer to the seller and a payout that is paid. Every webhook arrives once, in order.",
    expect: "The payout shows as paid and nothing is flagged.",
  },
  duplicate: {
    title: "Duplicate delivery",
    description: "The same flow, but every webhook is delivered twice.",
    expect:
      "Each event is stored and applied once; balances match a normal payout.",
  },
  out_of_order: {
    title: "Out-of-order delivery",
    description:
      "The webhooks arrive in reverse: the payout is reported paid before the charge that funded it.",
    expect:
      "Events that arrive too early wait in the inbox. Run the checks to retry them; the end state matches a normal payout.",
  },
  dropped: {
    title: "Dropped webhook",
    description:
      "The provider marks the payout paid, but that final webhook never arrives.",
    expect:
      "Run the checks: reconciliation flags a status mismatch (source says paid, ledger says in transit).",
  },
  failed: {
    title: "Failed payout",
    description: "The bank rejects the payout after it was sent.",
    expect:
      "The amount returns to the seller's balance. Run the checks to raise an alert.",
  },
  stuck: {
    title: "Stuck payout",
    description:
      "A payout went in transit three days ago and nothing has been heard since.",
    expect: "Run the checks: an alert is raised for a payout stuck in transit.",
  },
} as const;

export type ScenarioKind = keyof typeof SCENARIOS;
export const SCENARIO_KINDS = Object.keys(SCENARIOS) as ScenarioKind[];

export const DEMO_SELLERS = [
  "acct_sim_001",
  "acct_sim_002",
  "acct_sim_003",
  "acct_sim_004",
];
const AMOUNTS = [2500, 4800, 7350, 12000];

export type Scenario = {
  /** What really happened at the provider, in true order. */
  truth: EventEnvelope[];
  /** What reaches the webhook endpoint, in arrival order. */
  deliveries: EventEnvelope[];
};

export type ScenarioContext = {
  /** Unique suffix for this run's object and event IDs. */
  runId: string;
  now: Date;
  /** Returns a number in [0, 1). */
  random: () => number;
};

const SECONDS = { fiveMinutes: 300, threeDays: 3 * 24 * 3600 + 600 };

export function buildScenario(
  kind: ScenarioKind,
  ctx: ScenarioContext,
): Scenario {
  const pick = <T>(items: T[]) =>
    items[Math.floor(ctx.random() * items.length)];
  const seller = pick(DEMO_SELLERS);
  const amount = pick(AMOUNTS);
  const sellerShare = Math.round(amount * 0.9);

  const nowSec = Math.floor(ctx.now.getTime() / 1000);
  const start =
    nowSec - (kind === "stuck" ? SECONDS.threeDays : SECONDS.fiveMinutes);
  let step = 0;
  const next = (name: string) => ({
    id: `evt_sim_${ctx.runId}_${name}`,
    created: start + step++ * 10,
  });

  const payout = {
    payout: `po_sim_${ctx.runId}`,
    account: seller,
    amount: sellerShare,
  };
  const charge = chargeSucceeded({
    ...next("charge"),
    charge: `ch_sim_${ctx.runId}`,
    amount,
  });
  const transfer = transferCreated({
    ...next("transfer"),
    transfer: `tr_sim_${ctx.runId}`,
    amount: sellerShare,
    destination: seller,
  });
  const pending = payoutEvent({
    ...next("pending"),
    ...payout,
    status: "pending",
  });
  const inTransit = payoutEvent({
    ...next("in_transit"),
    ...payout,
    status: "in_transit",
  });
  const funded = [charge, transfer, pending, inTransit];

  switch (kind) {
    case "stuck":
      return { truth: funded, deliveries: funded };
    case "failed": {
      const failed = payoutEvent({
        ...next("failed"),
        ...payout,
        status: "failed",
      });
      return { truth: [...funded, failed], deliveries: [...funded, failed] };
    }
    default: {
      const paid = payoutEvent({ ...next("paid"), ...payout, status: "paid" });
      const truth = [...funded, paid];
      const deliveries = {
        happy: truth,
        duplicate: truth.flatMap((event) => [event, event]),
        out_of_order: [...truth].reverse(),
        dropped: funded,
      }[kind];
      return { truth, deliveries };
    }
  }
}
