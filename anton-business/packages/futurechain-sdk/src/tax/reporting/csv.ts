/**
 * reporting/csv.ts — adviser-friendly CSV formatters.
 *
 * Two layouts:
 *   - buildK4Csv(): one row per K4 disposal, suitable for handing to
 *     a Swedish tax adviser to populate the K4 form.
 *   - buildLedgerCsv(): one row per transaction in the engine input,
 *     for cross-jurisdiction adviser review (everything the engine
 *     considered, not just disposals).
 *
 * Both formatters prepend the §3 disclaimer as a comment block so an
 * adviser opening the file in Excel sees the legal framing first. We
 * refuse to render without a disclaimer — that's a hard rule per
 * § 2.2 + § 3 of FUTURECHAIN_TAX_RULES.md.
 */
import type { K4Dataset } from './k4.js';
import { MissingDisclaimerError } from '../disclaimer.js';
import type { TaxComputationResult } from '../engine.js';

/** K4 section D CSV. Column names in English so any bookkeeping
 *  spreadsheet imports it cleanly; Swedish field-name comment in the
 *  preamble for context. */
export function buildK4Csv(dataset: K4Dataset): string {
  if (!dataset.disclaimer || dataset.disclaimer.trim() === '') {
    throw new MissingDisclaimerError();
  }

  const preamble: string[] = [
    `# ANTON Tax · K4 section D · Sweden`,
    `# Tax year: ${dataset.taxYear}`,
    `# Rule version: ${dataset.ruleVersion}`,
    `# Generated: ${new Date().toISOString()}`,
    `#`,
    // Comment-prefix every disclaimer line so a CSV reader keeps it
    // out of the data rows.
    ...wrapForComment(dataset.disclaimer),
    `#`,
  ];

  if (dataset.reviewReasons.length > 0) {
    preamble.push(`# REVIEW FLAGS:`);
    for (const r of dataset.reviewReasons) {
      preamble.push(`#   ${r}`);
    }
    preamble.push('#');
  }

  preamble.push(
    `# Skatteverket field mapping:`,
    `#   antal_beteckning  → Antal / beteckning`,
    `#   forsaljningspris  → Försäljningspris`,
    `#   omkostnadsbelopp  → Omkostnadsbelopp`,
    `#   vinst             → Vinst`,
    `#   forlust           → Förlust`,
    `#`,
  );

  const header = [
    'row_kind',
    'date',
    'antal_beteckning',
    'forsaljningspris',
    'omkostnadsbelopp',
    'vinst',
    'forlust',
    'source_tx_ids',
  ].join(',');

  const rows: string[] = [];
  for (const r of dataset.rows) {
    rows.push([
      'disposal',
      r.date,
      csvEscape(r.description),
      r.proceedsSek.toFixed(2),
      r.costBasisSek.toFixed(2),
      r.gainSek.toFixed(2),
      r.lossSek.toFixed(2),
      csvEscape(r.sourceTxIds.join('|')),
    ].join(','));
  }

  // Aggregate row + totals as their own sections so an Excel pivot
  // can filter on `row_kind`.
  rows.push([
    'aggregate',
    dataset.aggregate.date,
    csvEscape(dataset.aggregate.description),
    dataset.aggregate.proceedsSek.toFixed(2),
    dataset.aggregate.costBasisSek.toFixed(2),
    dataset.aggregate.gainSek.toFixed(2),
    dataset.aggregate.lossSek.toFixed(2),
    csvEscape(dataset.aggregate.sourceTxIds.join('|')),
  ].join(','));

  // Skatteverket-relevant totals at the foot. row_kind=summary so it
  // doesn't accidentally aggregate with disposals.
  rows.push([
    'summary',
    `${dataset.taxYear}-12-31`,
    csvEscape('Gross gains (Vinst, before 70%)'),
    '',
    '',
    dataset.totals.grossGainsSek.toFixed(2),
    '',
    '',
  ].join(','));
  rows.push([
    'summary',
    `${dataset.taxYear}-12-31`,
    csvEscape('Gross losses (Förlust, before 70%)'),
    '',
    '',
    '',
    dataset.totals.grossLossesSek.toFixed(2),
    '',
  ].join(','));
  rows.push([
    'summary',
    `${dataset.taxYear}-12-31`,
    csvEscape('Deductible losses (70% rule)'),
    '',
    '',
    '',
    dataset.totals.deductibleLossesSek.toFixed(2),
    '',
  ].join(','));
  rows.push([
    'summary',
    `${dataset.taxYear}-12-31`,
    csvEscape('Net taxable (engine output)'),
    '',
    '',
    dataset.totals.netTaxableSek.toFixed(2),
    '',
    '',
  ].join(','));
  rows.push([
    'summary',
    `${dataset.taxYear}-12-31`,
    csvEscape('Estimated tax at 30%'),
    '',
    '',
    dataset.totals.estimatedTaxSek.toFixed(2),
    '',
    '',
  ].join(','));

  return [
    ...preamble,
    header,
    ...rows,
    '',
  ].join('\n');
}

/** Cross-jurisdiction transaction ledger. One row per engine input
 *  entry. Used as the §8.3 "still exportable" raw data when the
 *  jurisdiction is unsupported. */
export function buildLedgerCsv(result: TaxComputationResult): string {
  if (!result.disclaimer || result.disclaimer.trim() === '') {
    throw new MissingDisclaimerError();
  }

  const preamble: string[] = [
    `# ANTON Tax · per-disposal ledger · ${result.jurisdictionName} (${result.jurisdictionCode})`,
    `# Rule version: ${result.ruleVersion}`,
    `# Generated: ${new Date().toISOString()}`,
    `#`,
    ...wrapForComment(result.disclaimer),
    `#`,
  ];

  if (result.reviewReasons.length > 0) {
    preamble.push(`# REVIEW FLAGS:`);
    for (const r of result.reviewReasons) preamble.push(`#   ${r}`);
    preamble.push('#');
  }

  const header = [
    'tx_id',
    'date_iso',
    'asset',
    'amount_atomic',
    'proceeds_fiat',
    'cost_basis_fiat',
    'gain_loss_fiat',
    'effective_gain_loss_fiat',
    'long_term',
    'acquired_ts',
    'tax_at_rate',
    'fiat_currency',
  ].join(',');

  const rows = result.perTransaction.map((e) =>
    [
      e.txId,
      new Date(e.ts).toISOString(),
      'FTC',
      e.amountAtomic,
      e.proceedsFiat.toFixed(6),
      e.costBasisFiat.toFixed(6),
      e.gainLossFiat.toFixed(6),
      e.effectiveGainLossFiat.toFixed(6),
      e.longTerm ? '1' : '0',
      e.acquiredTs ? new Date(e.acquiredTs).toISOString() : '',
      e.taxFiat.toFixed(6),
      e.fiatCurrency,
    ].join(','),
  );

  return [...preamble, header, ...rows, ''].join('\n');
}

function csvEscape(s: string): string {
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

/** Wrap a disclaimer paragraph as `# `-prefixed comment lines. */
function wrapForComment(disclaimer: string, width = 78): string[] {
  const words = disclaimer.split(/\s+/);
  const lines: string[] = [];
  let line = '# ';
  for (const w of words) {
    if ((line + w).length > width) {
      lines.push(line);
      line = '# ' + w + ' ';
    } else {
      line += w + ' ';
    }
  }
  if (line.trim() !== '#') lines.push(line.trimEnd());
  return lines;
}
