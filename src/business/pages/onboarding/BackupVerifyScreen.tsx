/**
 * BackupVerifyScreen — confirm the user actually wrote down the
 * recovery phrase by asking for three specific words. Marks the
 * wallet as backed up on success.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import PrimaryButton from '../../components/PrimaryButton';
import { getMnemonic, markMnemonicBackedUp } from '../../services/wallet';

interface Props {
  onVerified: () => void;
  onBack: () => void;
}

/** Pick three distinct word positions (1-indexed) spread across the
 *  phrase. Re-rolled per mount so the user can't just memorise three
 *  fixed slots between attempts. */
function pickChallenges(): [number, number, number] {
  const buckets: Array<[number, number]> = [[1, 8], [9, 16], [17, 24]];
  return buckets.map(([lo, hi]) =>
    lo + Math.floor(Math.random() * (hi - lo + 1)),
  ) as [number, number, number];
}

export default function BackupVerifyScreen({ onVerified, onBack }: Props) {
  const { t } = useTranslation();
  const [mnemonic, setMnemonic] = useState<string | null>(null);
  const positions = useMemo(pickChallenges, []);
  const [answers, setAnswers] = useState<string[]>(['', '', '']);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => setMnemonic(await getMnemonic()))();
  }, []);

  async function verify() {
    if (!mnemonic) return;
    const words = mnemonic.split(' ');
    const wrong = positions.some((pos, i) =>
      words[pos - 1].trim().toLowerCase() !== answers[i].trim().toLowerCase(),
    );
    if (wrong) {
      setError(t('backup.verifyWrong', 'One or more words don\'t match. Check your written copy.'));
      return;
    }
    setBusy(true);
    await markMnemonicBackedUp();
    onVerified();
  }

  const allFilled = answers.every((a) => a.trim().length > 0);

  return (
    <div className="flex flex-col h-full overflow-y-auto safe-top safe-bottom"
         style={{ backgroundColor: 'var(--color-bg)' }}>
      <div className="flex flex-col flex-1 px-6 pb-6">
        {/* Header with back */}
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
          {t('backup.verifyTitle', 'Verify your recovery phrase')}
        </h1>
        <p className="text-sm leading-relaxed mb-5"
           style={{ color: 'var(--color-text-body)' }}>
          {t('backup.verifyBody',
             'Enter the words at the positions shown to confirm you saved the phrase correctly.')}
        </p>

        <div className="flex flex-col gap-3 mb-3">
          {positions.map((pos, i) => (
            <label key={pos} className="flex flex-col gap-1.5">
              <span className="text-xs uppercase tracking-wider"
                    style={{ color: 'var(--color-text-faint)' }}>
                {t('backup.wordAtPos', { pos, defaultValue: 'Word #{{pos}}' })}
              </span>
              <input
                type="text"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className="w-full px-4 py-3 rounded-lg mono text-base"
                style={{ backgroundColor: 'var(--color-surface)',
                         border: '1px solid var(--color-border)',
                         color: 'var(--color-text)' }}
                value={answers[i]}
                onChange={(e) => {
                  const next = [...answers];
                  next[i] = e.target.value;
                  setAnswers(next);
                  setError(null);
                }}
              />
            </label>
          ))}
        </div>

        {error && (
          <div className="rounded-lg p-3 mb-3 text-sm"
               style={{ backgroundColor: 'var(--color-error-bg)',
                        color: 'var(--color-error)' }}>
            {error}
          </div>
        )}

        <div className="mt-auto">
          <PrimaryButton onClick={verify} disabled={busy || !allFilled}>
            {busy ? t('common.loading') : t('backup.verifyConfirm', 'Confirm')}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}
