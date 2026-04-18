/**
 * StdWalletScreen — Standard mode "Money" (Evolution design).
 *
 * Per design/screens-standard.jsx StdWalletScreen:
 *   • "Money · Your FutureChain account" (no 0xA7…c91 hashes)
 *   • 44px balance number on accent-coloured card
 *   • Big Send / Receive 2x1 grid (stacked icons + labels)
 *   • Recent list — 44px circular icons (in/out arrows), 16px who,
 *     14px sub, 17px amount on the right (green for in, ink for out)
 *
 * v1: no real wallet endpoint exists yet for the companion. We render
 * an honest empty state (with the design layout intact) so the screen
 * is visually complete; a follow-up phase wires a real wallet provider.
 */

import { Ico } from '../components/ui';

interface Props {
  orgId: string;
  onBack: () => void;
}

interface RecentRow {
  who: string;
  sub: string;
  amt: string;       // formatted with sign + €
  t: string;
  isIn: boolean;
}

const SAMPLE_RECENT: RecentRow[] = []; // empty until a wallet provider is wired

export default function StdWalletScreen({ orgId: _orgId, onBack }: Props): JSX.Element {
  // Real implementation: pull balance + recent from a wallet endpoint
  // (e.g. /api/app/org/:orgId/wallet/today). v1 ships layout-complete
  // with placeholder zeros so the screen is honest about its state.
  const balance: string | null = null;

  return (
    <div className="flex flex-1 flex-col overflow-hidden" style={{ background: 'var(--color-bg)' }}>
      {/* Top bar */}
      <div
        className="flex items-start gap-3 px-[18px] py-3"
        style={{ background: 'var(--color-bg)' }}
      >
        <button onClick={onBack} className="pt-0.5">
          <Ico name="chevronLeft" color="var(--color-text)" size={26} />
        </button>
        <div className="flex-1">
          <div
            className="text-[var(--color-text)]"
            style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.4px', lineHeight: 1.1 }}
          >
            Money
          </div>
          <div className="mt-1 text-sm text-[var(--color-text-muted)]">
            Your FutureChain account
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4 pt-2">
        {/* Balance card */}
        <div
          className="mb-4 rounded-[var(--radius-r3)] p-5 text-white"
          style={{ background: 'var(--color-accent)' }}
        >
          <div className="text-sm opacity-90">Available balance</div>
          <div
            className="leading-none"
            style={{ fontSize: 44, fontWeight: 700, letterSpacing: '-1.5px', marginTop: 6 }}
          >
            {balance ?? '€—'}
          </div>
          <div className="mt-1 text-[13px] opacity-85">FutureChain · euro</div>
        </div>

        {/* Send / Receive */}
        <div className="mb-6 flex gap-2.5">
          <button
            disabled={balance === null}
            className="flex flex-1 flex-col items-center gap-1.5 rounded-[var(--radius-r2)] py-4 disabled:opacity-50"
            style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              fontSize: 16, fontWeight: 700, color: 'var(--color-text)',
            }}
          >
            <Ico name="arrowUp" color="var(--color-text)" size={22} />
            Send
          </button>
          <button
            disabled={balance === null}
            className="flex flex-1 flex-col items-center gap-1.5 rounded-[var(--radius-r2)] py-4 disabled:opacity-50"
            style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              fontSize: 16, fontWeight: 700, color: 'var(--color-text)',
            }}
          >
            <Ico name="qr" color="var(--color-text)" size={22} />
            Receive
          </button>
        </div>

        {/* Recent */}
        <div
          className="mb-2.5 font-bold uppercase text-[var(--color-text-muted)]"
          style={{ fontSize: 13, letterSpacing: '0.4px' }}
        >
          Recent
        </div>
        {SAMPLE_RECENT.length === 0 ? (
          <div
            className="rounded-[var(--radius-r3)] p-4 text-center"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
          >
            <div
              className="text-[var(--color-text)]"
              style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-0.2px' }}
            >
              No money activity yet.
            </div>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              Connect your account on the main ANTON to see balance and recent transactions here.
            </p>
          </div>
        ) : (
          SAMPLE_RECENT.map((r, i) => (
            <div
              key={`${r.who}-${i}`}
              className="flex items-center gap-3.5 px-1 py-3.5"
              style={{
                borderBottom: i < SAMPLE_RECENT.length - 1 ? '1px solid var(--color-border-soft)' : 'none',
              }}
            >
              <div
                className="flex h-[44px] w-[44px] flex-shrink-0 items-center justify-center rounded-full font-bold"
                style={{
                  background: r.isIn ? 'var(--color-green-dim)' : 'var(--color-surface-alt)',
                  color: r.isIn ? 'var(--color-green)' : 'var(--color-text)',
                  fontSize: 20,
                }}
              >
                {r.isIn ? '↓' : '↑'}
              </div>
              <div className="flex-1">
                <div className="text-[16px] font-semibold text-[var(--color-text)]">{r.who}</div>
                <div className="text-[13px] text-[var(--color-text-muted)]">{r.sub} · {r.t}</div>
              </div>
              <div
                className="font-bold"
                style={{
                  fontSize: 17,
                  letterSpacing: '-0.2px',
                  color: r.isIn ? 'var(--color-green)' : 'var(--color-text)',
                }}
              >
                {r.amt}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
