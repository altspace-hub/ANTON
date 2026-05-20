/**
 * RecoveryPhraseScreen — Settings → Show recovery phrase.
 *
 * Two-tap reveal: an explicit acknowledge button, then the 24 words
 * appear in a numbered grid identical to BackupShowScreen so users
 * recognise the format. No PIN/biometric gate yet — that comes in
 * the OS-keychain hardening pass.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getMnemonic } from '../../services/wallet';

interface Props {
  onBack: () => void;
}

export default function RecoveryPhraseScreen({ onBack }: Props) {
  const { t } = useTranslation();
  const [mnemonic, setMnemonic] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);

  useEffect(() => {
    void (async () => setMnemonic(await getMnemonic()))();
  }, []);

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
            <button type="button" onClick={() => setAcknowledged(true)}
                    className="w-full py-3.5 rounded-xl text-sm font-semibold mt-2"
                    style={{ backgroundColor: 'var(--color-accent)',
                             color: 'var(--color-accent-fg)' }}>
              {t('recoveryPhrase.reveal', 'I am alone — show me the phrase')}
            </button>
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
    </div>
  );
}
