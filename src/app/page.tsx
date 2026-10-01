import { loadDashboard } from "@/dashboard/data";
import { getDb } from "@/db/client";
import { MAX_ATTEMPTS } from "@/events/inbox";
import type {
  AlertType,
  MismatchType,
  PayoutStatus,
} from "@/generated/prisma/enums";
import { formatCents } from "@/money";
import { SimulatorPanel } from "./simulator-panel";
import {
  Empty,
  Id,
  Section,
  Status,
  Table,
  Tile,
  timeAgo,
  type Tone,
} from "./ui";

export const dynamic = "force-dynamic";
// Simulator and check actions run several database round trips.
export const maxDuration = 60;

const REPO = "https://github.com/JalelDridi/payout-ledger";

const PAYOUT: Record<PayoutStatus, { tone: Tone; label: string }> = {
  pending: { tone: "neutral", label: "Pending" },
  in_transit: { tone: "neutral", label: "In transit" },
  paid: { tone: "good", label: "Paid" },
  failed: { tone: "critical", label: "Failed" },
  canceled: { tone: "neutral", label: "Canceled" },
};

const ALERT_LABEL: Record<AlertType, string> = {
  payout_failed: "Payout failed",
  payout_stuck: "Payout stuck",
  event_unprocessable: "Event could not be applied",
};

const MISMATCH_LABEL: Record<MismatchType, string> = {
  missing_locally: "Missing from the ledger",
  missing_at_source: "Unknown to the source",
  amount_mismatch: "Amount differs",
  status_mismatch: "Status differs",
};

type MismatchDetails = {
  expected?: { amount?: string; status?: string };
  actual?: { amount?: string; status?: string };
  pendingEvents?: number;
};

function describeMismatch(details: MismatchDetails): string {
  const side = (s?: { amount?: string; status?: string }) =>
    s
      ? [s.status?.replace("_", " "), s.amount && formatCents(BigInt(s.amount))]
          .filter(Boolean)
          .join(", ")
      : "nothing";
  const waiting = details.pendingEvents
    ? ` ${details.pendingEvents} received event${details.pendingEvents === 1 ? " is" : "s are"} waiting to be applied.`
    : "";
  return `Source: ${side(details.expected)}. Ledger: ${side(details.actual)}.${waiting}`;
}

