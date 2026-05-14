/**
 * merchant.ts — local merchant configuration store.
 *
 * Same surface as the original Expo merchant.ts; switched from
 * expo-secure-store to the tier-aware secure-store wrapper. Native:
 * Android Keystore / iOS Keychain. Desktop browser: IndexedDB +
 * AES-GCM (non-extractable). Memory fallback for SSR/test.
 *
 * Forward-compat: configs written before ftcPerSek + lastBackupAt
 * existed backfill those fields on read. Same migration semantics as
 * the original.
 */
import { getSecure, removeSecure, setSecure } from './secure-store';
import type { MerchantConfig } from './types';

export type { MerchantConfig } from './types';

const KEY = 'fc.merchant.config';
const DEFAULT_FTC_PER_SEK = 0.1;

export async function loadConfig(): Promise<MerchantConfig | null> {
  const raw = await getSecure(KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<MerchantConfig>;
    return {
      ...(parsed as MerchantConfig),
      ftcPerSek: parsed.ftcPerSek ?? DEFAULT_FTC_PER_SEK,
      lastBackupAt: parsed.lastBackupAt ?? 0,
      // Pre-defaultMode configs default to 'simple' on read so older
      // onboarding flows keep working without a re-onboard.
      defaultMode: parsed.defaultMode ?? 'simple',
      safelloReceiveAddress: parsed.safelloReceiveAddress ?? '',
    };
  } catch {
    return null;
  }
}

export async function saveConfig(config: MerchantConfig): Promise<void> {
  await setSecure(KEY, JSON.stringify(config));
}

export async function hasConfig(): Promise<boolean> {
  return (await getSecure(KEY)) !== null;
}

export async function wipeConfig(): Promise<void> {
  await removeSecure(KEY);
}

/** Bump the kvitto counter and return the just-used number. Caller
 *  passes the existing config in to avoid a read-modify-write race. */
export async function consumeKvittoNumber(config: MerchantConfig): Promise<number> {
  const current = config.nextKvittoNumber;
  await saveConfig({ ...config, nextKvittoNumber: current + 1 });
  return current;
}
