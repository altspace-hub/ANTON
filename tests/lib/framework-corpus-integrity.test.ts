import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

/**
 * Guard over the completeness of `data/frameworks/*.json`.
 *
 * Retrieval can only ground what these files contain. Until 2026-09-18 three of
 * them were partial selections — MiCA carried 39 of its 149 articles, GDPR 50 of
 * 99, the AI Act 41 of 113 — so a run could ask exactly the right question of
 * exactly the right regulation and still be handed nothing, because the article
 * that answers it had never been entered. Nothing said so: each file's own
 * `articleCount` agreed with the short list, so the corpus looked consistent
 * while being a third of the law.
 *
 * Wave 7 filled them from the Official Journal. This guard exists so they cannot
 * quietly shrink again, and so a file cannot claim a size it does not have.
 *
 * WHAT IS ASSERTED. Only facts the file itself makes checkable:
 *
 *   1. `articleCount` equals the number of articles present — for EVERY
 *      framework file, complete or not. A file that overstates its own size is
 *      how a partial corpus passes for a whole one.
 *   2. For a file carrying `articleSource` (i.e. one transcribed from a named
 *      CELEX document), the articles run 1..N with no gap and no duplicate, and
 *      N is the published article count, pinned here so a truncated re-import is
 *      a failing test rather than a silent regression.
 *   3. Every article carries a heading and a requirement. An entry with an empty
 *      `requirement` contributes an empty line to the prompt.
 *   4. The division table (`chapters`) tiles the articles exactly: contiguous,
 *      starting at 1, ending at the last article, no overlap and no gap. This is
 *      what the citation guard's structural rule stands on — MiCA's table was
 *      missing Title VIII entirely before this wave.
 */

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DIR = path.join(REPO_ROOT, 'data', 'frameworks');

/**
 * The published article count of each regulation transcribed in full, from the
 * Official Journal text itself. A number here is a claim about the law, not
 * about the file, so it changes only if the law does.
 */
const PUBLISHED_ARTICLE_COUNT: Record<string, number> = {
  'amlr-2024': 90,                 // Regulation (EU) 2024/1624
  'mica-2023': 149,                // Regulation (EU) 2023/1114
  'gdpr-2016': 99,                 // Regulation (EU) 2016/679
  'eu-ai-act-2024': 113,           // Regulation (EU) 2024/1689
  'amld6-2024': 80,                // Directive (EU) 2024/1640
  'dora-2022': 64,                 // Regulation (EU) 2022/2554
  'mifid2-2014': 97,               // Directive 2014/65/EU
  'mifir-2014': 55,                // Regulation (EU) No 600/2014
  'mar-2014': 39,                  // Regulation (EU) No 596/2014
  'emir-2012': 91,                 // Regulation (EU) No 648/2012
  'psd2-2015': 117,                // Directive (EU) 2015/2366
  'solvency2-2009': 312,           // Directive 2009/138/EC
  'eu-procurement-2014-24': 94,    // Directive 2014/24/EU
};

/**
 * An article a later amendment INSERTED carries a letter ("Art. 35a", added to
 * Solvency II by Omnibus II). It is a real article and must be kept, but it is
 * not in the act as originally published, so it is counted separately — the
 * published count is a claim about the original text.
 */
const isInserted = (id: string): boolean => /^Art\.\d+[a-z]/i.test(id);

interface Article {
  id?: string;
  title?: string;
  requirement?: string;
  chapter?: string;
}
interface FrameworkFile {
  id?: string;
  articleCount?: number;
  articles?: Article[];
  chapters?: Array<{ number?: string; title?: string; articles?: string }>;
  articleSource?: { celex?: string; retrieved?: string };
}

function load(): Array<{ file: string; json: FrameworkFile }> {
  return fs
    .readdirSync(DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => ({
      file: f.replace(/\.json$/, ''),
      json: JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf-8')) as FrameworkFile,
    }))
    .filter((x) => Array.isArray(x.json.articles));
}

const FILES = load();
const numberOf = (a: Article): number => Number(/(\d+)/.exec(a.id ?? '')?.[1]);

