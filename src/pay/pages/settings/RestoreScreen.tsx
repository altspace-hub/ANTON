/**
 * RestoreScreen — wipe the current wallet and rebuild from a
 * user-supplied 24-word BIP-39 mnemonic. Destructive — caller is
 * expected to gate with a confirmation in Settings.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import PrimaryButton from '../../components/PrimaryButton';
import { restoreFromMnemonic } from '../../services/wallet';

interface Props {
  onBack: () => void;
  onRestored: (address: string) => void;
}

export default function RestoreScreen({ onBack, onRestored }: Props) {
  const { t } = useTranslation();
  const [phrase, setPhrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wordCount = phrase.trim().split(/\s+/).filter(Boolean).length;

  async function restore() {
    setError(null);
    if (wordCount !== 24) {
      setError(t('restore.bad24', 'Recovery phrase must be exactly 24 words.'));
      return;
    }
    setBusy(true);
    try {
      const w = await restoreFromMnemonic(phrase);
      onRestored(w.address);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg.includes('mnemonic')
        ? t('restore.invalidMnemonic', 'That isn\'t a valid BIP-39 phrase. Check each word.')
        : msg);
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto safe-top safe-bottom"
         style={{ backgroundColor: 'var(--color-bg)' }}>
      <div className="flex flex-col flex-1 px-6 pb-6">
        <div className="flex items-center gap-3 -ml-2 mb-3">
          <button type="button" onClick={onBack} className="p-2 rounded-lg"
                  aria-label={t('common.back')} style={{ color: 'var(--color-text-muted)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        <h1 className="text-2xl font-bold mb-1.5" style={{ color: 'var(--color-text)' }}>
          {t('restore.title', 'Restore from recovery phrase')}
        </h1>
        <p className="text-sm leading-relaxed mb-4"
           style={{ color: 'var(--color-text-body)' }}>
          {t('restore.body',
             'Enter your 24 words separated by spaces. This will replace any wallet currently on this device.')}
        </p>

        <textarea
          rows={5}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className="w-full px-4 py-3 rounded-lg mono text-sm mb-2"
          style={{ backgroundColor: 'var(--color-surface)',
                   border: '1px solid var(--color-border)',
                   color: 'var(--color-text)' }}
          placeholder={t('restore.placeholder', 'abandon ability able about …')}
          value={phrase}
          onChange={(e) => { setPhrase(e.target.value); setError(null); }}
        />

        <div className="text-xs mb-3" style={{ color: 'var(--color-text-faint)' }}>
          {t('restore.wordCount', { count: wordCount, defaultValue: '{{count}} / 24 words' })}
        </div>

        {error && (
          <div className="rounded-lg p-3 mb-3 text-sm"
               style={{ backgroundColor: 'var(--color-error-bg)',
                        color: 'var(--color-error)' }}>
            {error}
          </div>
        )}

        <div className="mt-auto">
          <PrimaryButton onClick={restore} disabled={busy || wordCount !== 24}>
            {busy ? t('common.loading') : t('restore.confirm', 'Restore wallet')}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}
