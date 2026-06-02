/**
 * PaymentTypeBadge — compact coloured chip for a WalletTx's sender
 * classification (Payment / Gift / Information / Contract). Rendered on sent
 * rows in the wallet history.
 *
 * Comm's palette has no success/danger tones, so the taxable default
 * 'payment' takes the accent highlight and the exempt types are muted gray —
 * the label distinguishes Gift / Information / Contract. The type → tone +
 * label mapping lives in services/payment-type.ts so it stays pure.
 */
import { useTranslation } from 'react-i18next';
import { paymentTypeMeta, type PaymentType, type PaymentTypeMeta } from '../services/payment-type';

function toneColors(tone: PaymentTypeMeta['toneKey']): { bg: string; fg: string } {
  switch (tone) {
    case 'success': // 'payment' — the taxable default
      return { bg: 'var(--color-accent-soft)', fg: 'var(--color-accent)' };
    case 'accent':  // 'gift'
      return { bg: 'var(--color-surface-alt)', fg: 'var(--color-text-body)' };
    case 'muted':   // 'information' / 'contract'
    default:
      return { bg: 'var(--color-surface-muted)', fg: 'var(--color-text-muted)' };
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
