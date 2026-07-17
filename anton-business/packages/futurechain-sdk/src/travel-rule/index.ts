/**
 * @futurechain/sdk/travel-rule — EU Travel Rule (Regulation (EU) 2023/1113) +
 * GDPR data-minimisation resolver for the PACS.008 envelope.
 *
 * A pure, deterministic policy module (no I/O) — the same "deterministic engine"
 * shape as the Risk Atlas and the light fraud engine. It answers two questions:
 *   1. Which disclosure tier does this transfer sit in? (amount vs the €1,000
 *      Travel-Rule threshold, converted at the signing-time rate)
 *   2. Is the sender's identity profile complete enough for that tier?
 *
 * The two regulators pull in OPPOSITE directions and this module balances them:
 *
 *   Travel Rule (in force 30 Dec 2024) — crypto-asset transfers between CASPs
 *   must carry originator + beneficiary info; above €1,000 a self-hosted address
 *   must be verified. EBA/GL/2024/11 names full address as the field set above
 *   threshold.
 *
 *   GDPR Art. 5(1)(c) (data minimisation) — personal data must be "adequate,
 *   relevant and limited to what is necessary". For sub-threshold P2P
 *   self-custody transfers there is no obligation to carry full address; doing so
 *   is over-collection.
 *
 * Two-tier resolution:
 *   Above the threshold → full Dbtr/Cdtr (name + country + street + city +
 *     postcode). Signing is blocked if the profile is incomplete.
 *   Below the threshold → name + country only; address fields are OMITTED from
 *     the PACS.008 even when the user has them filled.
 *
 * EU 2019/518's €1,000 euro cross-border-charges figure is reused for the
 * Travel-Rule fork — consistent with the EBA self-hosted-wallet verification
 * guidance and FATF Recommendation 16's traditional-wire threshold.
 *
 * The fiat conversion uses the SIGNING-time rate. When no live rate is available
 * (the current state until the node's oracle is online) the resolver defaults to
 * "treat as above threshold" — the conservative posture. Better to over-collect
 * by user-consented profile completion than to miss the obligation.
 *
 * 2026-07-17: promoted here from the byte-identical per-app copies in ANTON Pay,
 * Comm and Business (src/{pay,comm,business}/services/travel-rule.ts). The FX
 * rate is a STRUCTURAL input — an app's fuller `Quote` type satisfies the
 * read-only `TravelRuleFxRate` shape by duck typing.
 */

const MICRO_PER_FTC = 1_000_000;

/** EU Travel Rule threshold — EUR 1000. Mirrors EBA/GL/2024/11 Guideline 8 +
 *  FATF Recommendation 16's traditional-wire EUR/USD 1000 cutoff. Cross-currency:
 *  the test converts the tx amount to EUR at the signing rate; if no EUR rate is
 *  available we conservatively treat the tx as above-threshold. */
export const TRAVEL_RULE_THRESHOLD_EUR = 1000;

export type TravelRuleTier = 'minimal' | 'full' | 'no-rate-conservative';

/** The single FX field the resolver reads: fiat units per 1 FTC. An app's
 *  fuller `Quote` (from its fx service) structurally satisfies this. */
export interface TravelRuleFxRate {
  fiatPerFtc: number;
}

/** Decide which PACS.008 disclosure tier this amount sits in. */
export function travelRuleTierFor(
  amountMicroFtc: bigint,
  eurQuote: TravelRuleFxRate | null,
): TravelRuleTier {
  if (!eurQuote) {
    // No live EUR rate → assume above threshold so we DON'T silently
    // under-disclose for what could be a € 10,000 transfer. The user
    // can complete their profile to unblock signing.
    return 'no-rate-conservative';
  }
  const ftc = Number(amountMicroFtc) / MICRO_PER_FTC;
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

/** Friendly summary of what's missing — used by the review screen's
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
