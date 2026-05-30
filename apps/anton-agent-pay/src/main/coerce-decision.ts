/**
 * coerce-decision.ts — normalise the raw IPC payload from the modal
 * renderer into a trusted ModalDecision.
 *
 * Extracted from electron-modal.ts so it can be unit-tested without the
 * Electron runtime. Security-critical: an unrecognised/malformed payload
 * must NEVER coerce to `approve` (fail closed → reject).
 */
import type { ModalDecision } from '../shared/ipc-types.js';

export function coerceDecision(raw: unknown): ModalDecision {
  if (raw && typeof raw === 'object' && 'kind' in raw) {
    const k = (raw as { kind?: string }).kind;
    if (k === 'approve') {
      // Carry the passphrase through when the renderer supplied one for a
      // passphrase-protected wallet — dropping it makes signing fail.
      const pass = (raw as { passphrase?: unknown }).passphrase;
      return typeof pass === 'string' && pass.length > 0
        ? { kind: 'approve', passphrase: pass }
        : { kind: 'approve' };
    }
    if (k === 'reject') {
      const reason = String((raw as { reason?: unknown }).reason ?? 'rejected');
      return { kind: 'reject', reason };
    }
  }
  // Malformed payload from renderer (shouldn't happen — preload is
  // trusted code) — treat as Reject so we never silently approve.
  return { kind: 'reject', reason: 'malformed renderer response' };
}
