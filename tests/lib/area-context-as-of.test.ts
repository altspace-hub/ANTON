import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

/**
 * Guard over the regulated area contexts (server/areas/<area>/area-context.md).
 *
 * 2026-09-16: 59 area contexts, all last edited 2026-02-24, 44 with no year at
 * all, and the ones that did carry dates were stale (fcp never stated the AMLR
 * application date; esg's CSRD timeline was pre-Omnibus). Each regulated
 * context now ends with an "As of:" line so a reader — human or model — knows
 * how old the dates are, and no bare year older than 2024 may describe the
 * current state of the world.
 *
 * Year rule (documented here because it is the whole test):
 *   A four-digit year 19xx/20xx is ALLOWED when any of these hold —
 *     1. it is >= 2024 (recent enough that the As-of line covers it);
 *     2. it is adjacent to '/' or ':' — an act, guideline or standard NUMBER
 *        ("2024/1624", "EBA/GL/2021/05", "ISO 31000:2018", "lag (2017:630)");
 *     3. it sits inside a parenthetical tag "( … )" that is not a currency
 *        claim — the edition / adoption year of a named instrument
 *        ("COSO ERM Framework (2017)", "(2021, updated 2023)", "Law 25 (2022)");
 *        a parenthetical containing "as of", "since" or "until" is a currency
 *        claim and gets no exemption;
 *     4. it completes a full calendar date ("25 May 2018", "January 17, 2025")
 *        — a specific effective date is a fact, not a claim about today;
 *     5. it is the version year of a named instrument, i.e. directly followed
 *        by an instrument noun ("2020 amendments"), directly preceded by one
 *        ("Sanctions and Anti-Money Laundering Act 2018"), or directly
 *        preceded by an ALL-CAPS product token ("COBIT 2019").
 *   Anything else — a bare year in prose ("since 2018", "in 2021", "as of
 *   2023") — must be >= 2024, because that is exactly the kind of sentence
 *   that silently goes stale.
 */

const REGULATED_AREAS = [
  'fcp', 'legal', 'audit', 'risk', 'cyber', 'data-privacy', 'esg',
  'insurance', 'banking', 'blockchain', 'tax-transfer-pricing', 'healthcare',
] as const;

const MIN_BARE_YEAR = 2024;
const AS_OF_LINE = /^_As of: \d{4}-\d{2} — verify dates against primary sources before relying on them\._$/m;

const MONTH = '(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)';
const FULL_DATE_BEFORE = new RegExp(`(?:\\d{1,2}\\s+${MONTH}\\s+|${MONTH}\\s+\\d{1,2},\\s+)$`);
const INSTRUMENT_NOUN_AFTER = /^\s+(?:amendments?|Act|Directive|Regulation|Guidelines?|Standards?|Reform|edition|update|Global)\b/;
const INSTRUMENT_NOUN_BEFORE = /\b(?:Act|Law|Bill|Ordinance|Directive|Regulation|Standard|Guidelines|No\.?|nr)\s$/;
const ALLCAPS_TOKEN_BEFORE = /\b[A-Z][A-Z0-9-]{2,}\s$/;
const CURRENCY_WORDS = /\b(?:as of|since|until|through)\b/i;

interface YearHit { year: number; line: number; context: string; allowed: boolean; }

export function classifyYears(text: string): YearHit[] {
  const hits: YearHit[] = [];
  const re = /\b(19\d{2}|20\d{2})\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const year = Number(m[1]);
    const start = m.index;
    const end = start + m[1].length;
    const before = text.slice(Math.max(0, start - 40), start);
    const after = text.slice(end, end + 40);
    const line = text.slice(0, start).split('\n').length;
    const context = text.slice(Math.max(0, start - 30), end + 30).replace(/\n/g, ' ');

    let allowed = year >= MIN_BARE_YEAR;
    if (!allowed) {
      const prev = text[start - 1] ?? '';
      const next = text[end] ?? '';
      // 2. numbering
      if (prev === '/' || next === '/' || prev === ':' || next === ':') allowed = true;
    }
    if (!allowed) {
      // 3. parenthetical tag — nearest '(' before with no ')' in between, and a ')' after with no '(' in between
      const openIdx = text.lastIndexOf('(', start);
      const closeIdx = text.indexOf(')', end);
      if (openIdx !== -1 && closeIdx !== -1) {
        const inner = text.slice(openIdx + 1, closeIdx);
        if (!inner.includes(')') && !inner.includes('(') && !inner.includes('\n') && !CURRENCY_WORDS.test(inner)) allowed = true;
      }
    }
    if (!allowed && FULL_DATE_BEFORE.test(before)) allowed = true;          // 4. full date
    if (!allowed && INSTRUMENT_NOUN_AFTER.test(after)) allowed = true;       // 5a. "2020 amendments"
    if (!allowed && INSTRUMENT_NOUN_BEFORE.test(before)) allowed = true;     // 5b. "Act 2018"
    if (!allowed && ALLCAPS_TOKEN_BEFORE.test(before)) allowed = true;       // 5c. "COBIT 2019"

    hits.push({ year, line, context, allowed });
  }
  return hits;
}

describe('regulated area contexts carry an As-of line and no stale bare years', () => {
  const repoRoot = path.resolve(__dirname, '..', '..');

  for (const area of REGULATED_AREAS) {
    const file = path.join(repoRoot, 'server', 'areas', area, 'area-context.md');

    it(`${area}: area-context.md exists`, () => {
      expect(fs.existsSync(file), `missing ${file}`).toBe(true);
    });

    it(`${area}: ends with an "As of:" line`, () => {
      const text = fs.readFileSync(file, 'utf-8');
      expect(text).toMatch(AS_OF_LINE);
      const lastLine = text.trimEnd().split('\n').at(-1) ?? '';
      expect(lastLine, 'the As-of line must be the final line').toMatch(AS_OF_LINE);
    });

    it(`${area}: every year is >= ${MIN_BARE_YEAR} or part of an instrument name/number`, () => {
      const text = fs.readFileSync(file, 'utf-8');
      const stale = classifyYears(text).filter((h) => !h.allowed)
        .map((h) => `line ${h.line}: …${h.context}…`);
      expect(stale).toEqual([]);
    });
  }
});

describe('year rule self-check (so the guard cannot pass vacuously)', () => {
  it('lets instrument numbers, tags, full dates and product years through', () => {
    const ok = [
      'Regulation (EU) 2022/2554', 'EBA/GL/2021/05', 'ISO 31000:2018', 'lag (2017:630)',
      'COSO ERM Framework (2017)', 'FATF Guidance (2021, updated 2023)', "Quebec's Law 25 (2022)",
      'came into full effect on 25 May 2018', 'Applies from January 17, 2025', 'COBIT 2019',
      'strengthened by its 2020 amendments', 'Sanctions and Anti-Money Laundering Act 2018',
    ];
    for (const s of ok) expect(classifyYears(s).filter((h) => !h.allowed), s).toEqual([]);
  });

  it('flags bare years in prose that describe the current state', () => {
    const bad = ['fines exceed EUR 4 billion since 2018', 'strengthened in 2021', '(as of 2023)', 'transposed by June 2021.'];
    for (const s of bad) expect(classifyYears(s).filter((h) => !h.allowed).length, s).toBeGreaterThan(0);
  });
});
