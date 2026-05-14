/**
 * reporting/k4.ts — Sweden Skatteverket K4 section D dataset.
 *
 * K4 is Skatteverket's "redovisning av delavyttringar av övriga
 * tillgångar". Section D handles "övrig egendom" — the bucket FTC
 * lands in per FUTURECHAIN_TAX_RULES.md §6.1 SE classification.
 *
 * The form takes one row per disposal (or one row per asset
 * aggregated for the year — Skatteverket accepts both). Each row
 * carries five fields:
 *   1. Antal / beteckning   (number of units, asset name)
 *   2. Försäljningspris     (sale proceeds in SEK)
 *   3. Omkostnadsbelopp     (cost basis in SEK)
 *   4. Vinst                (gain — proceeds − cost, when positive)
 *   5. Förlust              (loss — cost − proceeds, when positive)
 *
 * The 70% deductibility (§6.1 + loss-treatment) is applied at the
 * declaration level, not on the form itself — Skatteverket computes
 * it from the totals. We surface the *gross* numbers per row and the
 * *netted* totals at the bottom so the user's adviser can see both
 * intermediates.
 *
 * Output is structured-only; the CSV/HTML formatters in ./csv.ts and
 * ./html.ts render it. We never produce a definitive "submit me to
 * Skatteverket" file — per §2.1 every output is framed as estimated /
 * pre-filing draft.
 */
import type { TaxComputationResult } from '../engine.js';
import { MissingDisclaimerError } from '../disclaimer.js';

/** One K4 section D row. */
export interface K4Row {
  /** Skatteverket field: Antal / beteckning. We emit one of:
   *   - "<n> FTC"                (per-disposal mode)
   *   - "FTC (agg. <n> disposals)" (aggregated mode)
   *  where n is the unit count to two decimals. */
  description: string;
  /** Försäljningspris in SEK. */
  proceedsSek: number;
  /** Omkostnadsbelopp in SEK. */
  costBasisSek: number;
  /** Vinst — populated when proceeds > cost. */
  gainSek: number;
  /** Förlust — populated when cost > proceeds. */
  lossSek: number;
  /** Disposal date (ISO yyyy-mm-dd) — Skatteverket accepts this as
   *  the per-row date. For aggregated rows we use the last disposal
   *  in the bucket. */
  date: string;
  /** Reference to the original txId(s) — informational, not part of
   *  the K4 form. */
  sourceTxIds: string[];
}

export interface K4Dataset {
  jurisdictionCode: 'SE';
  taxYear: number;
  /** Per-disposal rows — what an adviser scrutinizes. */
  rows: K4Row[];
  /** Aggregated FTC line for the form's "summarized" entry mode. */
  aggregate: K4Row;
  /** Totals — gross gains, gross losses, and the netted Sweden-70%
   *  number the engine produced. */
  totals: {
    grossGainsSek: number;
    grossLossesSek: number;
    deductibleLossesSek: number;
    netTaxableSek: number;
    estimatedTaxSek: number;
  };
  /** § 3 disclaimer text — verbatim from the engine result. */
  disclaimer: string;
  /** ISO date when the rule block was last verified. */
  ruleVersion: string;
  /** Any review flags the engine surfaced — written into the CSV
   *  preamble so the adviser sees the same context the user did. */
  reviewReasons: string[];
}

export interface K4BuildOptions {
  /** Defaults to current calendar year. */
  taxYear?: number;
  /** ISO 4217 — only 'SEK' supported for K4. */
  fiatCurrency?: 'SEK';
}

/** Build the structured K4 dataset from an engine result.
 *
 *  Throws MissingDisclaimerError if the result lacks the §3
 *  disclaimer text — that's a hard rule per the spec and we
 *  refuse to build the dataset without it.
 */
