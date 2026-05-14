/**
 * wealth-tax.ts — Box 3 / wealth-tax computation path.
 *
 * Unlike the transaction-based engine (which tracks disposals and
 * matches against cost-basis), wealth-tax computes on the year-end
 * balance:
 *
 *   tax = max(0, balance − allowance) × deemedReturnRate × boxRate
 *
 * Netherlands Box 3 is the canonical case. Switzerland's cantonal
 * wealth tax has a similar shape (but the rates vary by canton — not
 * modelled here in v1).
 *
 * The balance is derived from the tx stream: at the year-end timestamp
 * (or the last tx of the year), sum receives − sends. The host's
 * adapter converts atomic units to fiat using the year-end exchange
 * rate, which the engine receives via the disposal/acquisition
 * fiatValueAtTx fields.
 *
 * v1 simplification: balance is the sum of FTC fiat values across the
 * year, in the assumption that the rate hasn't drifted significantly
 * between transactions. A proper rate-oracle integration lands in a
 * later phase.
 */
import { buildDisclaimer, type DisclaimerLocale } from './disclaimer.js';
import type {
  JurisdictionRule,
  WealthTaxParams,
} from './schema.js';
import type { TaxInputTx } from './transaction.js';

export interface WealthTaxInput {
  rule: JurisdictionRule;
  transactions: TaxInputTx[];
  /** Optional explicit year-end balance in local fiat. If absent,
   *  derived from the tx stream (sum receives − sends, valued at
   *  the running fiat-per-atomic at year end). */
  yearEndBalanceFiat?: number;
  /** §3 disclaimer locale. */
  locale?: DisclaimerLocale;
  /** §2.2 adviser-referral threshold. */
  adviserReferralThresholdFiat?: number;
}

export interface WealthTaxResult {
  jurisdictionCode: string;
  jurisdictionName: string;
  /** Year-end balance in local fiat, before allowance. */
  yearEndBalanceFiat: number;
  /** Wealth allowance applied (e.g. NL's ~€57k). */
  allowanceApplied: number;
  /** Balance after allowance — the deemed-return base. */
  taxableBalanceFiat: number;
  /** Deemed return on the taxable base. */
  deemedReturnFiat: number;
  /** Final tax = deemedReturn × boxRate. */
  estimatedTaxFiat: number;
  /** ISO 4217 currency code. */
  fiatCurrency: string;
  /** §3 mandatory disclaimer — always populated. */
  disclaimer: string;
  /** ISO date of the rule's last_verified. */
  ruleVersion: string;
  /** Review-required flags. */
  reviewRequired: boolean;
  reviewReasons: string[];
}

export function isWealthTaxResult(r: unknown): r is WealthTaxResult {
  return typeof r === 'object' && r !== null
    && 'deemedReturnFiat' in (r as Record<string, unknown>);
}

export function computeWealthTaxPosition(input: WealthTaxInput): WealthTaxResult {
  const rule = input.rule;
  if (rule.taxation_model !== 'wealth' || !rule.wealth_tax_params) {
    throw new Error(
      `computeWealthTaxPosition called on ${rule.jurisdiction_code} which is ` +
      `not configured for wealth-tax computation.`,
    );
  }

  const params: WealthTaxParams = rule.wealth_tax_params;
  const fiatCurrency = pickFiatCurrency(input.transactions);

  const yearEndBalanceFiat = input.yearEndBalanceFiat ?? deriveYearEndBalance(input.transactions);
  const allowanceApplied = Math.min(yearEndBalanceFiat, params.allowance);
  const taxableBalanceFiat = Math.max(0, yearEndBalanceFiat - params.allowance);
  const deemedReturnFiat = taxableBalanceFiat * params.deemed_return_rate;
  const estimatedTaxFiat = deemedReturnFiat * params.box_rate;

  const threshold = input.adviserReferralThresholdFiat ?? Number.POSITIVE_INFINITY;
  const reasons: string[] = [];
  if (estimatedTaxFiat > threshold) reasons.push(`estimated_tax_above_threshold_${threshold}`);
  if (rule.metadata.confidence !== 'high') reasons.push(`rule_confidence_${rule.metadata.confidence}`);
  if (rule.metadata.review_flags.length > 0) {
    reasons.push(...rule.metadata.review_flags.map((f) => `review_flag_${f}`));
  }

  return {
    jurisdictionCode: rule.jurisdiction_code,
    jurisdictionName: rule.jurisdiction_name,
    yearEndBalanceFiat,
    allowanceApplied,
    taxableBalanceFiat,
    deemedReturnFiat,
    estimatedTaxFiat,
    fiatCurrency,
    disclaimer: buildDisclaimer({
      jurisdictionName: rule.jurisdiction_name,
      lastVerified: rule.metadata.last_verified,
      locale: input.locale,
    }),
    ruleVersion: rule.metadata.last_verified,
    reviewRequired: reasons.length > 0,
    reviewReasons: reasons,
  };
}

/** Derive year-end balance from the tx stream — sum of fiat-valued
 *  receives minus fiat-valued sends. Stake rewards / airdrops add;
 *  fees subtract. */
function deriveYearEndBalance(txs: TaxInputTx[]): number {
  let balance = 0;
  for (const tx of txs) {
    switch (tx.kind) {
      case 'buy_with_fiat':
      case 'receive_as_payment':
      case 'gift_received':
      case 'stake_reward':
      case 'airdrop':
      case 'mining_reward':
      case 'refund_received':
        balance += tx.fiatValueAtTx;
        break;
      case 'sell_to_fiat':
      case 'spend':
      case 'gift_sent':
      case 'refund_sent':
      case 'fee':
        balance -= tx.fiatValueAtTx;
        break;
      case 'swap':
        // Crypto-to-crypto swap doesn't change the holdings' fiat value
        // at the moment of the swap (we exchange one asset for another
        // at equivalent value). Skip.
        break;
    }
  }
  return Math.max(0, balance);
}

function pickFiatCurrency(txs: TaxInputTx[]): string {
  return txs[0]?.fiatCurrency ?? 'EUR';
}
