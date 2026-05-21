/**
 * WalletDetailScreen — per-wallet drilldown reached from the Wallets
 * list. Lets the user:
 *   • Rename the wallet
 *   • Re-display the 24-word recovery phrase under biometric gate
 *   • Delete this wallet (biometric-gated, refused if it is the last)
 *
 * "Restore from phrase" and "Add another wallet" are sibling actions
 * available from the Wallets list, not here — this screen is about
 * the wallet you just tapped.
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
  /** Called after the wallet is deleted so the parent can pop back to
   *  the list and refresh. */
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
      <div className="flex flex-col h-full px-6 pt-12 safe-top"
           style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}>
        <p>{t('walletDetail.notFound', 'Wallet not found.')}</p>
        <button type="button" onClick={onBack} className="mt-4 underline">
          {t('common.back')}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto safe-top safe-bottom"
         style={{ backgroundColor: 'var(--color-bg)' }}>
      <div className="flex flex-col flex-1 px-6 pb-6">
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
            {meta.label}
          </h2>
        </div>

        {/* Label */}
        <div className="rounded-xl p-4 mb-3"
             style={{ backgroundColor: 'var(--color-surface)',
                      border: '1px solid var(--color-border)' }}>
          <label htmlFor="wallet-label"
                 className="text-xs uppercase tracking-wider mb-1.5 block"
                 style={{ color: 'var(--color-text-faint)' }}>
            {t('walletDetail.label', 'Label')}
          </label>
          <input id="wallet-label" type="text" value={label}
                 onChange={(e) => setLabel(e.target.value)}
                 onBlur={saveLabel}
                 className="w-full bg-transparent text-base font-semibold outline-none"
                 style={{ color: 'var(--color-text)' }} />
          {savedFlash && (
            <p className="text-xs mt-1" style={{ color: 'var(--color-accent)' }}>
              {t('common.saved', 'Saved')}
            </p>
          )}
        </div>

        {/* Address */}
        <div className="rounded-xl p-4 mb-3"
             style={{ backgroundColor: 'var(--color-surface)',
                      border: '1px solid var(--color-border)' }}>
          <div className="text-xs uppercase tracking-wider mb-1.5"
               style={{ color: 'var(--color-text-faint)' }}>
            {t('wallet.addressLabel', 'Address')}
          </div>
          <div className="mono text-sm break-all select-all"
               style={{ color: 'var(--color-text)' }}>
            {meta.address}
          </div>
        </div>

        {/* Recovery phrase */}
        <button type="button" onClick={showPhrase}
                className="w-full py-3.5 rounded-xl text-sm font-semibold mb-3"
                style={{ backgroundColor: 'var(--color-surface)',
                         border: '1px solid var(--color-border)',
                         color: 'var(--color-text)' }}>
          {t('walletDetail.showPhrase', 'Show recovery phrase')}
        </button>
        {phraseError && (
          <p className="text-xs mb-3" style={{ color: 'var(--color-danger, #C0392B)' }}>
            {phraseError}
          </p>
        )}
        {phrase && (
          <div className="rounded-xl p-4 mb-3"
               style={{ backgroundColor: 'var(--color-accent-soft)',
                        border: '1px solid var(--color-accent-dim)' }}>
            <div className="text-xs uppercase tracking-wider mb-2"
                 style={{ color: 'var(--color-text-faint)' }}>
              {t('walletDetail.phraseTitle', 'Recovery phrase')}
            </div>
            <div className="font-mono text-sm leading-relaxed select-all"
                 style={{ color: 'var(--color-text)' }}>
              {phrase}
            </div>
            <p className="text-xs mt-3" style={{ color: 'var(--color-text-muted)' }}>
              {t('walletDetail.phraseWarning',
                'Anyone with these 24 words controls this wallet. Never type them anywhere except a trusted recovery flow.')}
            </p>
            <button type="button" onClick={() => setPhrase(null)}
                    className="mt-3 text-xs font-semibold underline"
                    style={{ color: 'var(--color-accent)' }}>
              {t('common.hide', 'Hide')}
            </button>
          </div>
        )}

        {/* Delete */}
        <div className="mt-auto pt-8">
          {!confirmDelete && (
            <button type="button" onClick={() => setConfirmDelete(true)}
                    className="w-full py-3.5 rounded-xl text-sm font-semibold"
                    style={{ backgroundColor: 'var(--color-surface)',
                             border: '1px solid var(--color-danger, #C0392B)',
                             color: 'var(--color-danger, #C0392B)' }}>
              {t('walletDetail.delete', 'Delete this wallet')}
            </button>
          )}
          {confirmDelete && (
            <div className="rounded-xl p-4"
                 style={{ backgroundColor: 'var(--color-surface)',
                          border: '1px solid var(--color-danger, #C0392B)' }}>
              <p className="text-sm font-semibold mb-2"
                 style={{ color: 'var(--color-text)' }}>
                {t('walletDetail.confirmTitle',
                  'Delete this wallet permanently?')}
              </p>
              <p className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>
                {t('walletDetail.confirmBody',
                  'Funds at this address become unrecoverable on this device unless you backed up the recovery phrase.')}
              </p>
              {deleteError && (
                <p className="text-xs mb-3" style={{ color: 'var(--color-danger, #C0392B)' }}>
                  {deleteError}
                </p>
              )}
              <div className="flex gap-2">
                <button type="button" disabled={busy}
                        onClick={() => setConfirmDelete(false)}
                        className="flex-1 py-3 rounded-xl text-sm font-semibold"
                        style={{ backgroundColor: 'var(--color-bg)',
                                 border: '1px solid var(--color-border)',
                                 color: 'var(--color-text)' }}>
                  {t('common.cancel', 'Cancel')}
                </button>
                <button type="button" disabled={busy} onClick={doDelete}
                        className="flex-1 py-3 rounded-xl text-sm font-semibold"
                        style={{ backgroundColor: 'var(--color-danger, #C0392B)',
                                 color: '#FFFFFF', opacity: busy ? 0.7 : 1 }}>
                  {busy
                    ? t('common.working', 'Working…')
                    : t('walletDetail.confirmDelete', 'Yes, delete')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
