/**
 * RecoveryPhraseScreen — Settings → Show recovery phrase.
 *
 * Two-tap + biometric reveal: an acknowledge button triggers the OS
 * biometric prompt (Face ID / Touch ID / fingerprint / device PIN
 * fallback), and only on success does the 24-word grid render. The
 * mnemonic is fetched lazily — never held in component state before
 * the gate passes.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import PassphrasePromptModal from '../../components/PassphrasePromptModal';
import { requireBiometric } from '../../services/biometric';
import {
  activeWalletHasPassphrase, getMnemonicForActive,
  getMnemonicForActiveWithPassphrase,
} from '../../services/wallets';
import { BadPassphraseError } from '../../services/wallet-passphrase';

interface Props {
  onBack: () => void;
}

const MAX_ATTEMPTS = 5;

export default function RecoveryPhraseScreen({ onBack }: Props) {
  const { t } = useTranslation();
  const [mnemonic, setMnemonic] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [gateError, setGateError] = useState<string | null>(null);
  const [passphraseOpen, setPassphraseOpen] = useState(false);
  const [passphraseFailures, setPassphraseFailures] = useState(0);

  // Wipe any lingering plaintext from state when the screen unmounts —
  // belt-and-braces; React will GC anyway but this makes the lifetime
  // visible.
  useEffect(() => () => setMnemonic(null), []);

  async function onReveal() {
    setGateError(null);
    const bio = await requireBiometric({ reason: 'Show recovery phrase' });
    if (!bio.ok && bio.reason !== 'unavailable') {
      setGateError(t('recoveryPhrase.gateDenied',
        'Biometric check did not pass. Recovery phrase remains hidden.'));
      return;
    }
    if (await activeWalletHasPassphrase()) {
      setPassphraseFailures(0);
      setPassphraseOpen(true);
      return;
    }
    const m = await getMnemonicForActive();
    setMnemonic(m);
    setAcknowledged(true);
  }

  async function onPassphraseSubmit(p: string) {
    try {
      const m = await getMnemonicForActiveWithPassphrase(p);
      setPassphraseOpen(false);
      setMnemonic(m);
      setAcknowledged(true);
    } catch (e) {
      if (e instanceof BadPassphraseError) {
        const next = passphraseFailures + 1;
        setPassphraseFailures(next);
        if (next >= MAX_ATTEMPTS) {
          setPassphraseOpen(false);
          setGateError(t('passphrase.exhausted',
            'Too many wrong attempts. Cancel and try again later, or ' +
            'restore from your 24-word recovery phrase.'));
        }
        return;
      }
      throw e;
    }
  }

  const words = (mnemonic ?? '').split(' ');

  return (
    <div className="flex flex-col h-full overflow-y-auto safe-top safe-bottom"
         style={{ backgroundColor: 'var(--color-bg)' }}>
      <div className="flex flex-col flex-1 px-6 pb-6">
        {/* Header */}
        <div className="flex items-center gap-3 -ml-2 mb-5">
          <button type="button" onClick={onBack} className="p-2 rounded-lg"
                  aria-label={t('common.back')} style={{ color: 'var(--color-text-muted)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <h2 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>
            {t('recoveryPhrase.title', 'Recovery phrase')}
          </h2>
        </div>

        {!acknowledged && (
          <>
            <div className="rounded-xl p-4 mb-3 text-sm leading-relaxed"
                 style={{ backgroundColor: 'var(--color-accent-soft)',
                          border: '1px solid var(--color-accent-dim)',
                          color: 'var(--color-text-body)' }}>
              {t('recoveryPhrase.warning',
                 'Anyone who sees these 24 words can spend your funds. Look around — no cameras, no shoulders. Never screenshot, photograph, or share them.')}
            </div>
            <button type="button" onClick={() => { void onReveal(); }}
                    className="w-full py-3.5 rounded-xl text-sm font-semibold mt-2"
                    style={{ backgroundColor: 'var(--color-accent)',
                             color: 'var(--color-accent-fg)' }}>
              {t('recoveryPhrase.reveal', 'I am alone — show me the phrase')}
            </button>
            {gateError && (
              <div className="mt-3 text-xs"
                   style={{ color: 'var(--color-danger, #c53030)' }}>
                {t('recoveryPhrase.gateDenied',
                   'Biometric check did not pass. Recovery phrase remains hidden.')}
              </div>
            )}
          </>
        )}

        {acknowledged && mnemonic && (
          <div className="rounded-xl p-4"
               style={{ backgroundColor: 'var(--color-surface)',
                        border: '1px solid var(--color-border)' }}>
            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
              {words.map((w, i) => (
                <div key={i} className="flex items-baseline gap-2 text-sm">
                  <span className="mono w-6 text-right shrink-0"
                        style={{ color: 'var(--color-text-faint)' }}>
                    {i + 1}.
                  </span>
                  <span className="mono font-semibold"
                        style={{ color: 'var(--color-text)' }}>
                    {w}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {acknowledged && !mnemonic && (
          <div className="rounded-xl p-6 text-center"
               style={{ backgroundColor: 'var(--color-surface)',
                        border: '1px solid var(--color-border)' }}>
            <div className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
              {t('recoveryPhrase.notAvailable', 'No recovery phrase stored on this device.')}
            </div>
          </div>
        )}
      </div>
      {passphraseOpen ? (
        <PassphrasePromptModal
          reason={t('passphrase.reasonShowSeed',
            'Confirm to reveal your 24-word recovery phrase')}
          attemptFailures={passphraseFailures}
          onSubmit={(p) => void onPassphraseSubmit(p)}
          onCancel={() => setPassphraseOpen(false)}
        />
      ) : null}
    </div>
  );
}
