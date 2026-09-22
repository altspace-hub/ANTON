/**
 * The wizard must build DIFFERENT content for a spreadsheet than for a
 * document. One markdown string served every format, and what makes a good
 * report — a section per article, prose under each — is exactly what makes an
 * unusable workbook.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const src = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../../src/pages/GapAssessmentWizard.tsx'),
  'utf8',
);

describe('gap export format routing', () => {
  it('gives the export builder the target format', () => {
    expect(src).toMatch(/buildContent: \(format: string\) => string/);
    expect(src).toMatch(/buildContent\(format\)/);
  });

  it('routes xlsx to spreadsheet builders and everything else to the document ones', () => {
    // Plain containment, not a regex: the branch is a literal string and
    // escaping it twice is how this assertion silently stops testing anything.
    for (const name of ['Findings', 'Roadmap', 'FullAssessment']) {
      const branch = `fmt === 'xlsx' ? build${name}Spreadsheet() : build${name}Markdown()`;
      expect(src.includes(branch), `${name} must branch on format`).toBe(true);
    }
  });

  it('emits one findings row per article rather than a section per article', () => {
    const start = src.indexOf('const buildFindingsSpreadsheet');
    const end = src.indexOf('const buildRoadmapSpreadsheet');
    const body = src.slice(start, end);
    // A `###` heading per finding is what produced 93 sheets.
    expect(body).not.toMatch(/###/);
    expect(body).toMatch(/for \(const f of findings\)/);
    expect(body).toMatch(/\| Article \| Title \| Score/);
  });

  it('flattens roadmap phases into action rows', () => {
    const start = src.indexOf('const buildRoadmapSpreadsheet');
    const body = src.slice(start, start + 2500);
    expect(body).toMatch(/for \(const phase of roadmap\?\.phases/);
    expect(body).toMatch(/for \(const item of phase\.items/);
    expect(body).toMatch(/\| Phase \| Timeframe \| Action \| Owner/);
  });

  it('sanitises cell text so a stray pipe cannot shift the columns', () => {
    // The converter splits rows on a naive split('|') with no escape handling,
    // so one pipe in a requirement silently moves every later column left.
    const start = src.indexOf('const cell = (v: unknown');
    const body = src.slice(start, start + 700);
    const BS = String.fromCharCode(92); // avoid escaping a backslash about a backslash
    expect(body.includes(`replace(/${BS}|/g, '/')`), 'pipes removed').toBe(true);
    expect(body.includes(`${BS}r?${BS}n+`), 'newlines flattened').toBe(true);
    expect(body.includes(`${BS}*${BS}*(.+?)`), 'markdown bold stripped').toBe(true);
  });
});
