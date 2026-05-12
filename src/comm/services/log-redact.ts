/**
 * log-redact.ts — tiny redact helpers used to stop contact hashes /
 * pubkeys / lat-lng from leaking into Logcat via console.warn calls.
 *
 * Adb logcat is readable by any local debug tool and by Android-platform
 * OEM logging pipelines. Even on an E2E-encrypted app we don't want to
 * spray identifiers into that bucket. The redact helpers preserve enough
 * for a developer to correlate ("ANTON…XYZW") without revealing the
 * whole hash.
 */

/** Shorten an ANTON-XXXX-XXXX-XXXX-XXXX hash to ANTON-…-XXXX (last 4). */
export function redactHash(s: string | undefined | null): string {
  if (!s) return '∅';
  const m = /^ANTON-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-([A-HJ-NP-Z2-9]{4})$/.exec(s);
  if (m) return `ANTON-…-${m[1]}`;
  if (s.length > 8) return `${s.slice(0, 3)}…${s.slice(-3)}`;
  return s;
}

/** Round lat/lng to ~10km precision so a debug log can't pin the user. */
export function redactCoord(n: number): string {
  if (!Number.isFinite(n)) return '?';
  return n.toFixed(1);
}

/** No-op outside DEV. Use for diagnostics that would otherwise leak PII. */
export function devLog(label: string, ...args: unknown[]): void {
  // import.meta.env is the Vite convention. In Capacitor builds DEV is
  // false, so these calls vaporise at runtime.
  if (typeof import.meta !== 'undefined' && (import.meta as { env?: { DEV?: boolean } }).env?.DEV) {
    console.warn(label, ...args);
  }
}
