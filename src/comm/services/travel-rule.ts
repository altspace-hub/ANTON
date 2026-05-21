/**
 * travel-rule.ts — EU Travel Rule (Regulation (EU) 2023/1113) +
 * GDPR data-minimisation enforcement for the PACS.008 envelope.
 *
 * The two regulators have OPPOSING pressures we need to balance:
 *
 *   Travel Rule (in force 30 Dec 2024) — for crypto-asset transfers
 *   between CASPs, every transfer must carry originator + beneficiary
 *   info. Where a self-hosted address sends to/from a CASP and the
 *   amount exceeds €1,000, the CASP must verify control of the self-
 *   hosted address. EBA/GL/2024/11 names full address as the
 *   expected field set above threshold.
 *
 *   GDPR Art. 5(1)(c) (data minimisation) — personal data collected
 *   must be "adequate, relevant and limited to what is necessary".
 *   For sub-threshold P2P self-custody transfers there is no legal
 *   obligation to carry full address; doing so is over-collection.
 *
 * Two-tier resolution:
 *   Above the threshold → enforce full Dbtr/Cdtr (name + country +
 *     street + city + postcode). Sign is blocked if profile incomplete.
 *   Below the threshold → name + country only. Address fields are
 *     OMITTED from the PACS.008 even when the user has them filled.
 *
 * EU 2019/518 threshold for euro cross-border charges is €1,000 —
 * we use the same number for the Travel Rule fork because it's
 * consistent with the EBA self-hosted-wallet verification guidance
 * and the FATF Recommendation 16 traditional-wire threshold.
 *
 * The fiat conversion uses the SIGNING-time rate (services/fx.ts).
 * When no live rate is available (current state until Bahnhof's
 * oracle is online), we default to "treat as above threshold" — the
 * conservative posture. Better to over-collect by user-consented
 * Settings completion than miss the obligation.
 */
import type { Quote } from './fx';

/** EU Travel Rule threshold — EUR 1000. Mirrors EBA/GL/2024/11
 *  Guideline 8 + FATF Recommendation 16's traditional-wire EUR/USD
 *  1000 cutoff. Cross-currency: the test converts the tx amount to
 *  EUR at the signing rate; if no EUR rate is available we
 *  conservatively treat the tx as above-threshold. */
export const TRAVEL_RULE_THRESHOLD_EUR = 1000;

export type TravelRuleTier = 'minimal' | 'full' | 'no-rate-conservative';

/** Decide which PACS.008 disclosure tier this amount sits in. */
export function travelRuleTierFor(
  amountMicroFtc: bigint,
  eurQuote: Quote | null,
): TravelRuleTier {
  if (!eurQuote) {
    // No live EUR rate → assume above threshold so we DON'T silently
    // under-disclose for what could be a € 10,000 transfer. The user
    // can complete their profile to unblock signing.
    return 'no-rate-conservative';
  }
  const ftc = Number(amountMicroFtc) / 1_000_000;
  const eur = ftc * eurQuote.fiatPerFtc;
  return eur >= TRAVEL_RULE_THRESHOLD_EUR ? 'full' : 'minimal';
}

export interface IdentityFieldStatus {
  hasName: boolean;
  hasCountry: boolean;
  hasStreet: boolean;
  hasCity: boolean;
  hasPostcode: boolean;
}

/** Profile-completeness check for the full-disclosure tier. */
export function fullDisclosureReady(s: IdentityFieldStatus): boolean {
  return s.hasName && s.hasCountry && s.hasStreet && s.hasCity && s.hasPostcode;
}

export function minimalDisclosureReady(s: IdentityFieldStatus): boolean {
  return s.hasName && s.hasCountry;
}

/** Friendly summary of what's missing — used by the ReviewScreen's
 *  "complete your profile to send >€1000" banner. */
export function missingFields(s: IdentityFieldStatus): string[] {
  const out: string[] = [];
  if (!s.hasName) out.push('name');
  if (!s.hasCountry) out.push('country');
  if (!s.hasStreet) out.push('street');
  if (!s.hasCity) out.push('city');
  if (!s.hasPostcode) out.push('postcode');
  return out;
}
