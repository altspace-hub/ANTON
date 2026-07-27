/**
 * export-xlsx-integrity.test.ts — two defects that made Excel export either fail
 * outright or quietly ship an incomplete deliverable.
 *
 *  1. Worksheet names must be unique. Two sections headed "Findings" — or any two
 *     headings sharing a 31-character prefix — made ExcelJS throw "Worksheet name
 *     already exists". The 500 was swallowed client-side, so the button appeared to
 *     do nothing. Repeated headings are the ordinary shape of ANTON output.
 *
 *  2. Prose-only sections were dropped by a bare `continue`. An executive summary or
 *     a caveats section could therefore be missing from the client's copy with no
 *     warning anywhere — the worst kind of export bug, because the file opens fine.
 *
 * These run the REAL generator and read the produced workbook back with ExcelJS,
 * rather than asserting on the markdown parser. A test that stops at the parser
 * would pass while the workbook itself was unopenable.
 */
import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { generateXlsx } from '../../server/services/export-xlsx.js';

async function readBack(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  return wb;
}

const TABLE = `
| Control | Rating |
| --- | --- |
| KYC | Strong |
`;

describe('duplicate section headings', () => {
  it('does not throw when two sections share a heading', async () => {
    const md = `## Findings\n${TABLE}\n## Findings\n${TABLE}`;
    await expect(generateXlsx(md, { title: 'T' })).resolves.toBeInstanceOf(Buffer);
  });

  it('produces two distinct worksheets rather than losing one', async () => {
    const md = `## Findings\n${TABLE}\n## Findings\n${TABLE}\n## Findings\n${TABLE}`;
    const wb = await readBack(await generateXlsx(md, { title: 'T' }));
    const names = wb.worksheets.map((w) => w.name);
    const findings = names.filter((n) => n.toLowerCase().startsWith('findings'));
    expect(findings).toHaveLength(3);
    expect(new Set(findings).size).toBe(3);           // all distinct
  });

  it('keeps generated names inside Excel\'s 31-character limit', async () => {
    const long = 'Detailed Regulatory Findings And Observations';  // >31 chars
    const md = `## ${long}\n${TABLE}\n## ${long}\n${TABLE}`;
    const wb = await readBack(await generateXlsx(md, { title: 'T' }));
    for (const w of wb.worksheets) {
      expect(w.name.length).toBeLessThanOrEqual(31);
    }
    expect(new Set(wb.worksheets.map((w) => w.name)).size).toBe(wb.worksheets.length);
  });
});

describe('prose-only sections are not dropped', () => {
  it('carries narrative text into the workbook alongside table sheets', async () => {
    const md = [
      '## Executive Summary',
      'The programme is materially behind schedule and needs a decision this quarter.',
      '',
      '## Control Ratings',
      TABLE,
    ].join('\n');

    const wb = await readBack(await generateXlsx(md, { title: 'T' }));

    // Every cell in the book, so the assertion does not depend on which sheet it
    // landed on — only that the sentence survived the export at all.
    let found = false;
    wb.eachSheet((ws) => {
      ws.eachRow((row) => {
        row.eachCell((cell) => {
          if (typeof cell.value === 'string' && cell.value.includes('materially behind schedule')) {
            found = true;
          }
        });
      });
    });
    expect(found).toBe(true);
  });

  it('still emits the table sheet when both kinds are present', async () => {
    const md = `## Notes\nSome prose only.\n\n## Ratings\n${TABLE}`;
    const wb = await readBack(await generateXlsx(md, { title: 'T' }));
    expect(wb.worksheets.some((w) => w.name.toLowerCase().startsWith('ratings'))).toBe(true);
  });
});
