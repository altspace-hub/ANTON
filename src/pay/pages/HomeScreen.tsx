/**
 * HomeScreen — the customer's landing surface.
 *
 * A wallet chip, the primary "Scan to pay" action, and a peek at the
 * most recent payments. Everything else is one tap away in Settings.
 */
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Logo from '../components/Logo';
import ActiveSyncBanner from '../components/ActiveSyncBanner';
import { getActiveWalletMeta } from '../services/wallet';
import { listPayments, formatFtc } from '../services/payment';
import { listReceived } from '../services/received';
import { buildActivity, activityForWallet } from '../services/activity';
import {
  isDust, listContacts, buildContactNameMap, resolveName,
} from '../services/address-book';
import StatusPill from '../components/StatusPill';
import { fetchBalanceFtc } from '../services/fc-rpc';
import { runOneShotPoll, getLastSyncTs } from '../services/idle-poller';
import { startActiveSync, type ActiveSyncSnapshot } from '../services/active-sync';
import { notifyIncoming } from '../services/notifications';
import type { Activity } from '../services/types';

interface Props {
  onScan: () => void;
  onReceive: () => void;
  onHistory: () => void;
  onSettings: () => void;
  /** #88 — open the agent monitoring feed (shown only for an agent wallet). */
  onAgentActivity: () => void;
}

/** Abbreviate a wallet address for chips: head…tail. */
export function shortAddress(addr: string): string {
  if (addr.length <= 18) return addr;
  return `${addr.slice(0, 10)}…${addr.slice(-6)}`;
}

