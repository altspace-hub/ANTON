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
import {
  addWatchOnlyWallet,
  getActiveWalletId,
  listWallets,
  setActiveWallet,
  type WalletMeta,
} from '../../services/wallets';

/** Abbreviate a wallet address for compact rows. */
function shortAddress(addr: string): string {
  if (addr.length <= 18) return addr;
  return `${addr.slice(0, 10)}…${addr.slice(-6)}`;
}

interface Props {
  onBack: () => void;
  onAddWallet: () => void;
  onOpenWallet: (id: string) => void;
  onTerminals: () => void;
}

export default function WalletsListScreen({ onBack, onAddWallet, onOpenWallet, onTerminals }: Props) {
  const { t } = useTranslation();
  const [list, setList] = useState<WalletMeta[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [balances, setBalances] = useState<Record<string, number | null>>({});
  const [addingWatch, setAddingWatch] = useState(false);
  const [watchAddr, setWatchAddr] = useState('');
  const [watchLabel, setWatchLabel] = useState('');
  const [watchErr, setWatchErr] = useState<string | null>(null);
  const [savingWatch, setSavingWatch] = useState(false);

  const refresh = useCallback(async () => {
    const wallets = await listWallets();
    setList(wallets);
    setActiveId(await getActiveWalletId());
  }, []);

  async function saveWatchOnly() {
    setWatchErr(null);
    setSavingWatch(true);
    try {
      await addWatchOnlyWallet(watchAddr, watchLabel);
      setWatchAddr(''); setWatchLabel(''); setAddingWatch(false);
      await refresh();
    } catch (e) {
      setWatchErr(e instanceof Error ? e.message : 'Could not add address');
    } finally {
      setSavingWatch(false);
    }
  }

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
          {' '}
          {t('walletsList.helpWatch', 'Or add a central company receiving address (watch-only) — no key or password on this device; it can only take in payments.')}
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
                      {w.watchOnly ? (
                        <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded"
                              style={{ backgroundColor: 'var(--color-surface-alt, #ECECEC)',
                                       color: 'var(--color-text-muted)' }}>
                          {t('walletsList.watchOnly', 'Watch-only')}
                        </span>
                      ) : !w.backedUp ? (
                        <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded"
                              style={{ backgroundColor: 'var(--color-warning-soft, #FFF3CD)',
                                       color: 'var(--color-warning, #C8881E)' }}>
                          {t('walletsList.notBackedUp', 'Back up')}
                        </span>
                      ) : null}
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

        {/* Watch-only: add a central company receiving address (no keys
            on this device). The till receives to it; it cannot spend. */}
        {!addingWatch ? (
          <button type="button" onClick={() => { setAddingWatch(true); setWatchErr(null); }}
                  className="mt-2 py-3 rounded-xl text-sm font-semibold"
                  style={{ backgroundColor: 'var(--color-surface)',
                           border: '1px solid var(--color-border)',
                           color: 'var(--color-text)' }}>
            + {t('walletsList.addWatch', 'Add receiving address (watch-only)')}
          </button>
        ) : null}

        {/* Terminal registration (per-business CA) — show this terminal's
            code, or authorize a terminal from the company wallet. */}
        {!addingWatch && (
          <button type="button" onClick={onTerminals}
                  className="mt-2 py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
                  style={{ backgroundColor: 'var(--color-surface)',
                           border: '1px solid var(--color-border)',
                           color: 'var(--color-text)' }}>
            {t('walletsList.terminals', 'Terminals — authorize tills')}
          </button>
        )}

        {addingWatch && (
          <div className="mt-2 rounded-xl p-3.5 flex flex-col gap-2.5"
               style={{ backgroundColor: 'var(--color-surface)',
                        border: '1px solid var(--color-border)' }}>
            <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              {t('walletsList.addWatchHelp', 'Paste your company FutureChain address. This terminal will receive to it with no private key stored here.')}
            </div>
            <input
              type="text" inputMode="text" autoCapitalize="none" autoCorrect="off" spellCheck={false}
              value={watchAddr} onChange={(e) => setWatchAddr(e.target.value)}
              placeholder="fc_…"
              className="mono text-sm rounded-lg px-3 py-2.5"
              style={{ backgroundColor: 'var(--color-bg)',
                       border: '1px solid var(--color-border)',
                       color: 'var(--color-text)' }}
            />
            <input
              type="text" value={watchLabel} onChange={(e) => setWatchLabel(e.target.value)}
              placeholder={t('walletsList.addWatchLabel', 'Label (e.g. Company wallet)')}
              className="text-sm rounded-lg px-3 py-2.5"
              style={{ backgroundColor: 'var(--color-bg)',
                       border: '1px solid var(--color-border)',
                       color: 'var(--color-text)' }}
            />
            {watchErr && (
              <div className="text-xs" style={{ color: 'var(--color-red, #E74C3C)' }}>{watchErr}</div>
            )}
            <div className="flex gap-2">
              <button type="button" disabled={savingWatch || !watchAddr.trim()} onClick={() => void saveWatchOnly()}
                      className="flex-1 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50"
                      style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-fg)' }}>
                {savingWatch ? t('common.saving', 'Saving…') : t('common.add', 'Add')}
              </button>
              <button type="button" disabled={savingWatch}
                      onClick={() => { setAddingWatch(false); setWatchErr(null); setWatchAddr(''); setWatchLabel(''); }}
                      className="px-4 py-2.5 rounded-lg text-sm font-semibold"
                      style={{ backgroundColor: 'var(--color-surface-alt, #ECECEC)', color: 'var(--color-text)' }}>
                {t('common.cancel', 'Cancel')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
