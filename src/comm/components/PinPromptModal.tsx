/**
 * PinPromptModal — in-app payment-PIN dialog.
 *
 *   - 'create' — first use on a device with no usable biometric: pick a PIN +
 *     confirm it. Resolves with the chosen PIN; the host stores it.
 *   - 'enter'  — a PIN exists: type it to authorize. The host verifies; a wrong
 *     attempt is signalled by bumping `attemptFailures` (5-attempt back-off).
 *
 * Resolves the host promise with the entered PIN, or null on cancel.
 *
 * Ported verbatim from src/pay/components/PinPromptModal.tsx (#79 wallet parity).
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import PrimaryButton from './PrimaryButton';
import { PIN_MIN_LEN, PIN_MAX_LEN, isValidPinShape } from '../services/payment-pin';

interface Props {
  mode: 'create' | 'enter';
  reason?: string;
  onSubmit: (pin: string) => void;
  onCancel: () => void;
  attemptFailures: number;
}

const MAX_ATTEMPTS = 5;
const BACKOFF_MS = [1000, 2000, 4000, 8000, 16000];

export default function PinPromptModal({
  mode, reason, onSubmit, onCancel, attemptFailures,
}: Props) {
  const { t } = useTranslation();
  const isCreate = mode === 'create';
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [localError, setLocalError] = useState('');
  const [waitUntil, setWaitUntil] = useState(0);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (attemptFailures === 0) return;
    setPin('');
    setConfirm('');
    const idx = Math.min(attemptFailures - 1, BACKOFF_MS.length - 1);
    setWaitUntil(Date.now() + BACKOFF_MS[idx]!);
  }, [attemptFailures]);

  useEffect(() => {
    if (waitUntil <= now) return;
    const tmr = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(tmr);
  }, [waitUntil, now]);

  const secondsLeft = useMemo(
    () => Math.max(0, Math.ceil((waitUntil - now) / 1000)),
    [waitUntil, now],
  );
  const locked = secondsLeft > 0;
  const exhausted = attemptFailures >= MAX_ATTEMPTS;

  function submit() {
    setLocalError('');
    if (!isValidPinShape(pin)) {
      setLocalError(t('paymentPin.invalid', 'PIN must be {{min}}–{{max}} digits.',
        { min: PIN_MIN_LEN, max: PIN_MAX_LEN }));
      return;
    }
    if (isCreate && pin !== confirm) {
      setLocalError(t('paymentPin.mismatch', 'The two PINs do not match.'));
      return;
    }
    onSubmit(pin);
  }

  const fieldStyle = {
    backgroundColor: 'var(--color-surface-muted)',
    color: 'var(--color-text)',
    border: '1px solid var(--color-border)',
    letterSpacing: '0.3em',
  } as const;

  const canSubmit = !locked && !exhausted
    && pin.length >= PIN_MIN_LEN
    && (!isCreate || confirm.length >= PIN_MIN_LEN);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pin-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
    >
      <div
        className="w-full max-w-md mx-3 mb-3 sm:mb-0 rounded-2xl p-6 flex flex-col gap-4"
        style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
      >
        <div>
          <h2 id="pin-title" className="text-lg font-bold" style={{ color: 'var(--color-text)' }}>
            {isCreate
              ? t('paymentPin.createTitle', 'Set a payment PIN')
              : t('paymentPin.enterTitle', 'Enter payment PIN')}
          </h2>
          <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
            {reason ?? (isCreate
              ? t('paymentPin.createReason', 'Choose a PIN to approve payments on this device — no fingerprint is available here.')
              : t('paymentPin.enterReason', 'Confirm this payment with your PIN.'))}
          </p>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wider" style={{ color: 'var(--color-text-faint)' }}>
            {isCreate ? t('paymentPin.newLabel', 'New PIN') : t('paymentPin.label', 'PIN')}
          </span>
          <input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            maxLength={PIN_MAX_LEN}
            value={pin}
            disabled={locked || exhausted}
            onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, ''))}
            onKeyDown={(e) => { if (e.key === 'Enter' && !isCreate && canSubmit) submit(); }}
            className="rounded-lg px-3 py-2.5 text-base text-center"
            style={fieldStyle}
            aria-invalid={attemptFailures > 0 || !!localError}
          />
        </label>

        {isCreate ? (
          <label className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wider" style={{ color: 'var(--color-text-faint)' }}>
              {t('paymentPin.confirmLabel', 'Confirm PIN')}
            </span>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={PIN_MAX_LEN}
              value={confirm}
              disabled={locked || exhausted}
              onChange={(e) => setConfirm(e.target.value.replace(/[^0-9]/g, ''))}
              onKeyDown={(e) => { if (e.key === 'Enter' && canSubmit) submit(); }}
              className="rounded-lg px-3 py-2.5 text-base text-center"
              style={fieldStyle}
            />
          </label>
        ) : null}

        {localError ? (
          <p className="text-sm" style={{ color: 'var(--color-error)' }}>{localError}</p>
        ) : null}

        {!isCreate && attemptFailures > 0 && !exhausted ? (
          <p className="text-sm" style={{ color: 'var(--color-error)' }}>
            {locked
              ? t('paymentPin.wrongWait', 'Wrong PIN. Try again in {{seconds}}s. ({{remaining}} left)',
                  { seconds: secondsLeft, remaining: MAX_ATTEMPTS - attemptFailures })
              : t('paymentPin.wrong', 'Wrong PIN. {{remaining}} attempts left.',
                  { remaining: MAX_ATTEMPTS - attemptFailures })}
          </p>
        ) : null}
        {exhausted ? (
          <p className="text-sm" style={{ color: 'var(--color-error)' }}>
            {t('paymentPin.exhausted', 'Too many wrong attempts. Cancel and try again later.')}
          </p>
        ) : null}

        <div className="flex flex-col gap-2 mt-2">
          <PrimaryButton onClick={submit} disabled={!canSubmit} marginTopAuto={false}>
            {isCreate ? t('paymentPin.save', 'Set PIN & pay') : t('paymentPin.confirm', 'Confirm & pay')}
          </PrimaryButton>
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2.5 rounded-lg text-sm font-semibold"
            style={{ backgroundColor: 'transparent', color: 'var(--color-text-muted)' }}
          >
            {t('common.cancel', 'Cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
