/**
 * profile.ts — the customer's local profile.
 *
 * A private person needs almost nothing configured, so this is a thin
 * store: just the SEK estimate rate and a "configured" marker. Held in
 * the tier-aware secure-store alongside the wallet.
 *
 * Forward-compat: profiles written before a field existed backfill it
 * on read.
 */
import { getSecure, removeSecure, setSecure } from './secure-store';
import type { PayProfile } from './types';

const KEY = 'fc.pay.profile';
const DEFAULT_FTC_PER_SEK = 0.1;

export async function loadProfile(): Promise<PayProfile | null> {
  const raw = await getSecure(KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PayProfile>;
    return {
      configuredAt: parsed.configuredAt ?? Date.now(),
      ftcPerSek: parsed.ftcPerSek ?? DEFAULT_FTC_PER_SEK,
    };
  } catch {
    return null;
  }
}

export async function saveProfile(profile: PayProfile): Promise<void> {
  await setSecure(KEY, JSON.stringify(profile));
}

export async function hasProfile(): Promise<boolean> {
  return (await getSecure(KEY)) !== null;
}

export async function wipeProfile(): Promise<void> {
  await removeSecure(KEY);
}

/** A fresh profile with default settings — written when the customer
 *  creates their wallet during onboarding. */
export function createDefaultProfile(): PayProfile {
  return {
    configuredAt: Date.now(),
    ftcPerSek: DEFAULT_FTC_PER_SEK,
  };
}
