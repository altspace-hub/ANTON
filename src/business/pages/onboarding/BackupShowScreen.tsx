/**
 * BackupShowScreen — display the 24-word recovery phrase right after
 * a wallet is created. The user is expected to write it down before
 * tapping continue; the next screen verifies they actually did.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import PrimaryButton from '../../components/PrimaryButton';
import { getMnemonic } from '../../services/wallet';

interface Props {
  onContinue: () => void;
}

export default function BackupShowScreen({ onContinue }: Props) {
  const { t } = useTranslation();
  const [mnemonic, setMnemonic] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    void (async () => {
      setMnemonic(await getMnemonic());
    })();
  }, []);

  const words = (mnemonic ?? '').split(' ');

  return (
    <div className="flex flex-col h-full overflow-y-auto safe-top safe-bottom"
         style={{ backgroundColor: 'var(--color-bg)' }}>
      <div className="flex flex-col flex-1 px-6 pb-6">
        <h1 className="text-2xl font-bold mt-6 mb-1.5" style={{ color: 'var(--color-text)' }}>
          {t('backup.showTitle', 'Write down your recovery phrase')}
        </h1>
        <p className="text-sm leading-relaxed mb-4"
           style={{ color: 'var(--color-text-body)' }}>
          {t('backup.showBody',
             'These 24 words are the only way to recover your wallet if you lose this device. '
             + 'Anyone with them can spend your funds. Write them down on paper and keep them somewhere safe — never in a photo, screenshot, or cloud note.')}
        </p>

        <div className="rounded-xl p-4 mb-3 relative"
             style={{ backgroundColor: 'var(--color-surface)',
                      border: '1px solid var(--color-border)' }}>
          {!revealed && (
            <button type="button" onClick={() => setRevealed(true)}
                    className="absolute inset-0 flex items-center justify-center rounded-xl"
                    style={{ backgroundColor: 'var(--color-surface)',
                             color: 'var(--color-text-muted)', fontWeight: 600 }}>
              {t('backup.tapToReveal', 'Tap to reveal — only you should see this')}
            </button>
          )}
          <div className="grid grid-cols-2 gap-x-3 gap-y-2"
               style={{ filter: revealed ? 'none' : 'blur(6px)' }}>
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

        <div className="rounded-xl p-3 mb-4 text-xs leading-relaxed"
             style={{ backgroundColor: 'var(--color-accent-soft)',
                      border: '1px solid var(--color-accent-dim)',
                      color: 'var(--color-text-body)' }}>
          {t('backup.warning',
             'FutureChain cannot help you recover this phrase if it is lost. Your wallet, your responsibility.')}
        </div>

        <PrimaryButton onClick={onContinue} disabled={!revealed}>
          {t('backup.continueToVerify', 'I have written it down — continue')}
        </PrimaryButton>
      </div>
    </div>
  );
}
