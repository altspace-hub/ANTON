/**
 * WalletsListScreen — Comm App multi-wallet management.
 *
 * Mirror of src/pay/pages/settings/WalletsListScreen.tsx, restyled to
 * fit Comm's flatter design language. Each row: label + abbreviated
 * address + balance + active radio. Tap to switch; chevron opens the
 * per-wallet detail. "+ New wallet" button at the bottom.
 */
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchBalanceFtc } from '../../services/fc-rpc';
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

function shortAddress(addr: string): string {
  if (addr.length <= 18) return addr;
  return `${addr.slice(0, 10)}…${addr.slice(-6)}`;
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
    <section className="flex flex-col h-full safe-bottom">
      <div className="flex items-center gap-2 px-3 pt-4 pb-3">
        <button type="button" onClick={onBack} className="p-2 rounded-lg"
                aria-label={t('common.back')}
                style={{ color: 'var(--color-text-muted)' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h2 className="text-lg font-bold text-[var(--color-text)]">
          {t('walletsList.title', 'Wallets')}
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-5">
        <p className="text-sm mb-4 text-[var(--color-text-muted)]">
          {t('walletsList.help',
            'Each wallet is its own Ed25519 keypair with its own balance. Tap to switch which one signs.')}
        </p>

        <div className="flex flex-col gap-2 mb-4">
          {list.map((w) => {
            const isActive = w.id === activeId;
            const bal = balances[w.id];
            return (
              <div key={w.id}
                   className="rounded-xl overflow-hidden flex bg-[var(--color-surface)]"
                   style={{ border: `1px solid ${isActive ? 'var(--color-accent)' : 'var(--color-border)'}` }}>
                <button type="button" onClick={() => switchActive(w.id)}
                        className="flex-1 flex items-center gap-3 p-3.5 text-left">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full"
                        style={{ border: `2px solid ${isActive ? 'var(--color-accent)' : 'var(--color-border)'}` }}>
                    {isActive && <span className="w-3 h-3 rounded-full bg-[var(--color-accent)]" />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm text-[var(--color-text)] flex items-center gap-2">
                      <span className="truncate">{w.label}</span>
                      {!w.backedUp && (
                        <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded"
                              style={{ backgroundColor: 'rgba(200,136,30,0.12)',
                                       color: '#C8881E' }}>
                          {t('walletsList.notBackedUp', 'Back up')}
                        </span>
                      )}
                    </div>
                    <div className="font-mono text-xs mt-0.5 text-[var(--color-text-muted)]">
                      {shortAddress(w.address)}
                    </div>
                  </div>
                  <div className="font-mono text-sm font-semibold text-[var(--color-text)]">
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
                        className="px-3 flex items-center text-[var(--color-text-muted)]">
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
                className="w-full py-3.5 rounded-xl text-sm font-semibold bg-[var(--color-accent)] text-[var(--color-accent-fg)]">
          + {t('walletsList.add', 'New wallet')}
        </button>
      </div>
    </section>
  );
}
