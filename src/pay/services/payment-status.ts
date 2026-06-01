/**
 * payment-status.ts — presentation helpers for the PaymentRecord
 * status lifecycle.
 *
 * PaymentRecord.status moves through recorded | submitting | queued |
 * accepted | confirmed | failed (see types.ts). PaymentDoneScreen
 * already renders a rich full-screen view of this via its local
 * `statusView`; this module is the small, reusable counterpart for the
 * compact status PILL shown on every history row and in the detail
 * screen's Status section.
 *
 * Pure logic, no I/O, no React — the colour comes from the CSS custom
 * properties in app.css and the label is an i18n key with an English
 * fallback so other locales fall back gracefully.
 */
import type { PaymentStatus } from './types';

/** A status pill's visual + textual descriptor. `tone` selects the
 *  colour family; the consumer maps it to the concrete CSS vars. */
export interface StatusPillView {
  /** Colour family. confirmed=success, in-flight=accent (pending),
   *  failed=danger, recorded=muted local-only receipt. */
  tone: 'success' | 'accent' | 'danger' | 'muted';
  /** i18n key for the short pill label. */
  labelKey: string;
  /** English fallback for the label (other locales fall back to this). */
  labelFallback: string;
}

/**
 * Map a payment status to a compact pill descriptor.
 *   - confirmed                       → success ("Confirmed")
 *   - submitting / queued / accepted  → accent  ("Pending")
 *   - failed                          → danger  ("Failed")
 *   - recorded                        → muted   ("Recorded")
 */
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
