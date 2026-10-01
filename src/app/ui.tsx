import type { ReactNode } from "react";

export type Tone = "good" | "warning" | "critical" | "neutral";

const TONE_CLASS: Record<Tone, string> = {
  good: "text-good",
  warning: "text-warning",
  critical: "text-critical",
  neutral: "text-neutral",
};

// One shape per tone, so status never depends on colour alone.
const ICON_PATH: Record<Tone, ReactNode> = {
  good: <path d="M5 8.2 7.2 10.4 11 6.2" />,
  warning: <path d="M8 4.6v4.2M8 11.2v.2" />,
  critical: <path d="M5.6 5.6l4.8 4.8M10.4 5.6l-4.8 4.8" />,
  neutral: <path d="M5.2 8h5.6" />,
};

export function StatusIcon({ tone }: { tone: Tone }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className={`size-4 shrink-0 ${TONE_CLASS[tone]}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="8" cy="8" r="6.6" />
      {ICON_PATH[tone]}
    </svg>
  );
}

export function Status({
  tone,
  children,
}: {
  tone: Tone;
  children: ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <StatusIcon tone={tone} />
      {children}
    </span>
  );
}

export function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {description && (
          <p className="mt-1 max-w-3xl text-sm text-muted">{description}</p>
        )}
      </div>
      {children}
    </section>
  );
}

export function Tile({
  label,
  value,
  note,
  hero = false,
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  hero?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-line p-4">
      <div className="text-sm text-muted">{label}</div>
      <div
        className={
          hero
            ? "text-5xl font-semibold tracking-tight"
            : "text-2xl font-semibold tracking-tight"
        }
      >
        {value}
      </div>
      {note && <div className="text-sm text-muted">{note}</div>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-line p-4 text-sm text-muted">
      {children}
    </p>
  );
}

export function Table({
  head,
  children,
}: {
  head: string[];
  children: ReactNode;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full text-left text-sm">
        <thead className="bg-subtle text-muted">
          <tr>
            {head.map((h) => (
              <th key={h} scope="col" className="px-4 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  );
}

export function Id({ children }: { children: string }) {
  return <code className="font-mono text-[0.8125rem]">{children}</code>;
}

/** "3 minutes ago", "2 days ago". Computed on the server at render time. */
export function timeAgo(date: Date, now: Date): string {
  const seconds = Math.max(
    0,
    Math.round((now.getTime() - date.getTime()) / 1000),
  );
  const units: [number, string][] = [
    [86_400, "day"],
    [3_600, "hour"],
    [60, "minute"],
  ];
  for (const [size, name] of units) {
    if (seconds >= size) {
      const n = Math.floor(seconds / size);
      return `${n} ${name}${n === 1 ? "" : "s"} ago`;
    }
  }
  return "just now";
}
