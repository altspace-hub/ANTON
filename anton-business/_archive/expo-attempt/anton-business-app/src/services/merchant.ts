/**
 * merchant.ts — local merchant configuration store.
 *
 * v2.0 phone-first model (CLAUDE_ANTON_BUSINESS.md): the merchant
 * doesn't register with any of our infrastructure. Their identity is
 * configured once at onboarding, stored on the device. The
 * `safelloReceiveAddress` is whatever Safello (or the merchant's own
 * sweep arrangement) tells them to use — that's what every QR code
 * will point at.
 *
 * Stored via `expo-secure-store` so a phone backup doesn't leak the
 * merchant's org-nr + addresses in plain. Light security but not
 * keychain-bound the way the wallet private key is.
 */
import * as SecureStore from 'expo-secure-store';

const KEY = 'fc.merchant.config';

export interface MerchantConfig {
  legalName: string;
  orgNr: string;
  city: string;
  street: string;
  postcode: string;
  vatRegistered: boolean;
  defaultVatRate: 0 | 6 | 12 | 25;
  /** Where customer payments land. May be the merchant's own
   *  ANTON-derived address OR a Safello-provided sweep address.
   *  Used as the `to` field in every QR. */
  safelloReceiveAddress: string;
  /** Optional default email for kvitto delivery. */
  kvittoEmail?: string;
  /** Monotonically increasing kvitto counter. Gap-free per
   *  Bokföringslagen 5 kap. */
  nextKvittoNumber: number;
  /** Unix ms timestamp of when the merchant first completed setup. */
  configuredAt: number;
  /** Merchant-configured FTC-per-SEK rate (v0 placeholder).
   *  1.0 means 1 SEK = 1 FTC. Lower means FTC is more valuable.
   *  Real implementation pulls from a rate oracle or live feed at QR
   *  generation time; v0 uses this static value the merchant edits in
   *  Settings. Defaulted to 0.1 (1 SEK = 0.1 FTC, i.e. 1 FTC = 10 SEK).
   *  Loaded configs without this field migrate to the default on next
   *  save via loadConfig(). */
  ftcPerSek: number;
  /** Unix ms timestamp of the most recent successful kvitto archive
   *  export. Drives the "back up your records" reminder banner on
   *  Home. 0 if never exported. Bookföringslagen 5 kap. requires
   *  7-year retention; this banner is a polite nudge, not a hard
   *  enforcement — the on-device SQLite store is the source of truth. */
  lastBackupAt: number;
}

const DEFAULT_FTC_PER_SEK = 0.1;

export async function loadConfig(): Promise<MerchantConfig | null> {
  const raw = await SecureStore.getItemAsync(KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<MerchantConfig>;
    // Forward-compat: older configs lack ftcPerSek. Backfill with the
    // default so callers always get a complete object.
    return {
      ...(parsed as MerchantConfig),
      ftcPerSek: parsed.ftcPerSek ?? DEFAULT_FTC_PER_SEK,
      lastBackupAt: parsed.lastBackupAt ?? 0,
    };
  } catch {
    return null;
  }
}

export async function saveConfig(config: MerchantConfig): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify(config));
}

export async function hasConfig(): Promise<boolean> {
  return (await SecureStore.getItemAsync(KEY)) !== null;
}

export async function wipeConfig(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY);
}

/** Bump the kvitto counter and return the just-used number. Atomic
 *  per-write — caller passes the existing config in to avoid a
 *  read-modify-write race. */
export async function consumeKvittoNumber(config: MerchantConfig): Promise<number> {
  const current = config.nextKvittoNumber;
  await saveConfig({ ...config, nextKvittoNumber: current + 1 });
  return current;
}