export default async function Home() {
  const data = await loadDashboard(getDb());
  const now = new Date();
  const needsAttention = data.alerts.length + data.openMismatches.length;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-12 px-4 py-10 sm:px-6">
      <header className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">Payout Ledger</h1>
        <p className="max-w-3xl text-muted">
          A payout monitor for a marketplace. It ingests Stripe-style webhooks,
          records every money movement in a double-entry ledger, reconciles
          against the payment provider, and alerts on failed or stuck payouts.
          Use the simulator below to send it duplicate, out-of-order and missing
          webhooks and watch what it does.
        </p>
        <p className="text-sm">
          <a className="underline" href={REPO}>
            Source code
          </a>
          <span className="text-muted"> · </span>
          <a className="underline" href={`${REPO}/tree/main/docs/decisions`}>
            Design decisions
          </a>
          <span className="text-muted"> · </span>
          <a className="underline" href={`${REPO}/blob/main/docs/schema.md`}>
            Schema and invariants
          </a>
        </p>
      </header>

      <section
        aria-label="Summary"
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr_1fr]"
      >
        <Tile
          hero
          label="Needs attention"
          value={needsAttention}
          note={
            needsAttention === 0 ? (
              <Status tone="good">No open alerts or mismatches</Status>
            ) : (
              `${data.alerts.length} open ${data.alerts.length === 1 ? "alert" : "alerts"}, ${data.openMismatches.length} open ${data.openMismatches.length === 1 ? "mismatch" : "mismatches"}`
            )
          }
        />
        <Tile
          label="Webhook events"
          value={data.eventCount.toLocaleString("en-US")}
          note={
            data.waitingEvents === 0 ? (
              "All applied"
            ) : (
              <Status tone="warning">
                {data.waitingEvents} waiting to be applied
              </Status>
            )
          }
        />
        <Tile
          label="Payouts"
          value={data.payoutCount.toLocaleString("en-US")}
          note={`${data.payoutsPaid} paid, ${data.payoutsInFlight} in flight, ${data.payoutsFailed} failed`}
        />
        <Tile
          label="Owed to sellers"
          value={formatCents(data.sellerBalance)}
          note={
            data.ledgerSum === 0n ? (
              <Status tone="good">Ledger sums to zero</Status>
            ) : (
              <Status tone="critical">
                Ledger is off by {formatCents(data.ledgerSum)}
              </Status>
            )
          }
        />
      </section>

      <Section
        title="Simulator"
        description="Each button sends a set of signed webhooks through the same endpoint and verification as real Stripe events. The simulated provider keeps its own record of what really happened, which is what reconciliation compares against."
      >
        <SimulatorPanel />
        <p className="text-sm text-muted">
          {data.lastRun
            ? `Checks last ran ${timeAgo(data.lastRun.finishedAt, now)}: ${data.lastRun.objectsChecked} objects compared.`
            : "The checks have not run yet."}
        </p>
      </Section>

      <div className="grid gap-12 lg:grid-cols-2 lg:gap-6">
        <Section
          title="Alerts"
          description="Raised while a condition holds, resolved when it stops."
        >
          {data.alerts.length === 0 ? (
            <Empty>No open alerts.</Empty>
          ) : (
            <ul className="flex flex-col gap-2">
              {data.alerts.map((alert) => (
                <li
                  key={alert.id}
                  className="rounded-lg border border-line p-4 text-sm"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">
                      <Status
                        tone={
                          alert.type === "payout_stuck" ? "warning" : "critical"
                        }
                      >
                        {ALERT_LABEL[alert.type]}
                      </Status>
                    </span>
                    <span className="text-muted">
                      {timeAgo(alert.raisedAt, now)}
                    </span>
                  </div>
                  <p className="mt-2 text-muted">{alert.message}</p>
                  <p className="mt-1">
                    <Id>{alert.subjectId}</Id>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section
          title="Reconciliation"
          description="Differences between the provider's record and the ledger."
        >
          {data.openMismatches.length + data.resolvedMismatches.length === 0 ? (
            <Empty>No mismatches found.</Empty>
          ) : (
            <ul className="flex flex-col gap-2">
              {[...data.openMismatches, ...data.resolvedMismatches].map((m) => (
                <li
                  key={m.id}
                  className="rounded-lg border border-line p-4 text-sm"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">
                      <Status tone={m.resolvedAt ? "good" : "warning"}>
                        {MISMATCH_LABEL[m.type]}
                        {m.resolvedAt ? " (resolved)" : ""}
                      </Status>
                    </span>
                    <span className="text-muted">
                      {timeAgo(m.resolvedAt ?? m.detectedAt, now)}
                    </span>
                  </div>
                  <p className="mt-2 text-muted">
                    {describeMismatch(m.details as MismatchDetails)}
                  </p>
                  <p className="mt-1">
                    <Id>{m.objectId}</Id>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <Section title="Recent payouts">
        {data.payouts.length === 0 ? (
          <Empty>No payouts yet. Send a scenario from the simulator.</Empty>
        ) : (
          <Table head={["Payout", "Seller", "Amount", "Status", "Changed"]}>
            {data.payouts.map((p) => (
              <tr key={p.id}>
                <td className="px-4 py-2">
                  <Id>{p.id}</Id>
                </td>
                <td className="px-4 py-2">
                  <Id>{p.connectedAccountId}</Id>
                </td>
                <td className="px-4 py-2 tabular-nums">
                  {formatCents(p.amount)}
                </td>
                <td className="px-4 py-2">
                  <Status tone={PAYOUT[p.status].tone}>
                    {PAYOUT[p.status].label}
                    {p.failureCode ? ` (${p.failureCode})` : ""}
                  </Status>
                </td>
                <td className="px-4 py-2 whitespace-nowrap text-muted">
                  {timeAgo(p.statusChangedAt, now)}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      <Section
        title="Webhook inbox"
        description="Every event is stored once, then applied exactly once. Events that arrive before the funds they depend on wait here and are retried."
      >
        {data.events.length === 0 ? (
          <Empty>No events received yet.</Empty>
        ) : (
          <Table head={["Event", "Type", "Result", "Received"]}>
            {data.events.map((e) => (
              <tr key={e.id}>
                <td className="px-4 py-2">
                  <Id>{e.id}</Id>
                </td>
                <td className="px-4 py-2">
                  <Id>{e.type}</Id>
                </td>
                <td className="px-4 py-2">
                  {e.outcome === "applied" && (
                    <Status tone="good">Applied</Status>
                  )}
                  {e.outcome === "stale" && (
                    <Status tone="neutral">Skipped: already up to date</Status>
                  )}
                  {e.outcome === "ignored" && (
                    <Status tone="neutral">Ignored: not a tracked type</Status>
                  )}
                  {!e.processedAt &&
                    (e.attempts >= MAX_ATTEMPTS ? (
                      <Status tone="critical">
                        Gave up after {e.attempts} attempts
                      </Status>
                    ) : (
                      <span title={e.lastError ?? undefined}>
                        <Status tone="warning">
                          Waiting to retry ({e.attempts} failed)
                        </Status>
                      </span>
                    ))}
                </td>
                <td className="px-4 py-2 whitespace-nowrap text-muted">
                  {timeAgo(e.receivedAt, now)}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      <footer className="border-t border-line pt-6 text-sm text-muted">
        This is a public demo with simulated data. It resets every night. Stripe
        fees, refunds and multiple currencies are not modelled.
      </footer>
    </main>
  );
}
