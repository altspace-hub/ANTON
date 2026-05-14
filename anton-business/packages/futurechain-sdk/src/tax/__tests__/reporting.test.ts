/**
 * reporting.test.ts — K4 dataset + CSV formatters.
 *
 * Covers §8.4 reporting requirement for SE: round-trip txs through
 * the engine, build the K4 dataset, render the CSV, check disclaimer
 * is preserved + columns are correct + totals match the engine.
 */
import { describe, expect, it } from 'vitest';
import { computeTaxPosition, type TaxComputationResult } from '../engine.js';
import { MissingDisclaimerError } from '../disclaimer.js';
import {
  buildK4Csv,
  buildK4Dataset,
  buildLedgerCsv,
} from '../reporting/index.js';
import { SE } from '../rules/index.js';
import type { TaxInputTx } from '../transaction.js';

function tx(over: Partial<TaxInputTx> & Pick<TaxInputTx, 'id' | 'ts' | 'kind' | 'amount' | 'fiatValueAtTx'>): TaxInputTx {
  return { decimals: 6, fiatCurrency: 'SEK', ...over };
}

function seFixture(): TaxComputationResult {
  // Two acquisitions + two disposals — one gain, one loss.
  const r = computeTaxPosition({
    rule: SE,
    transactions: [
      tx({ id: 'a1', ts: Date.UTC(2026, 0, 10), kind: 'buy_with_fiat', amount: '10000000', fiatValueAtTx: 1000 }),
      tx({ id: 's1', ts: Date.UTC(2026, 2, 15), kind: 'spend',          amount: '4000000', fiatValueAtTx: 600 }),
      tx({ id: 'a2', ts: Date.UTC(2026, 5, 1),  kind: 'buy_with_fiat', amount: '5000000', fiatValueAtTx: 1000 }),
      tx({ id: 's2', ts: Date.UTC(2026, 8, 20), kind: 'sell_to_fiat',   amount: '5000000', fiatValueAtTx: 500 }),
    ],
  });
  if ('refused' in r) throw new Error('expected ok result');
  return r as TaxComputationResult;
}

describe('buildK4Dataset', () => {
  it('emits one row per disposal + a yearly aggregate', () => {
    const ds = buildK4Dataset(seFixture());
    expect(ds.jurisdictionCode).toBe('SE');
    expect(ds.rows).toHaveLength(2);
    // First disposal: 4 FTC of an avg-100/FTC pool sold for 600 → gain 200
    expect(ds.rows[0]!.gainSek).toBeCloseTo(200, 2);
    expect(ds.rows[0]!.lossSek).toBe(0);
    expect(ds.rows[0]!.description).toContain('4.000000 FTC');
    // Aggregate carries the year's totals
    expect(ds.aggregate.description).toContain('agg. 2 disposals');
    expect(ds.aggregate.proceedsSek).toBeCloseTo(1100, 2);
  });

  it('rounds to 2 decimal places per Skatteverket convention', () => {
    const ds = buildK4Dataset(seFixture());
    for (const r of [...ds.rows, ds.aggregate]) {
      expect(Number.isInteger(r.proceedsSek * 100)).toBe(true);
      expect(Number.isInteger(r.costBasisSek * 100)).toBe(true);
      expect(Number.isInteger(r.gainSek * 100)).toBe(true);
      expect(Number.isInteger(r.lossSek * 100)).toBe(true);
    }
  });

  it('exposes gross losses + deductible losses + net taxable separately', () => {
    const ds = buildK4Dataset(seFixture());
    // Second disposal: 5 FTC from avg ~133/FTC pool sold for 500
    // pool after first disposal: 6 FTC, 600 basis, avg 100
    // then 5 more @ 1000 → 11 FTC, 1600, avg 145.45
    // sell 5 → cost 727.27, loss 227.27
    expect(ds.totals.grossLossesSek).toBeCloseTo(227.27, 2);
    expect(ds.totals.deductibleLossesSek).toBeCloseTo(227.27 * 0.70, 2);
    // Engine's net taxable: gains 200 − deductible 159.09 = 40.91
    expect(ds.totals.netTaxableSek).toBeCloseTo(40.91, 2);
    // Tax: 30% of 40.91
    expect(ds.totals.estimatedTaxSek).toBeCloseTo(12.27, 2);
  });

  it('throws MissingDisclaimerError when the engine result has no disclaimer', () => {
    const ok = seFixture();
    expect(() => buildK4Dataset({ ...ok, disclaimer: '' })).toThrow(MissingDisclaimerError);
    expect(() => buildK4Dataset({ ...ok, disclaimer: '   ' })).toThrow(MissingDisclaimerError);
  });

  it('rejects non-SE jurisdictions', () => {
    const ok = seFixture();
    expect(() => buildK4Dataset({ ...ok, jurisdictionCode: 'US' })).toThrow(/Sweden-only/);
  });

  it('handles an empty-year correctly', () => {
    const r = computeTaxPosition({ rule: SE, transactions: [] }) as TaxComputationResult;
    const ds = buildK4Dataset(r, { taxYear: 2026 });
    expect(ds.rows).toHaveLength(0);
    expect(ds.aggregate.description).toBe('FTC (no disposals this year)');
    expect(ds.aggregate.proceedsSek).toBe(0);
    expect(ds.aggregate.date).toBe('2026-12-31');
    expect(ds.totals.netTaxableSek).toBe(0);
  });
});