export function buildK4Dataset(
  result: TaxComputationResult,
  options: K4BuildOptions = {},
): K4Dataset {
  if (result.jurisdictionCode !== 'SE') {
    throw new Error(
      `K4 is Sweden-only. Got jurisdiction code ${result.jurisdictionCode}.`,
    );
  }
  if (!result.disclaimer || result.disclaimer.trim() === '') {
    throw new MissingDisclaimerError();
  }
  const ccy = options.fiatCurrency ?? 'SEK';
  if (result.annual.fiatCurrency !== ccy) {
    throw new Error(
      `K4 expects SEK. Engine returned ${result.annual.fiatCurrency}.`,
    );
  }

  const taxYear = options.taxYear ?? inferTaxYear(result);

  const rows: K4Row[] = result.perTransaction.map((entry) => {
    const proceeds = entry.proceedsFiat;
    const cost = entry.costBasisFiat;
    const isoDate = new Date(entry.ts).toISOString().slice(0, 10);
    const wholeFtc = atomicToWholeFtc(entry.amountAtomic);
    return {
      description: `${wholeFtc.toFixed(6)} FTC`,
      proceedsSek: round2(proceeds),
      costBasisSek: round2(cost),
      gainSek: proceeds > cost ? round2(proceeds - cost) : 0,
      lossSek: cost > proceeds ? round2(cost - proceeds) : 0,
      date: isoDate,
      sourceTxIds: [entry.txId],
    };
  });

  // Aggregate — one line representing the whole year's FTC activity.
  // Date = last disposal of the year (or empty if none).
  const lastTs = result.perTransaction.reduce((m, e) => Math.max(m, e.ts), 0);
  const totalFtc = result.perTransaction.reduce(
    (sum, e) => sum + atomicToWholeFtc(e.amountAtomic),
    0,
  );
  const grossGains = result.annual.totalGainsFiat;
  const grossLosses = result.annual.totalLossesFiat;
  const aggregateProceeds = result.perTransaction.reduce((s, e) => s + e.proceedsFiat, 0);
  const aggregateCost = result.perTransaction.reduce((s, e) => s + e.costBasisFiat, 0);

  const aggregate: K4Row = {
    description: rows.length > 0
      ? `FTC (agg. ${rows.length} disposal${rows.length === 1 ? '' : 's'}, ${totalFtc.toFixed(6)} units)`
      : 'FTC (no disposals this year)',
    proceedsSek: round2(aggregateProceeds),
    costBasisSek: round2(aggregateCost),
    gainSek: aggregateProceeds > aggregateCost ? round2(aggregateProceeds - aggregateCost) : 0,
    lossSek: aggregateCost > aggregateProceeds ? round2(aggregateCost - aggregateProceeds) : 0,
    date: lastTs > 0 ? new Date(lastTs).toISOString().slice(0, 10) : `${taxYear}-12-31`,
    sourceTxIds: result.perTransaction.map((e) => e.txId),
  };

  // Sweden's 70% rule: deductibleLosses = grossLosses * 0.70 (the
  // engine already nets this in netTaxableGainsFiat). We surface the
  // intermediate for adviser inspection.
  const deductibleLosses = grossLosses * 0.70;

  return {
    jurisdictionCode: 'SE',
    taxYear,
    rows,
    aggregate,
    totals: {
      grossGainsSek: round2(grossGains),
      grossLossesSek: round2(grossLosses),
      deductibleLossesSek: round2(deductibleLosses),
      netTaxableSek: round2(result.annual.netTaxableGainsFiat),
      estimatedTaxSek: round2(result.annual.estimatedTaxFiat),
    },
    disclaimer: result.disclaimer,
    ruleVersion: result.ruleVersion,
    reviewReasons: result.reviewReasons,
  };
}

function inferTaxYear(result: TaxComputationResult): number {
  if (result.perTransaction.length === 0) return new Date().getUTCFullYear();
  // Use the year of the most-recent disposal in the result.
  const lastTs = Math.max(...result.perTransaction.map((e) => e.ts));
  return new Date(lastTs).getUTCFullYear();
}

function atomicToWholeFtc(atomic: string): number {
  // FTC is micro-denominated (6 decimals) per ADR-004.
  return Number(BigInt(atomic)) / 1_000_000;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
