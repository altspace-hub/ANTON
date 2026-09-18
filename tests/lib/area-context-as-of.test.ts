import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  AS_OF_LINE,
  MIN_BARE_YEAR,
  asOfFooterIsLastLine,
  classifyYears,
} from '../../server/lib/as-of-footer.js';

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
 * 2026-09-18: the footer form and the year rule moved to
 * `server/lib/as-of-footer.ts` so that this guard and the module-prompt guard
 * (tests/lib/module-prompt-as-of.test.ts) share ONE definition. The rule itself
 * is documented there; the self-check at the bottom of this file is the
 * executable copy of it. Production imports `stripMaintainerFooter` from the
 * same module, which is why it lives under `server/` rather than `tests/`.
 */

const REGULATED_AREAS = [
  'fcp', 'legal', 'audit', 'risk', 'cyber', 'data-privacy', 'esg',
  'insurance', 'banking', 'blockchain', 'tax-transfer-pricing', 'healthcare',
  // Added 2026-09-17, once each of these was dated and its footer made canonical.
  'trades', 'academic', 'personal-finance', 'real-estate',
] as const;

/**
 * Dated, but deliberately NOT yet under the guard: `mobile-money` and `microfinance`.
 *
 * Both carry a canonical footer and would pass the As-of check. They fail the bare-year
 * check only on legitimate HISTORY — "M-Pesa's launch in Kenya in 2007", "the 1983 work of
 * Muhammad Yunus", "the Nobel Peace Prize in 2006", "in 2010, the Andhra Pradesh crisis" —
 * and on one instrument title whose year follows a word this classifier cannot recognise as
 * an instrument noun ("Framework for Mobile Money Services 2021").
 *
 * A bare historical year is not staleness, so failing them would be a false positive. The
 * classifier would need a way to tell a historical statement from a currency claim before
 * these two can join. That is a design decision, not an oversight — recorded here so the
 * omission is visible rather than silent.
 */

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
      expect(asOfFooterIsLastLine(text), 'the As-of line must be the final line').toBe(true);
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
      // Added 2026-09-18 with the widening for the module prompts. Each is a real
      // false positive found in the corpus, not an invented case:
      'both issued June 2023 and effective for reporting periods',   // month + year
      'Most EU member states transposed by June 2021.',              // month + year
      'US SR 11-7 / OCC Bulletin 2011-12',                           // numbered bulletin
      'replacing the 2013 guidelines',                               // lower-case noun
      'the 2021 Model Rules and the 2022 Directive',                 // "Model Rules"
      'the post-2023 Administrative Guidance restrictions',          // era label
      'null on 31% of pre-2021 records',                             // era label
      'Consumer Protection Act, 2019 (in force)',                    // comma citation
      'CBK (Digital Credit Providers) Regulations, 2022',            // comma citation
      'Data Protection Act, No. 24 of 2019',                         // "No. N of YYYY"
      'RBI Integrated Ombudsman Scheme 2021',                        // scheme
      'CBN Consumer Protection Framework 2016',                      // framework
    ];
    for (const s of ok) expect(classifyYears(s).filter((h) => !h.allowed), s).toEqual([]);
  });

  it('flags bare years in prose that describe the current state', () => {
    const bad = [
      'fines exceed EUR 4 billion since 2018',
      'strengthened in 2021',
      '(as of 2023)',
      // 'transposed by June 2021.' moved to the ok list on 2026-09-18: a month AND a
      // year is a specific event date, as much a completed fact as "1 June 2021", and
      // it was the single largest false-positive class across the 560 module prompts.
      // These replace it, so the bad list does not lose cases:
      'the framework was overhauled in 2022',
      'HMRC tightened eligibility requirements significantly from 2023',
      // A date is a fact, but "as of <date>" is a snapshot claim and stays flagged —
      // otherwise the month+year widening would have opened a hole.
      'as of March 2023 the cash limit is EUR 10,000',
      'as of 17 January 2023 the threshold is EUR 10,000',
    ];
    for (const s of bad) expect(classifyYears(s).filter((h) => !h.allowed).length, s).toBeGreaterThan(0);
  });
});
