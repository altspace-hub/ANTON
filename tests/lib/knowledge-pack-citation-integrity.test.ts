import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { SUBJECT_RULES, type FrameworkKey, type SubjectRule } from './citation-subject-rules.js';

/**
 * Guard over the article citations carried by `data/knowledge-packs/*`.
 *
 * Pack entity text reaches a model exactly as a module prompt does — the
 * grounding layer reserves part of its budget for it (see
 * `framework-text-retrieval.ts`) — but the Wave 3 citation audit only walked
 * `server/areas` and `server/prompts`, so no pack was ever adjudicated.
 *
 * Wave 7 adjudicated them and the AMLR pack turned out to be largely numbered
 * against a pre-AMLR draft: tipping-off cited as Art. 52 (the prohibition of
 * disclosure is Art. 73), third-party reliance as Art. 28 (RTS on CDD
 * information; reliance is Arts. 48-50), correspondent banking as Art. 38
 * (Art. 36), employee training as Art. 18 (outsourcing; awareness is Art. 12),
 * ongoing monitoring as Art. 25 (purpose and intended nature; Art. 26), and the
 * wire-transfer information duty attributed to AMLR at all when it belongs to
 * Regulation (EU) 2023/1113. One entity described a third-country equivalence
 * regime the Regulation does not contain.
 *
 * WHAT MAKES THIS CHECKABLE. Every entity that cites an article now records
 * `metadata.instrument`, and each framework file records its own `reference`, so
 * the pair resolves to a framework WITHOUT a hand-written map that could itself
 * drift. Three claims are then objective:
 *
 *   1. EXISTENCE — only against a framework whose article list is complete
 *      (contiguous 1..N). Against a curated subset, absence proves nothing.
 *   2. DIVISION — the chapter an entity asserts is the one that holds the
 *      article, read from the framework's own division table.
 *   3. SUBJECT — the obligation the entity names must be one the cited article
 *      can carry, judged by the SAME curated map the prompt guard uses
 *      (`citation-subject-rules.ts`). A lexical "do the name and the heading
 *      share a word" test was written first and flagged six correct citations,
 *      which is why the prompt guard rejected that approach too.
 *
 * The exception list is empty and must stay empty.
 */

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const PACKS = path.join(REPO_ROOT, 'data', 'knowledge-packs');
const FRAMEWORKS = path.join(REPO_ROOT, 'data', 'frameworks');

/** Citations the guard knowingly tolerates. Empty by design. */
const EXCEPTIONS: ReadonlyArray<{ pack: string; ref: string; why: string }> = [];

