/**
 * AgentActivityScreen — #88 monitoring feed for an ANTON agent wallet.
 *
 * "Keep tabs on what the agent is doing": a summary (balance, payment count,
 * total sent, last active) over the agent's own activity, then the full
 * timeline of its sends + receives grouped by day. The agent transacts under
 * the pseudonymous "ANTON <addr6>" identity (the human owner is the UBO on the
 * wire), which is shown in the header.
 *
 * Read-only monitoring surface: every value comes from the local ledger + a
 * balance read. Rows show who / how much / status / type / time inline.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getActiveWalletMeta } from '../services/wallet';
import { agentDebtorName } from '../services/wallets';
import { listPayments, formatFtc } from '../services/payment';
import { listReceived } from '../services/received';
import { buildActivity, groupActivityByDay, activityForWallet } from '../services/activity';
import { listContacts, buildContactNameMap, resolveName } from '../services/address-book';
import StatusPill from '../components/StatusPill';
import PaymentTypeBadge from '../components/PaymentTypeBadge';
import { fetchBalanceFtc } from '../services/fc-rpc';
import { shortAddress } from './HomeScreen';
import type { Activity } from '../services/types';

interface Props {
  onBack: () => void;
}

export default function AgentActivityScreen({ onBack }: Props) {
  const { t } = useTranslation();
  const [address, setAddress] = useState('');
  const [label, setLabel] = useState('');
  const [balanceFtc, setBalanceFtc] = useState<number | null>(null);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [contactNames, setContactNames] = useState<Record<string, string>>({});

  useEffect(() => {
    void (async () => {
      const meta = await getActiveWalletMeta();
      if (meta) { setAddress(meta.address); setLabel(meta.label); }
      const [sent, received, contacts] = await Promise.all([
        listPayments(), listReceived(), listContacts(),
      ]);
      // Pay's payment store isn't scoped per-wallet — scope to THIS agent
      // wallet (shared helper: sends by recorded sender address, receives by
      // recipient address).
      setActivity(activityForWallet(buildActivity(sent, received), meta?.address ?? ''));
      setContactNames(buildContactNameMap(contacts));
      if (meta) {
        const b = await fetchBalanceFtc(meta.address);
        setBalanceFtc(b?.ftc ?? null);
      }
    })();
  }, []);

  const sent = activity.filter((a) => a.direction === 'sent');
  const totalSentMicro = sent.reduce((acc, a) => acc + a.record.amountMicroFtc, 0n);
  const lastActiveAt = activity.length > 0 ? Math.max(...activity.map((a) => a.at)) : 0;

  const groups = groupActivityByDay(activity, {
    today: t('history.today', 'Today'),
    yesterday: t('history.yesterday', 'Yesterday'),
    formatDate: (ms) => new Date(ms).toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
    }),
  }, Date.now());

  return (
    <div className="flex flex-col h-full overflow-y-auto safe-top safe-bottom"
         style={{ backgroundColor: 'var(--color-bg)' }}>
      <div className="flex flex-col flex-1 px-6 pb-6">
        {/* Header */}
        <div className="flex items-center gap-3 -ml-2 mb-4">
          <button type="button" onClick={onBack} className="p-2 rounded-lg"
                  aria-label={t('common.back')} style={{ color: 'var(--color-text-muted)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <h2 className="text-xl font-bold" style={{ color: 'var(--color-text)' }}>
            {t('agentActivity.title', 'Agent activity')}
          </h2>
        </div>

        {/* Agent identity card */}
        <div className="rounded-2xl p-5 mb-3"
             style={{ backgroundColor: 'var(--color-accent-soft)',
                      border: '1px solid var(--color-accent-dim)' }}>
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <div className="text-xs uppercase tracking-wider" style={{ color: 'var(--color-text-faint)' }}>
                {label || t('agentActivity.title', 'Agent activity')}
              </div>
              <div className="text-base font-bold mt-0.5" style={{ color: 'var(--color-accent)' }}>
                {address ? agentDebtorName(address) : 'ANTON'}
              </div>
            </div>
            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0"
                  style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-fg)' }}>
              {t('walletsList.agentBadge', 'Agent')}
            </span>
          </div>
          <div className="mono text-xs mt-2 break-all" style={{ color: 'var(--color-text-muted)' }}>
            {address ? shortAddress(address) : '—'}
          </div>
          <div className="text-3xl font-bold mono mt-3" style={{ color: 'var(--color-text)' }}>
            {balanceFtc == null ? '—' : balanceFtc.toLocaleString('en-US', {
              minimumFractionDigits: 0, maximumFractionDigits: 4,
            })}{' '}
            <span className="text-lg">FTC</span>
          </div>
        </div>

        {/* Summary chips */}
        <div className="grid grid-cols-3 gap-2 mb-5">
          <Stat label={t('agentActivity.payments', 'Payments')} value={String(sent.length)} />
          <Stat label={t('agentActivity.totalSent', 'Total sent')} value={`${formatFtc(totalSentMicro)}`} />
          <Stat label={t('agentActivity.lastActive', 'Last active')}
                value={lastActiveAt ? formatAgo(lastActiveAt) : '—'} />
        </div>

        {/* Feed */}
        {activity.length === 0 ? (
          <p className="text-sm text-center mt-8" style={{ color: 'var(--color-text-faint)' }}>
            {t('agentActivity.empty', 'No agent activity yet. Payments the agent makes will appear here.')}
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {groups.map((g) => (
              <div key={g.dayKey} className="flex flex-col gap-2">
                <div className="sticky top-0 z-10 py-1.5 text-[11px] uppercase tracking-wider font-semibold"
                     style={{ color: 'var(--color-text-faint)', backgroundColor: 'var(--color-bg)' }}>
                  {g.label}
                </div>
                {g.items.map((a) => {
                  const isIn = a.direction === 'received';
                  return (
                    <div key={rowKey(a)}
                         className="w-full flex items-center gap-3 p-3.5 text-left rounded-xl"
                         style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                      <DirectionGlyph direction={a.direction} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm truncate" style={{ color: 'var(--color-text)' }}>
                            {counterpartyOf(a, contactNames)}
                          </span>
                          {a.direction === 'sent' && <StatusPill status={a.record.status} />}
                          {a.record.paymentType && <PaymentTypeBadge type={a.record.paymentType} />}
                        </div>
                        <div className="text-xs mt-0.5 truncate" style={{ color: 'var(--color-text-muted)' }}>
                          {formatTime(a.at)}
                        </div>
                      </div>
                      <div className="mono text-sm font-semibold shrink-0"
                           style={{ color: isIn ? 'var(--color-accent)' : 'var(--color-text)' }}>
                        {isIn ? '+' : '-'}{formatFtc(a.record.amountMicroFtc)} FTC
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl p-3 text-center"
         style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
      <div className="text-base font-bold mono truncate" style={{ color: 'var(--color-text)' }}>{value}</div>
      <div className="text-[10px] uppercase tracking-wider mt-0.5" style={{ color: 'var(--color-text-faint)' }}>
        {label}
      </div>
    </div>
  );
}

function abbreviate(addr: string): string {
  if (!addr) return '—';
  if (addr.length <= 18) return addr;
  return `${addr.slice(0, 10)}…${addr.slice(-6)}`;
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/** Coarse "Xm / Xh / Xd ago" for the last-active stat. */
function formatAgo(ms: number): string {
  const sec = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (sec < 60) return 'now';
  const min = Math.floor(sec / 60); if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60); if (hr < 24) return `${hr}h`;
  return `${Math.floor(hr / 24)}d`;
}

function rowKey(a: Activity): string {
  return a.direction === 'sent' ? `s-${a.record.id}` : `r-${a.record.txId}`;
}

function counterpartyOf(a: Activity, byAddr: Record<string, string>): string {
  if (a.direction === 'sent') {
    return resolveName(a.record.toAddress, byAddr) ?? a.record.merchantId;
  }
  return resolveName(a.record.fromAddress, byAddr)
    ?? a.record.fromName
    ?? (a.record.fromAddress ? abbreviate(a.record.fromAddress) : '—');
}

function DirectionGlyph({ direction }: { direction: 'sent' | 'received' }) {
  const isOut = direction === 'sent';
  return (
    <span aria-hidden className="flex items-center justify-center w-9 h-9 rounded-full shrink-0"
          style={{ backgroundColor: isOut ? 'var(--color-surface-alt, rgba(0,0,0,0.04))'
                                          : 'var(--color-accent-soft, rgba(45,212,168,0.12))',
                   color: isOut ? 'var(--color-text-muted)' : 'var(--color-accent)' }}>
      {isOut ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path d="M7 17L17 7M9 7h8v8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path d="M17 7L7 17M15 17H7V9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  );
}