export default function HomeScreen({ onScan, onReceive, onHistory, onSettings, onAgentActivity }: Props) {
  const { t } = useTranslation();
  const [address, setAddress] = useState<string>('');
  /** #88 — true when the active wallet is an ANTON agent wallet. */
  const [isAgent, setIsAgent] = useState(false);
  /** #88 — true when the active wallet is watch-only (no keys → cannot pay). */
  const [isWatch, setIsWatch] = useState(false);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [contactNames, setContactNames] = useState<Record<string, string>>({});
  const [balanceFtc, setBalanceFtc] = useState<number | null>(null);
  // fetchBalanceFtc returns null ONLY on a read error (a real zero balance
  // comes back as 0), so a null after a fetch means "couldn't reach the
  // hub" — surfaced distinctly from an honest empty wallet.
  const [balanceError, setBalanceError] = useState<boolean>(false);
  const [lastSyncTs, setLastSyncTs] = useState<number>(0);
  const [activeSync, setActiveSync] = useState<ActiveSyncSnapshot | null>(null);
  const activeSyncCancelRef = useRef<(() => void) | null>(null);

  // Load activity, wallet, and balance once on mount + on every
  // visibilitychange to 'visible'. No background timer (Coinbase
  // anti-pattern, 2024) — the app-level idle poller in App.tsx
  // owns the "have I missed anything?" question, and the Sync
  // button below owns the "I'm expecting one right now" question.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      // Address from the wallet META, not loadWallet(): after the Wave-7
      // native-signer migration the raw priv leaves secure-store, so
      // loadWallet() returns null for a good wallet. The meta always has the
      // address; signing still works via the native signer.
      const wallet = await getActiveWalletMeta();
      if (cancelled) return;
      setAddress(wallet?.address ?? '');
      setIsAgent(wallet?.kind === 'agent');
      setIsWatch(wallet?.kind === 'watch');
      // Instant paint from the local cache.
      const [sent, received, ts, contacts] = await Promise.all([
        listPayments(), listReceived(), getLastSyncTs(), listContacts(),
      ]);
      if (cancelled) return;
      // Filter dust (< 0.1 FTC) — address-poisoning delivery vector.
      setActivity(buildActivity(sent, received.filter(r => !isDust(r.amountMicroFtc))));
      setLastSyncTs(ts);
      setContactNames(buildContactNameMap(contacts));
      if (!wallet?.address) return;
      // Refresh the balance from chain.
      const b = await fetchBalanceFtc(wallet.address);
      if (cancelled) return;
      setBalanceFtc(b?.ftc ?? null);
      setBalanceError(b == null);
      // Pull fresh inbound so a just-received payment shows on open, then
      // repaint activity + the "Synced X ago" stamp. One-shot (not the
      // 30 s timer anti-pattern); the Sync button owns "expecting one now".
      await runOneShotPoll();
      if (cancelled) return;
      const [sent2, received2, ts2] = await Promise.all([
        listPayments(), listReceived(), getLastSyncTs(),
      ]);
      if (cancelled) return;
      setActivity(buildActivity(sent2, received2.filter(r => !isDust(r.amountMicroFtc))));
      setLastSyncTs(ts2);
    };
    void load();
    const onVisibility = () => { if (document.visibilityState === 'visible') void load(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      activeSyncCancelRef.current?.();
    };
  }, []);

  // Reload the activity rows during an active-sync tick — the snapshot
  // counter tells us when something fired even though no fresh tx
  // arrived, so the "Last synced" label can still tick over.
  useEffect(() => {
    if (!activeSync) return;
    void (async () => {
      const [sent, received, ts] = await Promise.all([
        listPayments(), listReceived(), getLastSyncTs(),
      ]);
      // Filter dust (< 0.1 FTC) — address-poisoning delivery vector.
      setActivity(buildActivity(sent, received.filter(r => !isDust(r.amountMicroFtc))));
      setLastSyncTs(ts);
    })();
  }, [activeSync]);

  /** "Sync now" — user-initiated bounded active polling. Stops on
   *  first fresh tx OR explicit Cancel OR 5 min budget. */
  function startSync() {
    if (activeSyncCancelRef.current) return; // already running
    const cancel = startActiveSync({
      budgetMs: 5 * 60 * 1000,
      onTick: (snap) => setActiveSync(snap),
      onFresh: async (fresh) => {
        for (const r of fresh) void notifyIncoming(r);
        // Reload activity so the new row appears immediately, even
        // though the active-sync would also stop here.
        const [sent, received] = await Promise.all([listPayments(), listReceived()]);
        // Filter dust (< 0.1 FTC) — address-poisoning delivery vector.
      setActivity(buildActivity(sent, received.filter(r => !isDust(r.amountMicroFtc))));
      },
      onEnd: () => {
        activeSyncCancelRef.current = null;
        setActiveSync(null);
        void runOneShotPoll().then(() => getLastSyncTs().then(setLastSyncTs));
        // Refresh the headline balance too, so "Sync now" updates the
        // number (not just the activity list) and clears any error state.
        if (address) {
          void fetchBalanceFtc(address).then((b) => {
            setBalanceFtc(b?.ftc ?? null);
            setBalanceError(b == null);
          });
        }
      },
    });
    activeSyncCancelRef.current = cancel;
    // Also seed an immediate snapshot so the banner renders straight
    // away without waiting for the first onTick.
    setActiveSync({ elapsedMs: 0, budgetMs: 5 * 60 * 1000, nextPollInMs: 5_000, pollCount: 0 });
  }

  function cancelSync() {
    activeSyncCancelRef.current?.();
  }

  // #88 — scope activity to the active wallet (multi-wallet installs) for the
  // recent peek + the count, so a watch / agent wallet's home shows only its
  // own activity rather than every wallet's.
  const scopedActivity = activityForWallet(activity, address);
  const recent = scopedActivity.slice(0, 3);

  return (
    <div className="flex flex-col h-full overflow-y-auto safe-top safe-bottom"
         style={{ backgroundColor: 'var(--color-bg)' }}>
      <div className="flex flex-col flex-1 px-6 pb-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2.5">
            <Logo size={34} rounded="md" />
            <span className="text-lg font-bold" style={{ color: 'var(--color-text)' }}>
              {t('home.greeting')}
            </span>
          </div>
          <button type="button" onClick={onSettings} aria-label={t('home.settings')}
                  className="p-2 rounded-lg" style={{ color: 'var(--color-text-muted)' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" stroke="currentColor" strokeWidth="1.8" />
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 008 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H2a2 2 0 010-4h.09A1.65 1.65 0 003.6 8a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H8a1.65 1.65 0 001-1.51V2a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V8a1.65 1.65 0 001.51 1H22a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"
                    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        {/* Wallet chip */}
        <div className="rounded-xl p-4 mb-5"
             style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <div className="text-xs uppercase tracking-wider mb-1"
               style={{ color: 'var(--color-text-faint)' }}>
            {t('home.walletLabel')}
          </div>
          <div className="mono text-sm" style={{ color: 'var(--color-text)' }}>
            {address ? shortAddress(address) : '—'}
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-lg font-bold mono" style={{ color: 'var(--color-text)' }}>
              {balanceFtc == null
                ? '—'
                : balanceFtc.toLocaleString('en-US', {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 4,
                  })}
            </span>
            <span className="text-xs uppercase tracking-wider"
                  style={{ color: 'var(--color-text-faint)' }}>
              FTC
            </span>
          </div>
          <div className="flex items-center justify-between mt-1">
            <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              {t('home.activityCount', {
                count: scopedActivity.length,
                defaultValue: '{{count}} payment',
                defaultValue_other: '{{count}} payments',
              })}
            </div>
            <div className="text-[11px]"
                 style={{ color: balanceError ? 'var(--color-red, #E74C3C)' : 'var(--color-text-faint)' }}>
              {balanceError
                ? t('home.syncError', "Couldn't reach FutureChain — tap Sync")
                : lastSyncTs > 0
                  ? t('home.lastSync', { ago: formatAgo(Date.now() - lastSyncTs), defaultValue: 'Synced {{ago}} ago' })
                  : t('home.notYetSynced', 'Not synced yet')}
            </div>
          </div>
        </div>

        {/* #88 — agent wallet: a prominent entry into the monitoring feed. */}
        {isAgent && (
          <button type="button" onClick={onAgentActivity}
                  className="rounded-2xl p-3.5 mb-4 w-full flex items-center justify-between active:opacity-90 transition-opacity"
                  style={{ backgroundColor: 'var(--color-accent-soft)',
                           border: '1px solid var(--color-accent-dim)' }}>
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded"
                    style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-fg)' }}>
                {t('walletsList.agentBadge', 'Agent')}
              </span>
              <span className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                {t('agentActivity.open', 'Agent activity')}
              </span>
            </div>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--color-accent)' }}>
              <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}

        {/* Active-sync banner — only visible while Sync is running. */}
        {activeSync && (
          <div className="mb-4">
            <ActiveSyncBanner snapshot={activeSync} onCancel={cancelSync} />
          </div>
        )}

        {/* Sync button — only visible when no active-sync is running.
            Replaces the always-on 30 s background timer with a user-
            initiated bounded burst (5 min budget, backoff curve in
            services/active-sync.ts). */}
        {!activeSync && (
          <button type="button" onClick={startSync}
                  className="rounded-2xl p-3 mb-4 flex items-center justify-center gap-2 active:opacity-90 transition-opacity"
                  style={{ backgroundColor: 'var(--color-surface)',
                           border: '1px solid var(--color-border)',
                           color: 'var(--color-text)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M21 12a9 9 0 11-3-6.7M21 4v5h-5"
                    stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="text-sm font-semibold">
              {t('home.syncNow', 'Sync now — listen for incoming payment')}
            </span>
          </button>
        )}

        {/* #88 — a watch-only wallet has no keys, so it cannot pay: replace the
            Scan CTA with a clear watch-only notice. Balance + activity below
            still update so the user can keep tabs on the address. */}
        {isWatch ? (
          <div className="rounded-2xl p-5 flex items-center gap-3"
               style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
            <span className="flex items-center justify-center w-10 h-10 rounded-full shrink-0"
                  style={{ backgroundColor: 'var(--color-accent-soft)', color: 'var(--color-accent)' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" stroke="currentColor" strokeWidth="1.8" />
                <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
              </svg>
            </span>
            <div>
              <div className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                {t('home.watchOnlyTitle', 'Watch-only wallet')}
              </div>
              <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                {t('home.watchOnlyBody', 'No keys on this device — you can monitor its balance and incoming activity, but not send.')}
              </div>
            </div>
          </div>
        ) : (
          /* Scan CTA */
          <button
            type="button"
            onClick={onScan}
            className="rounded-2xl p-6 flex flex-col items-center text-center active:opacity-90 transition-opacity"
            style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-fg)' }}
          >
            <span className="flex items-center justify-center w-16 h-16 rounded-full mb-3"
                  style={{ backgroundColor: 'rgba(255,255,255,0.16)' }}>
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
                <path d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2M3 12h18"
                      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <span className="text-xl font-bold">{t('home.scanToPay')}</span>
            <span className="text-sm mt-1" style={{ opacity: 0.85 }}>{t('home.scanHint')}</span>
          </button>
        )}

        {/* Receive CTA — secondary action, same width, lighter weight so
            Scan stays the primary call-to-action. */}
        <button
          type="button"
          onClick={onReceive}
          className="rounded-2xl p-3.5 mt-2 flex items-center justify-center gap-2 active:opacity-90 transition-opacity"
          style={{ backgroundColor: 'var(--color-surface)',
                   border: '1px solid var(--color-border)',
                   color: 'var(--color-text)' }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <rect x="4" y="4" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.8" />
            <rect x="14" y="4" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.8" />
            <rect x="4" y="14" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.8" />
            <path d="M14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z"
                  fill="currentColor" />
          </svg>
          <span className="text-sm font-semibold">
            {t('home.receive', 'Show my QR · Receive')}
          </span>
        </button>

        {/* Recent activity — sent + received, sorted by timestamp. */}
        <div className="flex items-center justify-between mt-7 mb-2">
          <h2 className="text-sm font-bold uppercase tracking-wider"
              style={{ color: 'var(--color-text-faint)' }}>
            {t('home.recentActivity', 'Recent activity')}
          </h2>
          {scopedActivity.length > 3 && (
            <button type="button" onClick={onHistory}
                    className="text-sm font-semibold" style={{ color: 'var(--color-accent)' }}>
              {t('home.seeAll')}
            </button>
          )}
        </div>

        {recent.length === 0 ? (
          <div className="rounded-xl p-5 text-center"
               style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
            <div className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
              {t('home.noPayments')}
            </div>
            <div className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
              {t('home.noPaymentsBody')}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {recent.map((a) => {
              const key = a.direction === 'sent' ? `s-${a.record.id}` : `r-${a.record.txId}`;
              const isIn = a.direction === 'received';
              const title = a.direction === 'sent'
                ? t(`review.purpose${a.record.purpose}`)
                : t('history.receivedFrom', 'Received');
              // Prefer the saved friend label over the raw merchant
              // hash / abbreviated address. sent → toAddress, received
              // → fromAddress.
              const sub = a.direction === 'sent'
                ? (resolveName(a.record.toAddress, contactNames) ?? a.record.merchantId)
                : (resolveName(a.record.fromAddress, contactNames)
                    ?? a.record.fromName
                    ?? (a.record.fromAddress
                        ? `${a.record.fromAddress.slice(0, 10)}…${a.record.fromAddress.slice(-4)}`
                        : '—'));
              return (
                <button key={key} type="button" onClick={onHistory}
                        className="flex items-center justify-between rounded-xl p-3.5 text-left"
                        style={{ backgroundColor: 'var(--color-surface)',
                                 border: '1px solid var(--color-border)' }}>
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span aria-hidden
                          className="flex items-center justify-center w-7 h-7 rounded-full shrink-0"
                          style={{ backgroundColor: isIn
                                     ? 'var(--color-accent-soft, rgba(45,212,168,0.12))'
                                     : 'var(--color-surface-alt, rgba(0,0,0,0.04))',
                                   color: isIn ? 'var(--color-accent)' : 'var(--color-text-muted)' }}>
                      {isIn ? '↙' : '↗'}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm truncate"
                              style={{ color: 'var(--color-text)' }}>
                          {title}
                        </span>
                        {a.direction === 'sent' && <StatusPill status={a.record.status} />}
                      </div>
                      <div className="mono text-xs mt-0.5 truncate"
                           style={{ color: 'var(--color-text-muted)' }}>
                        {sub}
                      </div>
                    </div>
                  </div>
                  <div className="mono text-sm font-semibold shrink-0"
                       style={{ color: isIn ? 'var(--color-accent)' : 'var(--color-text)' }}>
                    {isIn ? '+' : ''}{formatFtc(a.record.amountMicroFtc)} FTC
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/** Coarse "X minutes ago / X hours ago" formatter for the Last-synced
 *  label. Deliberately granular — we want the user to see "just now"
 *  vs "a couple of hours ago," not exact seconds. */
function formatAgo(ms: number): string {
  if (ms < 60_000) return 'just now';
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}
