/**
 * export-xlsx-cells.test.ts — two defects that made the .xlsx export look right and be
 * wrong. Both are worse than a crash: the file opens, so nobody checks it.
 *
 *  1. Every cell was written as TEXT. `ws.addRow(string[])` types the whole row as
 *     strings, so a budget or scoring sheet could not be summed, sorted or charted, and
 *     Excel flagged each cell with "number stored as text". That is most of the reason
 *     to export .xlsx rather than .md.
 *
 *  2. RAG conditional formatting was inverted on the common case. `detectRag` matched
 *     with a bare `startsWith`, so "Highly effective" hit the key `high` and was painted
 *     RED; "Reduced" hit `red`. And `high`/`low` had one fixed polarity, so every
 *     maturity, readiness and control-effectiveness matrix ANTON produces had its good
 *     half coloured red — a compliance tool confidently mis-signalling an assessment.
 *
 * The workbook is generated and read back with ExcelJS rather than asserting on the
 * helpers alone, because the defect was in how values reached the sheet, not in parsing.
 */
import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { generateXlsx, parseNumericCell } from '../../server/services/export-xlsx.js';

async function sheetFor(md: string, name: string): Promise<ExcelJS.Worksheet> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await generateXlsx(md, { title: 'T' }) as unknown as ArrayBuffer);
  const ws = wb.worksheets.find((w) => w.name.toLowerCase().startsWith(name.toLowerCase()));
  if (!ws) throw new Error(`no sheet ${name} in ${wb.worksheets.map((w) => w.name).join(', ')}`);
  return ws;
}

/** Find a data cell by the text of the row's first column. */
function cellAt(ws: ExcelJS.Worksheet, rowLabel: string, col: number): ExcelJS.Cell | undefined {
  let found: ExcelJS.Cell | undefined;
  ws.eachRow((row) => {
    if (String(row.getCell(1).value ?? '').trim() === rowLabel) found = row.getCell(col);
  });
  return found;
}

describe('numbers are written as numbers', () => {
  const md = `## Budget
| Item | Cost | Share | Count |
| --- | --- | --- | --- |
| Licences | 1,250.50 | 45% | 12 |
| Training | 800 | 30% | 4 |
`;

  it('stores a thousands-separated decimal as a number, not text', async () => {
    const ws = await sheetFor(md, 'Budget');
    const cell = cellAt(ws, 'Licences', 2)!;
    expect(typeof cell.value).toBe('number');
    expect(cell.value).toBe(1250.5);
  });

  it('stores a plain integer as a number', async () => {
    const ws = await sheetFor(md, 'Budget');
    expect(cellAt(ws, 'Training', 2)!.value).toBe(800);
  });

  it('makes the column summable — the whole point of the fix', async () => {
    const ws = await sheetFor(md, 'Budget');
    const vals = ['Licences', 'Training'].map((l) => cellAt(ws, l, 2)!.value as number);
    expect(vals.reduce((a, b) => a + b, 0)).toBeCloseTo(2050.5);
  });

  it('carries a number format so 1250.5 still displays as 1,250.50', async () => {
    const ws = await sheetFor(md, 'Budget');
    expect(cellAt(ws, 'Licences', 2)!.numFmt).toBe('#,##0.00');
  });

  it('stores a percentage as an Excel fraction with a percent format', async () => {
    // 45 with a '%' format would display as 4500%.
    const ws = await sheetFor(md, 'Budget');
    const cell = cellAt(ws, 'Licences', 3)!;
    expect(cell.value).toBeCloseTo(0.45);
    expect(cell.numFmt).toContain('%');
  });

  it('leaves the label column as text', async () => {
    const ws = await sheetFor(md, 'Budget');
    expect(typeof cellAt(ws, 'Licences', 1)!.value).toBe('string');
  });

  it('right-aligns numeric cells', async () => {
    const ws = await sheetFor(md, 'Budget');
    expect(cellAt(ws, 'Licences', 4)!.alignment?.horizontal).toBe('right');
  });
});

