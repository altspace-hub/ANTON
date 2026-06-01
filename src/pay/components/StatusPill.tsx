/**
 * StatusPill — compact coloured chip for a PaymentRecord's lifecycle
 * status. Rendered on history rows and in the payment-detail Status
 * section. Tone → CSS-var colour mapping lives here; the status →
 * tone mapping lives in services/payment-status.ts so it stays pure.
 *
 * Only outgoing payments carry a status; inbound (received) rows are
 * always on-chain confirmed by the time we observe them, so callers
 * pass a status only for the 'sent' direction.
 */
import { useTranslation } from 'react-i18next';
import { statusPillView, type StatusPillView } from '../services/payment-status';
import type { PaymentStatus } from '../services/types';

/** tone → { background, foreground } CSS custom properties. */
function toneColors(tone: StatusPillView['tone']): { bg: string; fg: string } {
  switch (tone) {
    case 'success':
      return { bg: 'var(--color-success-bg)', fg: 'var(--color-success)' };
    case 'accent':
      return { bg: 'var(--color-accent-soft)', fg: 'var(--color-accent)' };
    case 'danger':
      return { bg: 'var(--color-error-bg)', fg: 'var(--color-error)' };
    case 'muted':
    default:
      return { bg: 'var(--color-surface-alt)', fg: 'var(--color-text-muted)' };
  }
}

export default function StatusPill({ status }: { status: PaymentStatus }) {
  const { t } = useTranslation();
  const view = statusPillView(status);
  const c = toneColors(view.tone);
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap"
      style={{ backgroundColor: c.bg, color: c.fg }}
    >
      {t(view.labelKey, view.labelFallback)}
    </span>
  );
}
