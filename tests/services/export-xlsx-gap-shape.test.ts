/**
 * export-xlsx-gap-shape.test.ts — the Gap Assessor's workbooks opened fine and
 * were close to useless, which is the failure mode nobody reports as a bug.
 *
 * The wizard built ONE markdown document and handed it to every format. That
 * markdown is document-shaped — a `###` section per article — and the xlsx
 * converter promotes every heading that contains a table into its own sheet. A
 * 90-article framework therefore produced a 93-tab workbook, each tab holding a
 * five-cell criteria table with the rest of the finding stacked as prose in
 * column A. The roadmap was worse: its phases carry structured items, the
 * document form flattened them to prose headings, the converter found no table
 * at all, and the whole roadmap landed as 684 lines in a single column.
 *
 * These tests pin the shape of what the spreadsheet path must produce, and the
 * converter behaviour that shape depends on.
 */
import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { generateXlsx } from '../../server/services/export-xlsx.js';

async function load(md: string): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await generateXlsx(md, { title: 'T' }) as unknown as ArrayBuffer);
  return wb;
}

/** Document-shaped: one section per article, as the .docx path still emits. */
const documentShaped = (n: number) => {
  let md = '# Gap Assessment\n\n';
  for (let i = 1; i <= n; i++) {
    md += `### Art.${i} — Article ${i}\n\n`;
    md += `| Documented | Implemented | Tested |\n|---|---|---|\n| yes | partial | no |\n\n`;
    md += `Some commentary about article ${i}.\n\n`;
  }
  return md;
};

/** Spreadsheet-shaped: one row per article under a single heading. */
const sheetShaped = (n: number) => {
  let md = '# Gap Assessment\n\n## Findings\n\n';
  md += '| Article | Title | Score | % | Documented | Requirement |\n|---|---|---|---|---|---|\n';
  for (let i = 1; i <= n; i++) {
    md += `| Art.${i} | Article ${i} | yellow | 60% | yes | ${'Requirement text '.repeat(8)} |\n`;
  }
  return md;
};

describe('gap workbook shape', () => {
  it('document-shaped markdown really does explode into a sheet per article', async () => {
    // Guards the premise: if this stopped being true the fix below would be
    // solving a problem that no longer exists.
    const wb = await load(documentShaped(40));
    expect(wb.worksheets.length).toBeGreaterThan(40);
  });

  it('spreadsheet-shaped markdown stays one sheet however many articles', async () => {
    const few = await load(sheetShaped(3));
    const many = await load(sheetShaped(90));
    const names = (wb: ExcelJS.Workbook) => wb.worksheets.map((w) => w.name);
    expect(names(many)).toEqual(names(few));
    // Cover + Findings + Disclaimer — navigable, unlike 93 tabs.
    expect(many.worksheets.length).toBeLessThanOrEqual(4);
  });

  it('puts every article on its own row with the columns intact', async () => {
    const wb = await load(sheetShaped(90));
    const ws = wb.worksheets.find((w) => w.name === 'Findings')!;
    const header = ws.getRow(3).values as unknown[];
    expect(header).toContain('Article');
    expect(header).toContain('Requirement');
    // 90 data rows after title + spacer + header.
    expect(ws.rowCount).toBeGreaterThanOrEqual(93);
    expect(ws.getRow(4).getCell(1).value).toBe('Art.1');
    expect(ws.getRow(93).getCell(1).value).toBe('Art.90');
  });

  it('keeps the filter across the findings header', async () => {
    const wb = await load(sheetShaped(10));
    const ws = wb.worksheets.find((w) => w.name === 'Findings')!;
    expect(ws.autoFilter).toBeTruthy();
  });
});

describe('long prose cells', () => {
  it('lets a row with wrapped text auto-fit instead of clipping to one line', async () => {
    const wb = await load(sheetShaped(2));
    const ws = wb.worksheets.find((w) => w.name === 'Findings')!;
    // A fixed 20px height with wrapText shows the first line and hides the rest,
    // which is what made the requirement column look truncated and broken.
    expect(ws.getRow(4).height).toBeUndefined();
  });

  it('still compacts rows that have nothing long in them', async () => {
    const wb = await load('# T\n\n## S\n\n| A | B |\n|---|---|\n| x | y |\n');
    const ws = wb.worksheets.find((w) => w.name === 'S')!;
    expect(ws.getRow(4).height).toBe(20);
  });
});

describe('four-band score colouring', () => {
  it('colours yellow distinctly from amber, red, green and from no-signal', async () => {
    // The control row is what makes this test mean anything. An unmatched value
    // still receives a fill — the alternating row banding — so "four distinct
    // colours" passes even when yellow matches no RAG rule at all. 'zzz' sits at
    // the same row parity as yellow, so both would get the SAME banding colour;
    // yellow differs only if a rule actually fired for it.
    const md = '# T\n\n## Findings\n\n| Article | Score |\n|---|---|\n'
      + '| Art.1 | red |\n| Art.2 | amber |\n| Art.3 | yellow |\n| Art.4 | green |\n| Art.5 | zzz |\n';
    const wb = await load(md);
    const ws = wb.worksheets.find((w) => w.name === 'Findings')!;
    const fillOf = (row: number) => {
      const f = ws.getRow(row).getCell(2).fill as ExcelJS.FillPattern;
      return f?.fgColor?.argb;
    };
    const [red, amber, yellow, green, unmatched] = [4, 5, 6, 7, 8].map(fillOf);
    expect(yellow, 'yellow must not fall through to the banding fill').not.toBe(unmatched);
    expect(new Set([red, amber, yellow, green]).size).toBe(4);
    for (const c of [red, amber, yellow, green]) expect(c).toBeTruthy();
  });
});
