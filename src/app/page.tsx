export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-4 px-6 py-24">
      <h1 className="text-3xl font-semibold tracking-tight">Payout Ledger</h1>
      <p className="text-zinc-600 dark:text-zinc-400">
        A Stripe payout reconciliation monitor built on a double-entry ledger.
        Work in progress: the dashboard and event simulator are not built yet.
      </p>
      <p>
        <a className="underline" href="/api/health">
          Service health
        </a>
      </p>
    </main>
  );
}
