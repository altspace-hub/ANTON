/**
 * money-profile.ts — the Comm user's self-declared money profile.
 *
 * A personal, on-device baseline: who the user is and what their
 * normal money pattern looks like. It is NOT regulated KYC and NOT
 * sanctions screening (Heimdall does that at the node) — it is the
 * yardstick the light fraud engine (a later phase) compares each new
 * payment against, so the app can flag what looks unusual *for you*.
 *
 * Entirely self-declared, held in the tier-aware secure-store, never
 * transmitted by this app.
 */
import { getSecure, removeSecure, setSecure } from './secure-store';

const KEY = 'fc.comm.money-profile';

/** Where the user's money mainly comes from. */
export type SourceOfFunds =
  | 'salary'
  | 'business'
  | 'savings'
  | 'investments'
  | 'pension'
  | 'gift'
  | 'other';

export const SOURCE_OF_FUNDS: readonly SourceOfFunds[] = [
  'salary', 'business', 'savings', 'investments', 'pension', 'gift', 'other',
];

export interface MoneyProfile {
  // ── Identity ──────────────────────────────────────────────
  /** ISO 8601 date 'YYYY-MM-DD', or '' if not declared. */
  dateOfBirth: string;
  /** ISO 3166-1 alpha-2 country code, or '' if not declared. */
  nationality: string;
  /** Free-text occupation. */
  occupation: string;
  // ── Money & spending ──────────────────────────────────────
  /** Where the user's funds mainly come from. '' if not declared. */
  sourceOfFunds: SourceOfFunds | '';
  /** Expected total FTC spent per month. 0 = not declared. */
  expectedMonthlyFtc: number;
  /** Typical single-payment size in FTC. 0 = not declared. */
  typicalPaymentFtc: number;
  /** Epoch ms the profile was last saved. */
  updatedAt: number;
}

/** A blank profile — the form's starting point. */
export function emptyMoneyProfile(): MoneyProfile {
  return {
    dateOfBirth: '',
    nationality: '',
    occupation: '',
    sourceOfFunds: '',
    expectedMonthlyFtc: 0,
    typicalPaymentFtc: 0,
    updatedAt: 0,
  };
}

function sanitiseNumber(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export async function loadMoneyProfile(): Promise<MoneyProfile | null> {
  const raw = await getSecure(KEY);
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Partial<MoneyProfile>;
    return {
      dateOfBirth: p.dateOfBirth ?? '',
      nationality: p.nationality ?? '',
      occupation: p.occupation ?? '',
      sourceOfFunds: (SOURCE_OF_FUNDS as readonly string[]).includes(p.sourceOfFunds ?? '')
        ? (p.sourceOfFunds as SourceOfFunds)
        : '',
      expectedMonthlyFtc: sanitiseNumber(p.expectedMonthlyFtc),
      typicalPaymentFtc: sanitiseNumber(p.typicalPaymentFtc),
      updatedAt: p.updatedAt ?? 0,
    };
  } catch {
    return null;
  }
}

export async function saveMoneyProfile(profile: MoneyProfile): Promise<void> {
  await setSecure(KEY, JSON.stringify({ ...profile, updatedAt: Date.now() }));
}

/** True once the user has declared at least one money-pattern
 *  figure — enough for the fraud engine to have a baseline. */
export async function hasMoneyProfile(): Promise<boolean> {
  const p = await loadMoneyProfile();
  return p !== null && (p.expectedMonthlyFtc > 0 || p.typicalPaymentFtc > 0);
}

export async function wipeMoneyProfile(): Promise<void> {
  await removeSecure(KEY);
}