describe('framework corpus integrity', () => {
  it('the walk found the framework files (so the suite cannot pass vacuously)', () => {
    expect(FILES.length).toBeGreaterThanOrEqual(40);
    for (const key of Object.keys(PUBLISHED_ARTICLE_COUNT)) {
      expect(FILES.map((f) => f.file)).toContain(key);
    }
  });

  it('no framework file claims more articles than it carries', () => {
    const wrong: string[] = [];
    for (const { file, json } of FILES) {
      if (typeof json.articleCount !== 'number') continue;
      if (json.articleCount !== json.articles!.length) {
        wrong.push(`${file}: declares ${json.articleCount}, carries ${json.articles!.length}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it('every article carries a heading and a requirement', () => {
    const empty: string[] = [];
    for (const { file, json } of FILES) {
      for (const a of json.articles!) {
        if (!a.title || !a.title.trim()) empty.push(`${file} ${a.id} has no title`);
        if (!a.requirement || !a.requirement.trim()) empty.push(`${file} ${a.id} has no requirement`);
      }
    }
    expect(empty).toEqual([]);
  });

  it('a regulation transcribed in full carries every article, once, with no gap', () => {
    const problems: string[] = [];
    for (const { file, json } of FILES) {
      const published = PUBLISHED_ARTICLE_COUNT[file];
      if (published === undefined) continue;
      const original = json.articles!.filter((a) => !isInserted(a.id ?? ''));
      const ids = original.map((a) => a.id ?? '');
      const nums = original.map(numberOf);
      const set = new Set(nums);
      if (ids.length !== new Set(ids).size) {
        const seen = new Set<string>();
        const dupes = ids.filter((i) => (seen.has(i) ? true : (seen.add(i), false)));
        problems.push(`${file}: duplicate articles ${[...new Set(dupes)].join(', ')}`);
      }
      if (original.length !== published) {
        problems.push(`${file}: ${original.length} articles, the Official Journal text has ${published}`);
      }
      const missing = Array.from({ length: published }, (_, i) => i + 1).filter((n) => !set.has(n));
      if (missing.length) {
        problems.push(`${file}: missing Art. ${missing.slice(0, 12).join(', ')}${missing.length > 12 ? ` (+${missing.length - 12} more)` : ''}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('a transcribed regulation records where its text came from', () => {
    const missing: string[] = [];
    for (const { file, json } of FILES) {
      if (PUBLISHED_ARTICLE_COUNT[file] === undefined) continue;
      if (!json.articleSource?.celex) missing.push(`${file}: no articleSource.celex`);
    }
    expect(missing).toEqual([]);
  });

  it('the division table tiles the articles exactly — no gap, no overlap', () => {
    const problems: string[] = [];
    for (const { file, json } of FILES) {
      if (PUBLISHED_ARTICLE_COUNT[file] === undefined) continue;
      const spans = (json.chapters ?? []).map((c) => {
        const m = /(\d+)(?:\s*-\s*(\d+))?/.exec(c.articles ?? '');
        return m ? { number: c.number, lo: Number(m[1]), hi: m[2] ? Number(m[2]) : Number(m[1]) } : null;
      }).filter((s): s is { number?: string; lo: number; hi: number } => s !== null);
      if (!spans.length) { problems.push(`${file}: no division table`); continue; }
      spans.sort((a, b) => a.lo - b.lo);
      if (spans[0].lo !== 1) problems.push(`${file}: divisions start at Art. ${spans[0].lo}, not Art. 1`);
      const last = spans[spans.length - 1].hi;
      const published = PUBLISHED_ARTICLE_COUNT[file];
      if (last !== published) problems.push(`${file}: divisions end at Art. ${last}, the regulation at Art. ${published}`);
      for (let i = 1; i < spans.length; i++) {
        const prev = spans[i - 1], cur = spans[i];
        if (cur.lo !== prev.hi + 1) {
          problems.push(`${file}: ${prev.number} ends at ${prev.hi} and ${cur.number} starts at ${cur.lo}`);
        }
      }
      const numbers = spans.map((s) => s.number);
      if (new Set(numbers).size !== numbers.length) problems.push(`${file}: duplicate division numbers`);
    }
    expect(problems).toEqual([]);
  });

  it("every article's chapter is one the division table declares, and holds it", () => {
    const problems: string[] = [];
    for (const { file, json } of FILES) {
      if (PUBLISHED_ARTICLE_COUNT[file] === undefined) continue;
      const spans = new Map<string, [number, number]>();
      for (const c of json.chapters ?? []) {
        const m = /(\d+)(?:\s*-\s*(\d+))?/.exec(c.articles ?? '');
        if (c.number && m) spans.set(c.number, [Number(m[1]), m[2] ? Number(m[2]) : Number(m[1])]);
      }
      for (const a of json.articles!) {
        if (!a.chapter) continue;  // AMLR's hand-written entries carry none
        const span = spans.get(a.chapter);
        const n = numberOf(a);
        if (!span) { problems.push(`${file} ${a.id}: chapter ${a.chapter} is not in the division table`); continue; }
        if (n < span[0] || n > span[1]) {
          problems.push(`${file} ${a.id}: says chapter ${a.chapter} (Arts. ${span[0]}-${span[1]})`);
        }
      }
    }
    expect(problems).toEqual([]);
  });
});
