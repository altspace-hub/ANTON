/**
 * tax-residency.ts — the user's declared tax residency.
 *
 * Per FUTURECHAIN_TAX_RULES.md §7.1: residency is *declared by the
 * user*, never inferred from IP. Stored on-device only; never sent to
 * a server in any flow.
 *
 *   1. On first use, ask: "What country are you a tax resident of?"
 *   2. Store the declaration with a timestamp.
 *   3. Re-confirm annually or when behaviour shifts substantially.
 *   4. Multi-residency users get referred out (the spec is explicit
 *      that Anton does not compute split-jurisdiction tax).
 *
 * The Comm App's secure-store is the persistence layer — same
 * tier-aware (native Keystore → AES-GCM-wrapped IDB → memory) story
 * as the wallet key.
 */
import { getSecure, removeSecure, setSecure } from './secure-store';

const KEY = 'fc.tax.residency';

/** Re-confirm the declaration if it's older than this many days. */
export const REVERIFY_AFTER_DAYS = 365;

export interface TaxResidency {
  /** ISO 3166-1 alpha-2. */
  jurisdictionCode: string;
  /** Display name shown back to the user when re-confirming. */
  jurisdictionName: string;
  /** Unix-ms when the declaration was made. */
  declaredAt: number;
  /** §7.1: re-confirm annually. This is the next prompt date. */
  reverifyAt: number;
}

export async function loadResidency(): Promise<TaxResidency | null> {
  const raw = await getSecure(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TaxResidency;
  } catch {
    return null;
  }
}

export async function saveResidency(
  jurisdictionCode: string,
  jurisdictionName: string,
): Promise<TaxResidency> {
  const now = Date.now();
  const record: TaxResidency = {
    jurisdictionCode: jurisdictionCode.toUpperCase(),
    jurisdictionName,
    declaredAt: now,
    reverifyAt: now + REVERIFY_AFTER_DAYS * 24 * 60 * 60 * 1000,
  };
  await setSecure(KEY, JSON.stringify(record));
  return record;
}

export async function clearResidency(): Promise<void> {
  await removeSecure(KEY);
}

/** True if the user has never declared OR the annual re-verify
 *  window has elapsed. Drives the prompt-on-mount flow. */
export async function needsResidencyPrompt(): Promise<boolean> {
  const r = await loadResidency();
  if (!r) return true;
  return Date.now() >= r.reverifyAt;
}
