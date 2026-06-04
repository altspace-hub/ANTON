/**
 * WalletsListScreen — manage every wallet on this device.
 *
 * Each row: label + abbreviated address + balance + a radio for
 * "active." Tap the row to switch active. Tap the chevron to open
 * the per-wallet detail (rename / show recovery phrase / delete).
 *
 * "+ New wallet" creates a fresh Ed25519 wallet and routes into the
 * backup flow — the new wallet is created in the registry but its
 * `backedUp` flag stays false until BackupVerify completes.
 */
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchBalanceFtc } from '../../services/fc-rpc';
import { shortAddress } from '../HomeScreen';
import {
  getActiveWalletId,
  listWallets,
  setActiveWallet,
  type WalletMeta,
} from '../../services/wallets';

interface Props {
  onBack: () => void;
  onAddWallet: () => void;
  onOpenWallet: (id: string) => void;
}

export default function WalletsListScreen({ onBack, onAddWallet, onOpenWallet }: Props) {
  const { t } = useTranslation();
  const [list, setList] = useState<WalletMeta[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [balances, setBalances] = useState<Record<string, number | null>>({});

  const refresh = useCallback(async () => {
    const wallets = await listWallets();
    setList(wallets);
    setActiveId(await getActiveWalletId());
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  // One balance fetch per wallet on mount. Cheap; addresses are stable.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      for (const w of list) {
        const b = await fetchBalanceFtc(w.address);
        if (cancelled) return;
        setBalances(prev => ({ ...prev, [w.id]: b?.ftc ?? null }));
      }
    })();
    return () => { cancelled = true; };
  }, [list]);

  async function switchActive(id: string) {
    if (id === activeId) return;
    await setActiveWallet(id);
    setActiveId(id);
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto safe-top safe-bottom"
         style={{ backgroundColor: 'var(--color-bg)' }}>
      <div className="flex flex-col flex-1 px-6 pb-6">
        {/* Header */}
        <div className="flex items-center gap-3 -ml-2 mb-5">
          <button type="button" onClick={onBack} className="p-2 rounded-lg"
                  aria-label={t('common.back')}
                  style={{ color: 'var(--color-text-muted)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <h2 className="text-xl font-bold" style={{ color: 'var(--color-text)' }}>
            {t('walletsList.title', 'Wallets')}
          </h2>
        </div>

        <p className="text-sm mb-4" style={{ color: 'var(--color-text-muted)' }}>
          {t('walletsList.help', 'Each wallet is its own Ed25519 keypair with its own balance. Tap to switch which one signs.')}
        </p>

        <div className="flex flex-col gap-2 mb-4">
          {list.map((w) => {
            const isActive = w.id === activeId;
            const bal = balances[w.id];
            return (
              <div key={w.id}
                   className="rounded-xl overflow-hidden flex"
                   style={{ backgroundColor: 'var(--color-surface)',
                            border: `1px solid ${isActive ? 'var(--color-accent)' : 'var(--color-border)'}` }}>
                <button type="button" onClick={() => switchActive(w.id)}
                        className="flex-1 flex items-center gap-3 p-3.5 text-left"
                        aria-label={t('walletsList.switchTo', { label: w.label, defaultValue: `Use ${w.label}` })}>
                  <span className="flex items-center justify-center w-6 h-6 rounded-full"
                        style={{ border: `2px solid ${isActive ? 'var(--color-accent)' : 'var(--color-border)'}` }}>
                    {isActive && (
                      <span className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: 'var(--color-accent)' }} />
                    )}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm flex items-center gap-2"
                         style={{ color: 'var(--color-text)' }}>
                      <span className="truncate">{w.label}</span>
                      {w.kind === 'agent' && (
                        <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0"
                              style={{ backgroundColor: 'var(--color-accent-soft)',
                                       color: 'var(--color-accent)' }}>
                          {t('walletsList.agentBadge', 'Agent')}
                        </span>
                      )}
                      {w.kind === 'watch' && (
                        <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0"
                              style={{ backgroundColor: 'var(--color-surface-muted, rgba(0,0,0,0.06))',
                                       color: 'var(--color-text-muted)' }}>
                          {t('walletsList.watchBadge', 'Watch')}
                        </span>
                      )}
                      {!w.backedUp && (
                        <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0"
                              style={{ backgroundColor: 'var(--color-warning-soft, #FFF3CD)',
                                       color: 'var(--color-warning, #C8881E)' }}>
                          {t('walletsList.notBackedUp', 'Back up')}
                        </span>
                      )}
                    </div>
                    <div className="mono text-xs mt-0.5"
                         style={{ color: 'var(--color-text-muted)' }}>
                      {shortAddress(w.address)}
                    </div>
                  </div>
                  <div className="mono text-sm font-semibold"
                       style={{ color: 'var(--color-text)' }}>
                    {bal == null
                      ? '—'
                      : bal.toLocaleString('en-US', {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 4,
                        })}
                  </div>
                </button>
                <button type="button" onClick={() => onOpenWallet(w.id)}
                        aria-label={t('walletsList.openDetail', { label: w.label, defaultValue: `${w.label} details` })}
                        className="px-3 flex items-center"
                        style={{ color: 'var(--color-text-muted)' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2"
                          strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            );
          })}
        </div>

        <button type="button" onClick={onAddWallet}
                className="py-3.5 rounded-xl text-sm font-semibold"
                style={{ backgroundColor: 'var(--color-accent)',
                         color: 'var(--color-accent-fg)' }}>
          + {t('walletsList.add', 'New wallet')}
        </button>
      </div>
    </div>
  );
}
