/**
 * PassphrasePromptModal — wallet-passphrase entry dialog.
 *
 * Spec: docs/PAY_WALLET_PASSPHRASE_SPEC.md §3.4 B.
 *
 * Resolves the supplied promise with the entered passphrase when the
 * user submits, or with null when they cancel / close. The host is
 * responsible for VALIDATING the passphrase (this component does NOT
 * try the unlock itself — that keeps the modal generic and lets the
 * caller treat a wrong attempt as one of the 5 budgeted retries).
 *
 * After `MAX_ATTEMPTS` consecutive `onError` invocations the submit
 * button is disabled for an exponentially-growing back-off window
 * (1s → 2s → 4s → 8s → 16s, then 16s ceiling) to stop a shoulder-
 * surfer from running a fast brute force inside the app.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import PrimaryButton from './PrimaryButton';

interface Props {
  /** Title text — defaults to "Wallet passphrase". */
  title?: string;
  /** Optional subtitle for context, e.g. "Confirm to sign this payment". */
  reason?: string;
  /** Called when the user submits an entered passphrase. */
  onSubmit: (passphrase: string) => void;
  /** Called when the user cancels or closes the modal. */
  onCancel: () => void;
  /** When the caller has tried to unlock with the last entered
   *  passphrase and it was wrong, it should call `onErrorSeed++` (i.e.
   *  bump this counter) — the modal uses that as the canonical
   *  attempt-failed signal and clears the input + advances the back-off. */
  attemptFailures: number;
}

const MAX_ATTEMPTS = 5;
const BACKOFF_MS = [1000, 2000, 4000, 8000, 16000];

export default function PassphrasePromptModal({
  title, reason, onSubmit, onCancel, attemptFailures,
}: Props) {
  const { t } = useTranslation();
  const [value, setValue] = useState('');
  const [waitUntil, setWaitUntil] = useState<number>(0);
  const [now, setNow] = useState<number>(Date.now());

  // Whenever attemptFailures bumps, clear the input + start back-off.
  useEffect(() => {
    if (attemptFailures === 0) return;
    setValue('');
    const idx = Math.min(attemptFailures - 1, BACKOFF_MS.length - 1);
    setWaitUntil(Date.now() + BACKOFF_MS[idx]!);
  }, [attemptFailures]);

  // 1Hz tick so the "wait Ns" hint counts down visibly.
  useEffect(() => {
    if (waitUntil <= now) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [waitUntil, now]);

  const secondsLeft = useMemo(
    () => Math.max(0, Math.ceil((waitUntil - now) / 1000)),
    [waitUntil, now],
  );
  const locked = secondsLeft > 0;
  const exhausted = attemptFailures >= MAX_ATTEMPTS;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="passphrase-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
    >
      <div
        className="w-full max-w-md mx-3 mb-3 sm:mb-0 rounded-2xl p-6 flex flex-col gap-4"
        style={{
          backgroundColor: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
        }}
      >
        <div>
          <h2
            id="passphrase-title"
            className="text-lg font-bold"
            style={{ color: 'var(--color-text)' }}
          >
            {title ?? t('passphrase.title', 'Wallet passphrase')}
          </h2>
          {reason ? (
            <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
              {reason}
            </p>
          ) : null}
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wider"
                style={{ color: 'var(--color-text-faint)' }}>
            {t('passphrase.label', 'Passphrase')}
          </span>
          <input
            type="password"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            inputMode="text"
            value={value}
            disabled={locked || exhausted}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && value && !locked && !exhausted) {
                onSubmit(value);
              }
            }}
            className="rounded-lg px-3 py-2.5 text-base"
            style={{
              backgroundColor: 'var(--color-surface-muted)',
              color: 'var(--color-text)',
              border: '1px solid var(--color-border)',
            }}
            aria-invalid={attemptFailures > 0}
            aria-describedby={attemptFailures > 0 ? 'passphrase-error' : undefined}
          />
        </label>

        {attemptFailures > 0 && !exhausted ? (
          <p
            id="passphrase-error"
            className="text-sm"
            style={{ color: 'var(--color-error)' }}
          >
            {locked
              ? t('passphrase.wrongWait',
                  'Wrong passphrase. Try again in {{seconds}}s. ({{remaining}} attempts left)',
                  {
                    seconds: secondsLeft,
                    remaining: MAX_ATTEMPTS - attemptFailures,
                  })
              : t('passphrase.wrong',
                  'Wrong passphrase. {{remaining}} attempts left.',
                  { remaining: MAX_ATTEMPTS - attemptFailures })}
          </p>
        ) : null}
        {exhausted ? (
          <p className="text-sm" style={{ color: 'var(--color-error)' }}>
            {t('passphrase.exhausted',
              'Too many wrong attempts. Cancel and try again later, or restore from your 24-word recovery phrase.')}
          </p>
        ) : null}

        <div className="flex flex-col gap-2 mt-2">
          <PrimaryButton
            onClick={() => onSubmit(value)}
            disabled={!value || locked || exhausted}
            marginTopAuto={false}
          >
            {t('passphrase.unlock', 'Unlock')}
          </PrimaryButton>
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2.5 rounded-lg text-sm font-semibold"
            style={{
              backgroundColor: 'transparent',
              color: 'var(--color-text-muted)',
            }}
          >
            {t('common.cancel', 'Cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
