/**
 * StatusPill — compact coloured chip for a WalletTx send lifecycle status.
 * Rendered on outbound history rows + the send-done screen. Only `send` rows
 * carry a status. Ported from src/pay/components/StatusPill.tsx (#79 parity).
 */
import { useTranslation } from 'react-i18next';
import { statusPillView, type StatusPillView } from '../services/payment-status';
import type { PaymentStatus } from '../services/transactions';

function toneColors(tone: StatusPillView['tone']): { bg: string; fg: string } {
  switch (tone) {
    case 'success':
      return { bg: 'var(--color-success-bg, var(--color-accent-soft))', fg: 'var(--color-success, var(--color-accent))' };
    case 'accent':
      return { bg: 'var(--color-accent-soft)', fg: 'var(--color-accent)' };
    case 'danger':
      return { bg: 'var(--color-red-dim)', fg: 'var(--color-red)' };
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