describe('parseNumericCell refuses anything that only looks numeric', () => {
  // Mis-typing an identifier is worse than leaving a number as text: it destroys data
  // silently. Each of these is a real shape that appears in ANTON output.
  it.each([
    ['007', 'leading zeros — an account or article number'],
    ['0123', 'leading zeros'],
    ['2026-07-28', 'ISO date would become a serial'],
    ['28/07/2026', 'written date'],
    ['1.2.3', 'version string'],
    ['1-5', 'a scoring range'],
    ['3/5', 'a ratio'],
    ['Article 16', 'a citation'],
    ['N/A', 'not a value'],
    ['', 'empty'],
    ['1.200', 'ambiguous separator: 1.2 in English, 1200 in German'],
    ['12.345', 'same ambiguity'],
  ])('leaves %s alone (%s)', (input) => {
    expect(parseNumericCell(input)).toBeNull();
  });

  it('still reads unambiguous European grouping', () => {
    // Both separators present, so the roles are pinned.
    expect(parseNumericCell('1.200,50')?.value).toBe(1200.5);
  });

  it('reads a leading-zero decimal, where the dot cannot be a group separator', () => {
    expect(parseNumericCell('0.500')?.value).toBe(0.5);
  });

  it.each([
    ['42', 42],
    ['-42', -42],
    ['1,250.50', 1250.5],
    ['(1,234)', -1234],
    ['0', 0],
    ['0.75', 0.75],
  ])('converts %s', (input, expected) => {
    expect(parseNumericCell(input)?.value).toBe(expected);
  });

  it('handles a currency amount and keeps the symbol in the format', () => {
    const out = parseNumericCell('€1,200');
    expect(out?.value).toBe(1200);
    expect(out?.numFmt).toContain('€');
  });
});

describe('RAG colouring respects what the column measures', () => {
  const GREEN = 'FF1A4731';
  const RED = 'FF4A1010';
  const fill = (c?: ExcelJS.Cell) => (c?.fill as ExcelJS.FillPattern | undefined)?.fgColor?.argb;

  it('paints "Highly effective" GREEN, not red — the reported bug', async () => {
    const md = `## Controls
| Control | Effectiveness |
| --- | --- |
| KYC | Highly effective |
`;
    const ws = await sheetFor(md, 'Controls');
    expect(fill(cellAt(ws, 'KYC', 2))).toBe(GREEN);
  });

  it('still paints High RISK red', async () => {
    const md = `## Risks
| Risk | Risk Rating |
| --- | --- |
| Sanctions | High |
`;
    const ws = await sheetFor(md, 'Risks');
    expect(fill(cellAt(ws, 'Sanctions', 2))).toBe(RED);
  });

  it('paints High MATURITY green — the same word, opposite column', async () => {
    const md = `## Maturity
| Area | Maturity |
| --- | --- |
| Governance | High |
`;
    const ws = await sheetFor(md, 'Maturity');
    expect(fill(cellAt(ws, 'Governance', 2))).toBe(GREEN);
  });

  it('paints Low maturity red, not green', async () => {
    const md = `## Maturity
| Area | Maturity |
| --- | --- |
| Governance | Low |
`;
    const ws = await sheetFor(md, 'Maturity');
    expect(fill(cellAt(ws, 'Governance', 2))).toBe(RED);
  });

  it('treats a risk word in the header as decisive over a positive one', async () => {
    // "Control Risk Rating" is a risk column despite containing "Control".
    const md = `## Assessment
| Item | Control Risk Rating |
| --- | --- |
| Onboarding | High |
`;
    const ws = await sheetFor(md, 'Assessment');
    expect(fill(cellAt(ws, 'Onboarding', 2))).toBe(RED);
  });

  it('does not paint "Reduced" red just because it starts with "red"', async () => {
    const md = `## Actions
| Action | Outcome |
| --- | --- |
| Screening | Reduced |
`;
    const ws = await sheetFor(md, 'Actions');
    expect(fill(cellAt(ws, 'Screening', 2))).not.toBe(RED);
  });

  it('colours superlatives, which word-boundary matching would otherwise skip', async () => {
    const md = `## Maturity
| Area | Maturity |
| --- | --- |
| A | Lowest |
| B | Highest |
`;
    const ws = await sheetFor(md, 'Maturity');
    expect(fill(cellAt(ws, 'A', 2))).toBe(RED);
    expect(fill(cellAt(ws, 'B', 2))).toBe(GREEN);
  });

  it('colours the Risk Atlas control vocabulary', async () => {
    const md = `## Controls
| Control | Strength |
| --- | --- |
| A | Strong |
| B | Weak |
`;
    const ws = await sheetFor(md, 'Controls');
    expect(fill(cellAt(ws, 'A', 2))).toBe(GREEN);
    expect(fill(cellAt(ws, 'B', 2))).toBe(RED);
  });

  it('keeps "Non-compliant" red regardless of key order', async () => {
    const md = `## Status
| Obligation | Status |
| --- | --- |
| Art 16 | Non-compliant |
| Art 17 | Compliant |
`;
    const ws = await sheetFor(md, 'Status');
    expect(fill(cellAt(ws, 'Art 16', 2))).toBe(RED);
    expect(fill(cellAt(ws, 'Art 17', 2))).toBe(GREEN);
  });
});
