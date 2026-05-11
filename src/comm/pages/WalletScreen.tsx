export default function WalletScreen() {
  return (
    <section className="px-5 pt-6 pb-4">
      <h1 className="text-2xl font-semibold text-[var(--color-text)]">Wallet</h1>
      <p className="mt-2 text-sm text-[var(--color-text-muted)]">
        Your FutureChain wallet.
      </p>

      <div className="mt-6 rounded-2xl border border-[var(--color-border-soft)] bg-[var(--color-surface)] p-6">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-medium text-[var(--color-text-muted)]">Balance</span>
          <span className="text-xs font-mono text-[var(--color-text-faint)]">FTC</span>
        </div>
        <div className="mt-2 text-3xl font-semibold text-[var(--color-text)] tabular-nums">
          —
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-accent-soft)] p-5">
        <p className="text-sm font-medium text-[var(--color-text)]">
          Coming soon — FutureChain wallet
        </p>
        <p className="mt-1 text-xs text-[var(--color-text-body)] leading-relaxed">
          Wallet setup, balance, payments and history will appear here once the
          FutureChain integration lands. Compliance, fraud detection and AML
          checks are handled by Heimdall on the network side.
        </p>
      </div>

      <div className="mt-6">
        <h2 className="text-sm font-semibold text-[var(--color-text)]">Recent activity</h2>
        <p className="mt-2 text-xs text-[var(--color-text-faint)]">
          No transactions yet.
        </p>
      </div>
    </section>
  );
}
