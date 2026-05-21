/**
 * AddWalletScreen — Comm App: create or import an additional wallet.
 *
 * Two modes via tab toggle:
 *   - Create fresh — generates an Ed25519 keypair + 24-word BIP-39
 *     mnemonic, persists, then reveals the phrase inline. The user
 *     copies/writes it down and confirms — no separate verify step
 *     because the experienced "I want a second wallet" user doesn't
 *     need the same training-wheels flow as a brand-new install.
 *     `backedUp` is flipped to true only after the user confirms.
 *   - Import phrase — paste 24 words; biometric-gated via
 *     importWalletFromMnemonic; routes back to the list on success.
 *
 * The first-ever wallet on the device is created from
 * WalletConnectScreen, not from here.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  createWallet,
  importWalletFromMnemonic,
  markBackedUp,
} from '../../services/wallets';

interface Props {
  onBack: () => void;
  onDone: () => void;
}

type Step = 'pick' | 'reveal-phrase';

export default function AddWalletScreen({ onBack, onDone }: Props) {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>('pick');
  const [label, setLabel] = useState('');
  const [mode, setMode] = useState<'create' | 'import'>('create');
  const [phrase, setPhrase] = useState('');
  const [revealedPhrase, setRevealedPhrase] = useState<string>('');
  const [newWalletId, setNewWalletId] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function doCreate() {
    setError(null); setBusy(true);
    try {
      const { meta, mnemonic } = await createWallet(label);
      setNewWalletId(meta.id);
      setRevealedPhrase(mnemonic);
      setStep('reveal-phrase');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function doImport() {
    setError(null); setBusy(true);
    try {
      const wordCount = phrase.trim().split(/\s+/).filter(Boolean).length;
      if (wordCount !== 24) {
        setError(t('addWallet.need24', 'Recovery phrase must be 24 words.'));
        setBusy(false); return;
      }
      await importWalletFromMnemonic(phrase, label);
      onDone();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg.includes('mnemonic')
        ? t('restore.invalidMnemonic', 'That isn\'t a valid BIP-39 phrase.')
        : msg);
      setBusy(false);
    }
  }

  async function confirmBackedUp() {
    if (newWalletId) await markBackedUp(newWalletId);
    onDone();
  }

  if (step === 'reveal-phrase') {
    return (
      <section className="flex flex-col h-full safe-bottom">
        <div className="flex items-center gap-2 px-3 pt-4 pb-3">
          <button type="button" onClick={onDone} className="p-2 rounded-lg"
                  aria-label={t('common.close', 'Close')}
                  style={{ color: 'var(--color-text-muted)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <h2 className="text-lg font-bold text-[var(--color-text)]">
            {t('addWallet.phraseTitle', 'Write this down')}
          </h2>
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-5">
          <p className="text-sm mb-4 text-[var(--color-text-muted)]">
            {t('addWallet.phraseHelp',
              'These 24 words are the only way to restore this wallet. Save them somewhere safe — not in a photo, not in cloud sync.')}
          </p>
          <div className="rounded-xl p-4 mb-4"
               style={{ backgroundColor: 'rgba(45,212,168,0.08)',
                        border: '1px solid rgba(45,212,168,0.32)' }}>
            <div className="font-mono text-sm leading-relaxed select-all text-[var(--color-text)]">
              {revealedPhrase}
            </div>
          </div>
          <button type="button" onClick={confirmBackedUp}
                  className="w-full py-3.5 rounded-xl text-sm font-semibold bg-[var(--color-accent)] text-[var(--color-accent-fg)]">
            {t('addWallet.confirmBackup', "I've written it down — done")}
          </button>
        </div>
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
        <h2 className="text-lg font-bold text-[var(--color-text)]">
          {t('addWallet.title', 'New wallet')}
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-5">
        <div className="flex gap-2 mb-4 p-1 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)]">
          <button type="button" onClick={() => setMode('create')}
                  className="flex-1 py-2 rounded-lg text-sm font-semibold"
                  style={{ backgroundColor: mode === 'create' ? 'var(--color-accent)' : 'transparent',
                           color: mode === 'create' ? 'var(--color-accent-fg)' : 'var(--color-text)' }}>
            {t('addWallet.createTab', 'Create fresh')}
          </button>
          <button type="button" onClick={() => setMode('import')}
                  className="flex-1 py-2 rounded-lg text-sm font-semibold"
                  style={{ backgroundColor: mode === 'import' ? 'var(--color-accent)' : 'transparent',
                           color: mode === 'import' ? 'var(--color-accent-fg)' : 'var(--color-text)' }}>
            {t('addWallet.importTab', 'Import phrase')}
          </button>
        </div>

        <div className="rounded-xl p-4 mb-3 bg-[var(--color-surface)] border border-[var(--color-border)]">
          <label htmlFor="add-label"
                 className="text-xs uppercase tracking-wider mb-1.5 block text-[var(--color-text-faint)]">
            {t('addWallet.label', 'Label')}
          </label>
          <input id="add-label" type="text" value={label}
                 onChange={(e) => setLabel(e.target.value)}
                 placeholder={t('addWallet.labelPlaceholder', 'e.g. Savings')}
                 className="w-full bg-transparent text-base font-semibold outline-none text-[var(--color-text)]" />
        </div>

        {mode === 'import' && (
          <div className="rounded-xl p-4 mb-3 bg-[var(--color-surface)] border border-[var(--color-border)]">
            <label htmlFor="add-phrase"
                   className="text-xs uppercase tracking-wider mb-1.5 block text-[var(--color-text-faint)]">
              {t('addWallet.phrase', '24-word recovery phrase')}
            </label>
            <textarea id="add-phrase" value={phrase} rows={4}
                      onChange={(e) => setPhrase(e.target.value)}
                      placeholder="word1 word2 word3 …"
                      className="w-full bg-transparent text-sm outline-none font-mono text-[var(--color-text)]" />
          </div>
        )}

        {error && (
          <p className="text-xs mb-3" style={{ color: '#C0392B' }}>{error}</p>
        )}

        <button type="button" disabled={busy}
                onClick={mode === 'create' ? doCreate : doImport}
                className="w-full py-3.5 rounded-xl text-sm font-semibold bg-[var(--color-accent)] text-[var(--color-accent-fg)]"
                style={{ opacity: busy ? 0.7 : 1 }}>
          {busy
            ? t('common.working', 'Working…')
            : mode === 'create'
              ? t('addWallet.createBtn', 'Create wallet')
              : t('addWallet.importBtn', 'Import wallet')}
        </button>
      </div>
    </section>
  );
}