interface FrameworkArticle { id?: string; title?: string; requirement?: string; chapter?: string }
interface Framework {
  file: string;
  reference: string;
  articles: Map<number, FrameworkArticle>;
  divisions: Map<string, [number, number]>;
  max: number;
  complete: boolean;
}
interface Entity {
  ref_id?: string;
  entity_id?: string;
  canonical_name?: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

const numberOf = (s: string): number => Number(/(\d+)/.exec(s)?.[1]);

function loadFrameworks(): Framework[] {
  const out: Framework[] = [];
  for (const f of fs.readdirSync(FRAMEWORKS)) {
    if (!f.endsWith('.json')) continue;
    const raw = JSON.parse(fs.readFileSync(path.join(FRAMEWORKS, f), 'utf-8')) as {
      reference?: string;
      articles?: FrameworkArticle[];
      chapters?: Array<{ number?: string; articles?: string }>;
    };
    if (!Array.isArray(raw.articles) || !raw.reference) continue;
    const articles = new Map<number, FrameworkArticle>();
    for (const a of raw.articles) {
      const n = numberOf(a.id ?? '');
      if (Number.isFinite(n)) articles.set(n, a);
    }
    const divisions = new Map<string, [number, number]>();
    for (const c of raw.chapters ?? []) {
      const m = /(\d+)(?:\s*-\s*(\d+))?/.exec(c.articles ?? '');
      if (c.number && m) divisions.set(c.number.toUpperCase(), [Number(m[1]), m[2] ? Number(m[2]) : Number(m[1])]);
    }
    const max = Math.max(0, ...articles.keys());
    const complete = max > 0 && articles.size === max
      && Array.from({ length: max }, (_, i) => i + 1).every((n) => articles.has(n));
    out.push({ file: f.replace(/\.json$/, ''), reference: raw.reference, articles, divisions, max, complete });
  }
  return out;
}

const FW = loadFrameworks();
const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ').trim();
const BY_REFERENCE = new Map(FW.map((f) => [norm(f.reference), f]));

interface Cite { pack: string; ref: string; name: string; article: string; instrument?: string; chapter?: string }

function collect(): Cite[] {
  const out: Cite[] = [];
  for (const pack of fs.readdirSync(PACKS)) {
    const file = path.join(PACKS, pack, 'entities.json');
    if (!fs.existsSync(file)) continue;
    for (const e of JSON.parse(fs.readFileSync(file, 'utf-8')) as Entity[]) {
      const md = e.metadata ?? {};
      if (md.article === undefined || md.article === null) continue;
      out.push({
        pack,
        ref: String(e.ref_id ?? e.entity_id ?? '?'),
        name: String(e.canonical_name ?? ''),
        article: String(md.article),
        instrument: md.instrument === undefined ? undefined : String(md.instrument),
        chapter: md.chapter === undefined ? undefined : String(md.chapter),
      });
    }
  }
  return out;
}

const CITES = collect();
const excepted = (c: Cite): boolean => EXCEPTIONS.some((e) => e.pack === c.pack && e.ref === c.ref);
const frameworkFor = (c: Cite): Framework | undefined =>
  c.instrument ? BY_REFERENCE.get(norm(c.instrument)) : undefined;

/** The two instruments SUBJECT_RULES can adjudicate, by their OJ reference. */
const SUBJECT_FRAMEWORK: Record<string, FrameworkKey> = {
  'regulation (eu) 2024/1624': 'AMLR',
  'regulation (eu) 2023/1114': 'MiCA',
};

/**
 * A pack entity names its subject as a NOUN PHRASE — "Third-Party Reliance",
 * "Ongoing Monitoring" — where a prompt writes it as prose, "reliance on third
 * parties", "ongoing monitoring of the business relationship". SUBJECT_RULES is
 * written for the prose and stays that way: widening it to the bare noun phrase
 * was tried and made the PROMPT guard fire on a correct citation, because
 * "AMLR (Arts. 19-26 on CDD and ongoing monitoring)" then matched a rule that
 * allows only Arts. 26 and 36.
 *
 * So the noun-phrase forms live here, next to the corpus that uses them, and
 * point at exactly the same articles as the prose rule they mirror.
 */
const NAME_RULES: readonly SubjectRule[] = [
  { framework: 'AMLR', subject: /third[- ]party relian|^reliance/i, allowed: [48, 49, 50], why: 'Arts. 48-50 Reliance on CDD performed by other obliged entities' },
  { framework: 'AMLR', subject: /^ongoing monitoring|ongoing monitoring$/i, allowed: [26, 36], why: 'Art. 26 Ongoing monitoring of the business relationship and of transactions' },
  { framework: 'AMLR', subject: /internal (?:controls?|polic)/i, allowed: [9, 11], why: 'Art. 9 Scope of internal policies, procedures and controls' },
  { framework: 'AMLR', subject: /wire transfer|transfer of funds/i, allowed: [], why: 'the payer/payee information duty is Regulation (EU) 2023/1113, not AMLR' },
];
const ALL_NAME_RULES = [...SUBJECT_RULES, ...NAME_RULES];

// ---------------------------------------------------------------------------
// The rules, as pure functions over a list of citations, so the self-check at
// the bottom can put a known defect through them.
// ---------------------------------------------------------------------------

export function checkExistence(cites: Cite[]): string[] {
  const problems: string[] = [];
  for (const c of cites) {
    if (excepted(c)) continue;
    const fw = frameworkFor(c);
    if (!fw || !fw.complete) continue;   // a curated subset proves nothing by absence
    const n = numberOf(c.article);
    if (!Number.isFinite(n) || !fw.articles.has(n)) {
      problems.push(`${c.pack}/${c.ref}: ${fw.reference} has ${fw.max} articles, Art. ${c.article} is not one of them — ${c.name}`);
    }
  }
  return problems;
}

export function checkDivision(cites: Cite[]): string[] {
  const problems: string[] = [];
  for (const c of cites) {
    if (excepted(c) || !c.chapter) continue;
    const fw = frameworkFor(c);
    if (!fw || fw.divisions.size === 0) continue;
    const span = fw.divisions.get(c.chapter.toUpperCase());
    const n = numberOf(c.article);
    if (!Number.isFinite(n)) continue;
    if (!span) {
      problems.push(`${c.pack}/${c.ref}: ${fw.reference} has no division ${c.chapter}`);
    } else if (n < span[0] || n > span[1]) {
      problems.push(`${c.pack}/${c.ref}: Art. ${c.article} is not in division ${c.chapter} (Arts. ${span[0]}-${span[1]})`);
    }
  }
  return problems;
}

/**
 * The same curated map the prompt guard uses (SUBJECT_RULES), applied to the
 * name an entity gives its article. A lexical "do these share a word" test was
 * tried first and flagged six correct citations — "Former PEPs" against a
 * heading reading "persons who cease to be politically exposed persons", a
 * casino threshold against "Application of customer due diligence measures" —
 * which is the same noise the prompt guard rejected that approach for.
 */
export function checkSubject(cites: Cite[]): string[] {
  const problems: string[] = [];
  for (const c of cites) {
    if (excepted(c)) continue;
    const fw = frameworkFor(c);
    const key = fw ? SUBJECT_FRAMEWORK[norm(fw.reference)] : undefined;
    if (!key) continue;
    const n = numberOf(c.article);
    if (!Number.isFinite(n)) continue;
    // Match on the subject, not on the citation tail ("— Art. 36 AMLR").
    const subject = c.name.replace(/[—–-]\s*Art(?:icle)?\.?\s*\d.*$/i, '')
      .replace(/^\s*\w+\s+Art(?:icle)?\.?\s*\d+\s*[—–-]\s*/i, '').trim();
    // An entity name is compound where a prompt sentence is not: "EDD for
    // High-Risk Third Countries" names two obligations, and Art. 34(1) — which
    // imposes EDD "in the cases referred to in Articles 29, 30, 31" — is an
    // honest cite for it, as is Art. 29. So the matching rules are applied
    // disjunctively: the article must satisfy ONE of them. A single-subject
    // name still binds exactly as tightly ("Tipping-Off Prohibition" matches
    // only the tipping-off rule, so Art. 52 fails against Art. 73).
    const matched = ALL_NAME_RULES.filter((r) => r.framework === key && r.subject.test(subject));
    if (matched.length && !matched.some((r) => r.allowed.includes(n))) {
      problems.push(`${c.pack}/${c.ref}: "${subject}" cites Art. ${c.article} — `
        + matched.map((r) => r.why).join('; '));
    }
  }
  return problems;
}

describe('knowledge-pack article citations', () => {
  it('the walk found the packs (so the suite cannot pass vacuously)', () => {
    expect(CITES.length).toBeGreaterThanOrEqual(120);
    expect(new Set(CITES.map((c) => c.pack)).size).toBeGreaterThanOrEqual(10);
    expect(FW.some((f) => f.file === 'amlr-2024' && f.complete)).toBe(true);
  });

  it('every cited article names the instrument it belongs to', () => {
    const missing = CITES.filter((c) => !c.instrument).map((c) => `${c.pack}/${c.ref}: Art. ${c.article}`);
    expect(missing).toEqual([]);
  });

  it('every named instrument resolves to a framework file, or is explicitly unmapped', () => {
    // A pack may cite an instrument ANTON carries no framework file for — that is
    // a corpus gap, not a wrong citation. What must not happen is a NEAR miss:
    // an instrument string that was meant to match a file and does not.
    const unmapped = [...new Set(CITES.filter((c) => c.instrument && !frameworkFor(c))
      .map((c) => c.instrument as string))].sort();
    expect(unmapped).toEqual([
      'Council Regulation (EC) No 139/2004',
      'Council Regulation (EU) No 833/2014',
      'Directive (EU) 2015/2366',
      'Directive 2014/24/EU',
      'FinSA (Swiss Financial Services Act)',
      'Regulation (EU) 2022/1925',
      'Regulation (EU) 2023/1113',
      'Regulation (EU) No 596/2014',
      'Regulation (EU) No 648/2012',
      'nFADP (Swiss Federal Act on Data Protection)',
    ]);
  });

  it('no pack cites an article that its regulation does not have', () => {
    expect(checkExistence(CITES)).toEqual([]);
  });

  it('no pack puts an article in a division that does not hold it', () => {
    expect(checkDivision(CITES)).toEqual([]);
  });

  it('no pack names an obligation against an article that cannot carry it', () => {
    expect(checkSubject(CITES)).toEqual([]);
  });

  it('carries no exceptions', () => {
    expect(EXCEPTIONS).toEqual([]);
  });
});


describe('pack citation rules self-check (so the guard cannot pass vacuously)', () => {
  const AMLR = 'Regulation (EU) 2024/1624';
  const cite = (over: Partial<Cite>): Cite => ({
    pack: 'test', ref: 'T1', name: 'Subject', article: '1', instrument: AMLR, ...over,
  });

  it('catches an article the regulation does not have', () => {
    expect(checkExistence([cite({ article: '250', name: 'Something — Art. 250 AMLR' })])).toHaveLength(1);
    expect(checkExistence([cite({ article: '73' })])).toEqual([]);
  });

  it('does not judge absence against a framework file that is only a selection', () => {
    // MiFID II is a curated subset, so Art. 4 missing from the file says nothing.
    expect(checkExistence([cite({ instrument: 'Directive 2014/65/EU', article: '4' })])).toEqual([]);
  });

  it('catches an article placed in the wrong chapter', () => {
    expect(checkDivision([cite({ article: '77', chapter: 'VI' })])).toHaveLength(1);
    expect(checkDivision([cite({ article: '77', chapter: 'VII' })])).toEqual([]);
  });

  it('catches each defect the packs actually carried', () => {
    const was: Array<[string, string]> = [
      ['Tipping-Off Prohibition', '52'],
      ['Third-Party Reliance', '28'],
      ['Correspondent Banking', '50'],
      ['Employee Training', '18'],
      ['Ongoing Monitoring', '25'],
      ['Simplified Due Diligence (SDD)', '31'],
    ];
    for (const [name, article] of was) {
      expect(checkSubject([cite({ name, article })]),
        `${name} @ Art. ${article} should be rejected`).toHaveLength(1);
    }
  });

  it('accepts the corrected form of each of them', () => {
    const now: Array<[string, string]> = [
      ['Tipping-Off Prohibition', '73'],
      ['Third-Party Reliance', '48'],
      ['Correspondent Banking', '36'],
      ['Employee Training', '12'],
      ['Ongoing Monitoring of the Business Relationship', '26'],
      ['Simplified Due Diligence (SDD)', '33'],
    ];
    for (const [name, article] of now) {
      expect(checkSubject([cite({ name, article })]),
        `${name} @ Art. ${article} should be accepted`).toEqual([]);
    }
  });

  it('ignores a subject no rule covers rather than guessing', () => {
    expect(checkSubject([cite({ name: 'Casino Transaction Threshold', article: '19' })])).toEqual([]);
  });
});
