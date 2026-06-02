/**
 * PaymentTypeBadge — compact coloured chip for a PaymentRecord's sender
 * classification (Payment / Gift / Information / Contract). Rendered on sent
 * history rows next to the StatusPill and in the payment-detail view.
 *
 * Mirrors StatusPill: tone → CSS-var colour mapping here; the type → tone +
 * label mapping lives in services/payment-type.ts so it stays pure. Only
 * outgoing payments carry a type — callers guard on `record.paymentType`.
 */
import { useTranslation } from 'react-i18next';
import { paymentTypeMeta, type PaymentType, type PaymentTypeMeta } from '../services/payment-type';

/** tone → { background, foreground } CSS custom properties. */
function toneColors(tone: PaymentTypeMeta['toneKey']): { bg: string; fg: string } {
  switch (tone) {
    case 'success':
      return { bg: 'var(--color-success-bg)', fg: 'var(--color-success)' };
    case 'accent':
      return { bg: 'var(--color-accent-soft)', fg: 'var(--color-accent)' };
    case 'muted':
    default:
      return { bg: 'var(--color-surface-alt)', fg: 'var(--color-text-muted)' };
  }
}

export default function PaymentTypeBadge({ type }: { type: PaymentType }) {
  const { t } = useTranslation();
  const meta = paymentTypeMeta(type);
  const c = toneColors(meta.toneKey);
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap"
      style={{ backgroundColor: c.bg, color: c.fg }}
    >
      {t(meta.labelKey, meta.labelFallback)}
    </span>
  );
}
