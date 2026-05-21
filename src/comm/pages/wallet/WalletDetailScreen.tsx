/**
 * WalletDetailScreen — Comm App: per-wallet drilldown.
 *
 * Lifted from src/pay/pages/settings/WalletDetailScreen.tsx, restyled
 * for Comm's design language. Rename, show recovery phrase
 * (biometric-gated), delete (biometric-gated, refuses if it is the
 * last wallet).
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getSecure } from '../../services/secure-store';
import { assertBiometric } from '../../services/biometric';
import {
  deleteWallet,
  listWallets,
  renameWallet,
  type WalletMeta,
} from '../../services/wallets';

interface Props {
  walletId: string;
  onBack: () => void;
  onDeleted: () => void;
}

export default function WalletDetailScreen({ walletId, onBack, onDeleted }: Props) {
  const { t } = useTranslation();
  const [meta, setMeta] = useState<WalletMeta | null>(null);
  const [label, setLabel] = useState('');
  const [savedFlash, setSavedFlash] = useState(false);
  const [phrase, setPhrase] = useState<string | null>(null);
  const [phraseError, setPhraseError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const list = await listWallets();
      const m = list.find(w => w.id === walletId) ?? null;
      setMeta(m);
      if (m) setLabel(m.label);
    })();
  }, [walletId]);

  async function saveLabel() {
    if (!meta) return;
    if (label.trim() === meta.label) return;
    await renameWallet(meta.id, label);
    setMeta({ ...meta, label: label.trim() || meta.label });
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 1500);
  }

  async function showPhrase() {
    setPhraseError(null);
    try {
      await assertBiometric({ reason: 'Show recovery phrase' });
      const stored = await getSecure(`fc.wallet.${walletId}.mnemonic`);
      if (!stored) {
        setPhraseError(t('walletDetail.noPhrase',
          'Recovery phrase is not on this device — this wallet was imported elsewhere.'));
        return;
      }
      setPhrase(stored);
    } catch (e) {
      setPhraseError(e instanceof Error ? e.message : String(e));
    }
  }

  async function doDelete() {
    if (!meta) return;
    setBusy(true);
    setDeleteError(null);
    try {
      await deleteWallet(meta.id);
      onDeleted();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  if (!meta) {
    return (
      <section className="flex flex-col h-full px-5 pt-12 safe-top text-[var(--color-text)]">
        <p>{t('walletDetail.notFound', 'Wallet not found.')}</p>
        <button type="button" onClick={onBack} className="mt-4 underline">
          {t('common.back')}
        </button>
      </section>
    );
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
        <h2 className="text-lg font-bold text-[var(--color-text)] truncate">
          {meta.label}
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-5">
        <div className="rounded-xl p-4 mb-3 bg-[var(--color-surface)] border border-[var(--color-border)]">
          <label htmlFor="wallet-label"
                 className="text-xs uppercase tracking-wider mb-1.5 block text-[var(--color-text-faint)]">
            {t('walletDetail.label', 'Label')}
          </label>
          <input id="wallet-label" type="text" value={label}
                 onChange={(e) => setLabel(e.target.value)}
                 onBlur={saveLabel}
                 className="w-full bg-transparent text-base font-semibold outline-none text-[var(--color-text)]" />
          {savedFlash && (
            <p className="text-xs mt-1 text-[var(--color-accent)]">{t('common.saved', 'Saved')}</p>
          )}
        </div>

        <div className="rounded-xl p-4 mb-3 bg-[var(--color-surface)] border border-[var(--color-border)]">
          <div className="text-xs uppercase tracking-wider mb-1.5 text-[var(--color-text-faint)]">
            {t('wallet.addressLabel', 'Address')}
          </div>
          <div className="font-mono text-sm break-all select-all text-[var(--color-text)]">
            {meta.address}
          </div>
        </div>

        <button type="button" onClick={showPhrase}
                className="w-full py-3.5 rounded-xl text-sm font-semibold mb-3 bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text)]">
          {t('walletDetail.showPhrase', 'Show recovery phrase')}
        </button>
        {phraseError && (
          <p className="text-xs mb-3" style={{ color: '#C0392B' }}>{phraseError}</p>
        )}
        {phrase && (
          <div className="rounded-xl p-4 mb-3"
               style={{ backgroundColor: 'rgba(45,212,168,0.08)',
                        border: '1px solid rgba(45,212,168,0.32)' }}>
            <div className="text-xs uppercase tracking-wider mb-2 text-[var(--color-text-faint)]">
              {t('walletDetail.phraseTitle', 'Recovery phrase')}
            </div>
            <div className="font-mono text-sm leading-relaxed select-all text-[var(--color-text)]">
              {phrase}
            </div>
            <p className="text-xs mt-3 text-[var(--color-text-muted)]">
              {t('walletDetail.phraseWarning',
                'Anyone with these 24 words controls this wallet. Never type them anywhere except a trusted recovery flow.')}
            </p>
            <button type="button" onClick={() => setPhrase(null)}
                    className="mt-3 text-xs font-semibold underline text-[var(--color-accent)]">
              {t('common.hide', 'Hide')}
            </button>
          </div>
        )}

        <div className="mt-8">
          {!confirmDelete && (
            <button type="button" onClick={() => setConfirmDelete(true)}
                    className="w-full py-3.5 rounded-xl text-sm font-semibold bg-[var(--color-surface)]"
                    style={{ border: '1px solid #C0392B', color: '#C0392B' }}>
              {t('walletDetail.delete', 'Delete this wallet')}
            </button>
          )}
          {confirmDelete && (
            <div className="rounded-xl p-4 bg-[var(--color-surface)]"
                 style={{ border: '1px solid #C0392B' }}>
              <p className="text-sm font-semibold mb-2 text-[var(--color-text)]">
                {t('walletDetail.confirmTitle', 'Delete this wallet permanently?')}
              </p>
              <p className="text-xs mb-3 text-[var(--color-text-muted)]">
                {t('walletDetail.confirmBody',
                  'Funds at this address become unrecoverable on this device unless you backed up the recovery phrase.')}
              </p>
              {deleteError && (
                <p className="text-xs mb-3" style={{ color: '#C0392B' }}>{deleteError}</p>
              )}
              <div className="flex gap-2">
                <button type="button" disabled={busy}
                        onClick={() => setConfirmDelete(false)}
                        className="flex-1 py-3 rounded-xl text-sm font-semibold bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-text)]">
                  {t('common.cancel', 'Cancel')}
                </button>
                <button type="button" disabled={busy} onClick={doDelete}
                        className="flex-1 py-3 rounded-xl text-sm font-semibold text-white"
                        style={{ backgroundColor: '#C0392B', opacity: busy ? 0.7 : 1 }}>
                  {busy
                    ? t('common.working', 'Working…')
                    : t('walletDetail.confirmDelete', 'Yes, delete')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