describe('buildK4Csv', () => {
  it('preserves the §3 disclaimer in the comment preamble', () => {
    const csv = buildK4Csv(buildK4Dataset(seFixture()));
    expect(csv.startsWith('# ANTON Tax · K4 section D · Sweden')).toBe(true);
    // The disclaimer text from the engine should appear in the preamble.
    expect(csv).toContain('not tax advice');
    expect(csv).toContain('FutureChain AB');
  });

  it('emits the right column header', () => {
    const csv = buildK4Csv(buildK4Dataset(seFixture()));
    expect(csv).toContain(
      'row_kind,date,antal_beteckning,forsaljningspris,omkostnadsbelopp,vinst,forlust,source_tx_ids',
    );
  });

  it('includes per-disposal + aggregate + 5 summary rows', () => {
    const csv = buildK4Csv(buildK4Dataset(seFixture()));
    const dataRows = csv.split('\n').filter((l) => l && !l.startsWith('#') && !l.startsWith('row_kind'));
    // 2 disposals + 1 aggregate + 5 summary rows
    expect(dataRows).toHaveLength(8);
    expect(dataRows.filter((l) => l.startsWith('disposal,'))).toHaveLength(2);
    expect(dataRows.filter((l) => l.startsWith('aggregate,'))).toHaveLength(1);
    expect(dataRows.filter((l) => l.startsWith('summary,'))).toHaveLength(5);
  });

  it('surfaces review-flag reasons in the preamble', () => {
    const csv = buildK4Csv(buildK4Dataset(seFixture()));
    expect(csv).toContain('REVIEW FLAGS');
    expect(csv).toContain('emt_classification_not_tested_at_skatterattsnamnden');
  });

  it('CSV-escapes descriptions with commas/quotes', () => {
    const ds = buildK4Dataset(seFixture());
    ds.rows[0]!.description = 'Sale, FTC "lot"';
    const csv = buildK4Csv(ds);
    expect(csv).toContain('"Sale, FTC ""lot"""');
  });
});

describe('buildLedgerCsv', () => {
  it('emits one row per per-tx engine entry with the disclaimer in the preamble', () => {
    const r = seFixture();
    const csv = buildLedgerCsv(r);
    expect(csv).toContain('not tax advice');
    expect(csv).toContain('tx_id,date_iso,asset,amount_atomic,proceeds_fiat');
    const dataRows = csv.split('\n').filter((l) => l && !l.startsWith('#') && !l.startsWith('tx_id'));
    expect(dataRows).toHaveLength(r.perTransaction.length);
    expect(dataRows[0]!).toContain('FTC');
    expect(dataRows[0]!).toContain('SEK');
  });

  it('throws MissingDisclaimerError when the input lacks one', () => {
    const r = seFixture();
    expect(() => buildLedgerCsv({ ...r, disclaimer: '' })).toThrow(MissingDisclaimerError);
  });
});
