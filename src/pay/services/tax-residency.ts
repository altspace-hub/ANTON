/**
 * tax-residency.ts — the user's declared tax residency.
 *
 * Per FUTURECHAIN_TAX_RULES.md §7.1: residency is *declared by the
 * user*, never inferred from IP. Stored on-device only; never sent to
 * a server in any flow.
 *
 *   1. On first use (sign-up), ask: "What country are you a tax resident of?"
 *   2. Store the declaration with a timestamp.
 *   3. Re-confirm annually or when behaviour shifts substantially.
 *   4. Multi-residency users get referred out (the spec is explicit
 *      that Anton does not compute split-jurisdiction tax).
 *
 * Ported from src/comm/services/tax-residency.ts — Pay and Comm keep
 * per-app copies, matching the existing PayerIdentity / MoneyProfile
 * duplication. SDK extraction is tracked as a future cleanup.
 *
 * The Pay App's tier-aware secure-store (native Keystore → AES-GCM-wrapped
 * IDB → memory) is the persistence layer — same story as the wallet key.
 */
import { getSecure, removeSecure, setSecure } from './secure-store';
import { emptyPayerIdentity, type PayerIdentity } from './payment-identity';

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

/**
 * Seed the ISO 20022 debtor country from a freshly-declared tax country —
 * but ONLY when the identity's country is still empty or the hardcoded
 * 'SE' default, so a country the user deliberately set in Payment details
 * is never silently overwritten. Address fields are always preserved.
 *
 * Pure + synchronous so it's trivially unit-testable; callers persist the
 * returned identity with savePayerIdentity(). Run at sign-up only — the
 * Settings residency picker must NOT call this, otherwise a deliberate
 * Payment-details country could be clobbered on an annual re-declaration.
 */
export function seedIdentityCountry(
  existing: PayerIdentity | null,
  code: string,
): PayerIdentity {
  const base = existing ?? emptyPayerIdentity();
  const cur = (base.country || '').toUpperCase();
  if (cur && cur !== 'SE') return base; // user set a real country — leave it
  return { ...base, country: code.toUpperCase() };
}
