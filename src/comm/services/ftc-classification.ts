/**
 * ftc-classification.ts — the user's declared FTC classification.
 *
 * Per FUTURECHAIN_TAX_RULES.md §7.2: the engine accepts a
 * `ftc_classification` flag (utility_token | emt) at compute time so
 * re-classification later doesn't require a rules rewrite. The
 * canonical example is Italy: 33% standard rate vs 26% with the
 * MiCA Title II EMT carve-out.
 *
 * Default: utility_token (conservative — applies the standard rate).
 * The user explicitly flips to emt when they believe FTC qualifies.
 * The TaxPositionScreen surfaces this so the user sees which
 * interpretation produced their numbers.
 *
 * Stored in secure-store on-device only.
 */
import type { tax } from '@futurechain/sdk';
import { getSecure, removeSecure, setSecure } from './secure-store';

const KEY = 'fc.tax.ftc_classification';

export type FtcClassification = tax.FtcClassification;

const DEFAULT: FtcClassification = 'utility_token';

export async function loadFtcClassification(): Promise<FtcClassification> {
  const raw = await getSecure(KEY);
  if (raw === 'emt' || raw === 'utility_token') return raw;
  return DEFAULT;
}

export async function saveFtcClassification(c: FtcClassification): Promise<void> {
  await setSecure(KEY, c);
}

export async function clearFtcClassification(): Promise<void> {
  await removeSecure(KEY);
}
