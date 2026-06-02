/**
 * payment-status.ts — presentation helpers for the WalletTx send lifecycle.
 *
 * Ported from src/pay/services/payment-status.ts (#79 wallet parity). Pure logic,
 * no I/O, no React; the colour comes from CSS vars and the label is an i18n key
 * with an English fallback. PaymentStatus lives on WalletTx (transactions.ts).
 */
import type { PaymentStatus } from './transactions';

export interface StatusPillView {
  /** Colour family. confirmed=success, in-flight=accent, failed=danger,
   *  recorded=muted local-only receipt. */
  tone: 'success' | 'accent' | 'danger' | 'muted';
  labelKey: string;
  labelFallback: string;
}

export function statusPillView(s: PaymentStatus): StatusPillView {
  switch (s) {
    case 'confirmed':
      return { tone: 'success', labelKey: 'status.confirmed', labelFallback: 'Confirmed' };
    case 'submitting':
      return { tone: 'accent', labelKey: 'status.submitting', labelFallback: 'Submitting' };
    case 'queued':
    case 'accepted':
      return { tone: 'accent', labelKey: 'status.pending', labelFallback: 'Pending' };
    case 'failed':
      return { tone: 'danger', labelKey: 'status.failed', labelFallback: 'Failed' };
    case 'recorded':
    default:
      return { tone: 'muted', labelKey: 'status.recorded', labelFallback: 'Recorded' };
  }
}
