import { describe, expect, it } from "vitest";
import { buildScenario, SCENARIO_KINDS, type ScenarioKind } from "./scenarios";

const NOW = new Date("2026-10-02T12:00:00Z");
const build = (kind: ScenarioKind, runId = "r1") =>
  buildScenario(kind, { runId, now: NOW, random: () => 0 });

const types = (events: { type: string }[]) => events.map((e) => e.type);
const FLOW = [
  "charge.succeeded",
  "transfer.created",
  "payout.created",
  "payout.updated",
  "payout.paid",
];

describe("buildScenario", () => {
  it("happy: delivers the true sequence once, in order", () => {
    const { truth, deliveries } = build("happy");

    expect(types(truth)).toEqual(FLOW);
    expect(deliveries).toEqual(truth);
  });

  it("pays the seller 90% of the charge", () => {
    const [charge, transfer, payout] = build("happy").truth;

    expect(charge.data.object.amount).toBe(2500);
    expect(transfer.data.object.amount).toBe(2250);
    expect(payout.data.object.amount).toBe(2250);
  });

  it("duplicate: delivers every event twice", () => {
    const { truth, deliveries } = build("duplicate");

    expect(deliveries).toHaveLength(truth.length * 2);
    expect(new Set(deliveries.map((e) => e.id)).size).toBe(truth.length);
  });

  it("out_of_order: delivers the true sequence reversed", () => {
    const { truth, deliveries } = build("out_of_order");

    expect(types(truth)).toEqual(FLOW);
    expect(types(deliveries)).toEqual([...FLOW].reverse());
  });

  it("dropped: the provider knows about the final event, the endpoint never gets it", () => {
    const { truth, deliveries } = build("dropped");

    expect(types(truth).at(-1)).toBe("payout.paid");
    expect(types(deliveries)).toEqual(FLOW.slice(0, 4));
  });

  it("failed: ends with a failed payout", () => {
    expect(types(build("failed").truth).at(-1)).toBe("payout.failed");
  });

  it("stuck: stops in transit, three days ago", () => {
    const { truth } = build("stuck");
    const last = truth.at(-1)!;

    expect(last.data.object.status).toBe("in_transit");
    expect(NOW.getTime() / 1000 - last.created).toBeGreaterThan(71 * 3600);
  });

  it("gives events increasing timestamps in true order", () => {
    for (const kind of SCENARIO_KINDS) {
      const created = build(kind).truth.map((e) => e.created);
      expect(created).toEqual([...created].sort((a, b) => a - b));
    }
  });

  it("uses the run ID so two runs never share object or event IDs", () => {
    const a = build("happy", "aaa").truth;
    const b = build("happy", "bbb").truth;
    const ids = (events: typeof a) =>
      events.flatMap((e) => [e.id, e.data.object.id as string]);

    expect(ids(a).filter((id) => ids(b).includes(id))).toEqual([]);
  });
});
