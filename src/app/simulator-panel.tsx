"use client";

import { useActionState } from "react";
import { SCENARIO_KINDS, SCENARIOS } from "@/simulator/scenarios";
import { act } from "./actions";

export function SimulatorPanel() {
  const [result, action, busy] = useActionState(act, null);

  return (
    <div className="flex flex-col gap-4">
      <form
        action={action}
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
      >
        {SCENARIO_KINDS.map((kind) => (
          <div
            key={kind}
            className="flex flex-col gap-3 rounded-lg border border-line p-4"
          >
            <div className="flex-1">
              <h3 className="font-medium">{SCENARIOS[kind].title}</h3>
              <p className="mt-1 text-sm text-muted">
                {SCENARIOS[kind].description}
              </p>
            </div>
            <button
              type="submit"
              name="kind"
              value={kind}
              disabled={busy}
              aria-label={`Send webhooks: ${SCENARIOS[kind].title}`}
              className="self-start rounded-md border border-line px-3 py-1.5 text-sm font-medium hover:bg-subtle disabled:opacity-50"
            >
              Send webhooks
            </button>
          </div>
        ))}
      </form>

      <form
        action={action}
        className="flex flex-wrap items-center gap-x-4 gap-y-2"
      >
        <button
          type="submit"
          name="intent"
          value="check"
          disabled={busy}
          className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50"
        >
          Run checks now
        </button>
        <p className="text-sm text-muted">
          Retries waiting events, reconciles against the source, raises alerts.
          Also runs every 15 minutes.
        </p>
      </form>

      <p
        role="status"
        aria-live="polite"
        className="min-h-6 text-sm text-foreground"
      >
        {busy ? "Working…" : result?.message}
      </p>
    </div>
  );
}
