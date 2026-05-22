/**
 * LockScreen — full-screen biometric gate shown when the app-open
 * lock is active (see services/app-lock.ts).
 *
 * On mount it fires the OS biometric prompt immediately, so an
 * enrolled merchant just sees Face ID / fingerprint and is straight
 * in. The prompt falls back to the device PIN / pattern.
 *
 * Failure handling:
 *   • cancelled / failed → stay locked, show a "Unlock" retry button.
 *   • unavailable (device has no biometric AND no device lock) → let
 *     the user through. An app lock can't be stronger than the device
 *     itself, and trapping a merchant out of their own till would be
 *     worse than the missing gate.
 *   • On the web/dev shell requireBiometric resolves ok+skipped, so
 *     the lock auto-opens — dev UX is unaffected.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Logo from './Logo';
import { requireBiometric } from '../services/biometric';

export default function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const { t } = useTranslation();
  const [checking, setChecking] = useState(true);
  const [failed, setFailed] = useState(false);

  async function attempt() {
    setChecking(true);
    setFailed(false);
    const r = await requireBiometric({
      reason: t('lock.reason', 'Unlock ANTON Pay'),
      title: t('lock.title', 'ANTON Pay'),
    });
    setChecking(false);
    if (r.ok) { onUnlock(); return; }
    // A lock can't be stronger than the device — if there's nothing
    // to authenticate against, don't strand the merchant.
    if (r.reason === 'unavailable') { onUnlock(); return; }
    setFailed(true);
  }

  useEffect(() => { void attempt(); }, []);

  return (
    <div className="flex flex-col items-center justify-center h-full px-8 safe-top safe-bottom"
         style={{ backgroundColor: 'var(--color-bg)' }}>
      <Logo size={64} rounded="lg" />
      <h1 className="text-xl font-bold mt-5 mb-1" style={{ color: 'var(--color-text)' }}>
        {t('lock.title', 'ANTON Pay')}
      </h1>
      <p className="text-sm text-center mb-8" style={{ color: 'var(--color-text-muted)' }}>
        {checking
          ? t('lock.checking', 'Waiting for unlock…')
          : failed
            ? t('lock.failed', 'Unlock failed. Try again.')
            : t('lock.locked', 'Locked — unlock to continue.')}
      </p>
      <button type="button" onClick={() => void attempt()} disabled={checking}
              className="px-6 py-3 rounded-xl text-sm font-semibold"
              style={{
                backgroundColor: 'var(--color-accent)',
                color: 'var(--color-accent-fg)',
                opacity: checking ? 0.6 : 1,
              }}>
        {checking ? t('lock.checking', 'Waiting for unlock…') : t('lock.unlock', 'Unlock')}
      </button>
    </div>
  );
}
