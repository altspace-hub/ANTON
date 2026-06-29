/**
 * coerce-decision.ts — normalize an untrusted decision object into a strict
 * ModalDecision, FAIL-CLOSED. Any shape that isn't an explicit, well-formed
 * approve becomes a reject. Used by the web-confirm driver so a malformed /
 * tampered POST body can never accidentally approve an agreement.
 *
 * Unlike Agent Pay's coerceDecision there is NO passphrase: a collab agreement
 * approval never unlocks a wallet (settlement is gated again, separately, in
 * Agent Pay).
 */
import type { ModalDecision } from './modal.js';

export function coerceDecision(raw: unknown): ModalDecision {
  if (raw && typeof raw === 'object' && 'kind' in raw) {
    const k = (raw as { kind?: unknown }).kind;
    if (k === 'approve') return { kind: 'approve' };
    if (k === 'reject') {
      const reason = (raw as { reason?: unknown }).reason;
      return { kind: 'reject', reason: typeof reason === 'string' && reason ? reason : 'rejected' };
    }
  }
  return { kind: 'reject', reason: 'malformed response' };
}
