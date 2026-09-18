import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

/**
 * Guard over AMLR / MiCA article citations in the module catalogue and in the
 * prompt text the server assembles around it.
 *
 * 2026-09-17: a citation audit of `server/areas/**` found ~40 sites where a
 * prompt named an article whose actual heading contradicts the obligation it
 * was cited for — the business-wide risk assessment cited as AMLR Art. 16
 * (that is group-wide requirements; the BWRA is Art. 10), tipping-off as
 * Art. 56 (that is beneficial-ownership notifications; the prohibition of
 * disclosure is Art. 73), five-year record retention as Art. 67 (foreign legal
 * entities; retention is Art. 77), correspondent banking as Art. 46 (family
 * members of PEPs; correspondent banking is Arts. 36-39), and MiCA "Title V
 * (Arts. 59-110)" when Title V ends at Art. 85. 46 prompts in the same corpus
 * instruct the model never to fabricate an article number: a model told not to
 * invent a citation and then handed one will trust the prompt over its own
 * caution, so a wrong number here is worse than no number.
 *
 * WHY THIS SHAPE. A purely lexical "does the surrounding prose share words with
 * the official heading" check is noisy — headings and prose rarely share
 * vocabulary, and a near-miss reads as a failure. Instead the guard asserts two
 * kinds of fact that are objectively checkable and that actually recur here:
 *
 *   1. STRUCTURAL. "Title V (Arts. 59-110)" is a claim about where a division
 *      of the regulation starts and ends. The repo's own framework files carry
 *      those spans (`chapters[].articles`), so the claim can be checked against
 *      data rather than against a copy of a table. AMLR is divided into
 *      CHAPTERS and MiCA into TITLES; both are keyed here by roman numeral.
 *
 *   2. SUBJECT. A small, explicit map from the obligations that actually recur
 *      in this corpus (business-wide risk assessment, compliance function,
 *      training, outsourcing, ongoing/transaction monitoring, SDD, EDD,
 *      correspondent banking, shell institutions, PEPs, reliance, beneficial
 *      ownership, tipping-off, suspicious-activity reporting, record retention,
 *      high-risk third countries) to the articles that carry them. The map is
 *      checked against the framework files at test time (`SUBJECT_RULES` may
 *      only name articles the framework actually has) so it cannot drift into
 *      naming articles that do not exist.
 *
 * Both rules only fire when the subject or division sits RIGHT NEXT TO the
 * number (same line, within SUBJECT_WINDOW characters, nothing else cited in
 * between). That is deliberate: every defect above had the shape "Subject
 * (Art. N)", and a wider window starts flagging prose that merely mentions two
 * things in one paragraph. A guard that cries wolf gets deleted.
 *
 * The exception list is empty and must stay empty.
 */

const REPO_ROOT = path.resolve(__dirname, '..', '..');

/** Text that is either a module prompt or is assembled into one. */
const CORPUS_DIRS = [
  path.join('server', 'areas'),
  path.join('server', 'prompts'),
];
const CORPUS_FILES = [
  path.join('server', 'services', 'skills-manager.ts'),
  path.join('server', 'services', 'missions', 'seed-templates.ts'),
  path.join('server', 'services', 'prompt-builder.ts'),
  path.join('src', 'lib', 'expert-roles.ts'),
];

/**
 * Sites the guard knowingly tolerates. Empty by design — the corpus was
 * corrected rather than allow-listed. Adding an entry here is a decision to
 * ship a citation the guard believes is wrong, so it needs a reason.
 */
const EXCEPTIONS: ReadonlyArray<{ file: string; line: number; why: string }> = [];

// ---------------------------------------------------------------------------
// Framework ground truth, read from the repo's own files.
// ---------------------------------------------------------------------------

export interface Framework {
  key: 'AMLR' | 'MiCA';
  /** Article number -> official (repo) heading. */
  articles: Map<number, string>;
  /** Roman numeral -> [firstArticle, lastArticle] for that Title/Chapter. */
  divisions: Map<string, [number, number]>;
  /** What the regulation calls its top-level division. */
  divisionWord: 'Chapter' | 'Title';
  maxArticle: number;
  /** True when the file is a complete article list and absence proves absence. */
  complete: boolean;
}

interface FrameworkJson {
  articleCount?: number;
  chapters?: Array<{ number?: string; articles?: string }>;
  articles?: Array<{ id?: string; title?: string }>;
}

function loadFramework(
  key: Framework['key'],
  file: string,
  divisionWord: Framework['divisionWord'],
): Framework {
  const raw = JSON.parse(
    fs.readFileSync(path.join(REPO_ROOT, 'data', 'frameworks', file), 'utf-8'),
  ) as FrameworkJson;

  const articles = new Map<number, string>();
  for (const a of raw.articles ?? []) {
    const n = Number(/(\d+)/.exec(a.id ?? '')?.[1]);
    if (Number.isFinite(n)) articles.set(n, (a.title ?? '').trim());
  }

  const divisions = new Map<string, [number, number]>();
  for (const c of raw.chapters ?? []) {
    const span = /(\d+)(?:\s*-\s*(\d+))?/.exec(c.articles ?? '');
    if (!c.number || !span) continue;
    const from = Number(span[1]);
    divisions.set(c.number.toUpperCase(), [from, span[2] ? Number(span[2]) : from]);
  }

  // The ceiling is whichever is higher: the article count the file declares, the
  // highest article it lists, and the last article of its last division. Taking
  // the maximum is what let the guard work while MiCA carried only 39 of its 149
  // articles and the file's own `articleCount` said 39; since 2026-09-18 (Wave 7)
  // all three agree, and the belt-and-braces costs nothing.
  const lastOfDivisions = Math.max(0, ...[...divisions.values()].map((s) => s[1]));
  const maxArticle = Math.max(raw.articleCount ?? 0, lastOfDivisions, ...articles.keys());
  // "Complete" means every article from 1 to the ceiling is present, so absence
  // from the file proves absence from the regulation.
  const complete = articles.size === maxArticle
    && Array.from({ length: maxArticle }, (_, i) => i + 1).every((n) => articles.has(n));

  return { key, articles, divisions, divisionWord, maxArticle, complete };
}

const AMLR = loadFramework('AMLR', 'amlr-2024.json', 'Chapter');
const MICA = loadFramework('MiCA', 'mica-2023.json', 'Title');
const FRAMEWORKS: Record<Framework['key'], Framework> = { AMLR, MiCA: MICA };

// ---------------------------------------------------------------------------
// Attribution: which regulation is a given "Art. N" talking about?
// ---------------------------------------------------------------------------

/**
 * A citation belongs to AMLR or MiCA only when one of their names is the
 * NEAREST instrument named before it. Every other instrument that shares these
 * files is a stopper: "AI Act Art. 9", "DORA Art. 6" and "GDPR Art. 22" all sit
 * in the same sentences as AMLR articles, and attributing them to AMLR would
 * make the guard fire on correct text.
 */
const INSTRUMENT_TOKEN =
  /\b(AMLR|2024\/1624|MiCA|2023\/1114|AMLD\d?|AI Act|DORA|2022\/2554|GDPR|2016\/679|NIS2|MAR|MiFID|CRR|CRD|CSDR|TFR|2023\/1113|2019\/452|2022\/858|CCD2|PSD\d?|EMD2|2009\/110|2015\/849|2024\/1640|FATF|Wolfsberg|Basel|EBA|ESMA|AMLA|ISO|UNCAC|Annex|CSRD|SFDR|Directive|Recommendation)\b/gi;

const OWNED: Record<string, Framework['key']> = {
  amlr: 'AMLR',
  '2024/1624': 'AMLR',
  mica: 'MiCA',
  '2023/1114': 'MiCA',
};

/** Look back at most this far for the instrument a citation belongs to. */
const ATTRIBUTION_WINDOW = 400;

export function attribute(text: string, at: number): Framework['key'] | null {
  const from = Math.max(0, at - ATTRIBUTION_WINDOW);
  const window = text.slice(from, at);
  let last: string | null = null;
  INSTRUMENT_TOKEN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = INSTRUMENT_TOKEN.exec(window)) !== null) last = m[1].toLowerCase();
  if (!last) return null;
  return OWNED[last] ?? null;
}

// ---------------------------------------------------------------------------
// Citation extraction
// ---------------------------------------------------------------------------

export interface Citation {
  framework: Framework['key'];
  /** Article numbers named: one, or both ends of a range. */
  articles: number[];
  range: boolean;
  start: number;
  end: number;
  line: number;
  context: string;
}

const CITATION =
  /\bArt(?:icle)?s?\.?\s*(\d{1,3})(?:\s*\(\d+\))?(?:\s*[–—-]\s*(\d{1,3}))?/g;

export function extractCitations(text: string): Citation[] {
  const out: Citation[] = [];
  CITATION.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CITATION.exec(text)) !== null) {
    const framework = attribute(text, m.index);
    if (!framework) continue;
    const first = Number(m[1]);
    const second = m[2] === undefined ? undefined : Number(m[2]);
    out.push({
      framework,
      articles: second === undefined ? [first] : [first, second],
      range: second !== undefined,
      start: m.index,
      end: m.index + m[0].length,
      line: text.slice(0, m.index).split('\n').length,
      context: text
        .slice(Math.max(0, m.index - 110), m.index + m[0].length + 90)
        .replace(/\s+/g, ' ')
        .trim(),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Rule 1 — structural: "Title V (Arts. 59-110)"
// ---------------------------------------------------------------------------

const DIVISION =
  /\b(Title|Chapter)\s+([IVXL]+)\b[^\n]{0,40}?\bArt(?:icle)?s?\.?\s*(\d{1,3})(?:\s*[–—-]\s*(\d{1,3}))?/gi;

export interface Finding {
  line: number;
  rule: string;
  message: string;
  context: string;
}

export function checkDivisions(text: string): Finding[] {
  const findings: Finding[] = [];
  DIVISION.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = DIVISION.exec(text)) !== null) {
    const key = attribute(text, m.index);
    if (!key) continue;
    const fw = FRAMEWORKS[key];
    const span = fw.divisions.get(m[2].toUpperCase());
    if (!span) continue;
    const cited: number[] = [Number(m[3])];
    if (m[4] !== undefined) cited.push(Number(m[4]));
    const outside = cited.filter((n) => n < span[0] || n > span[1]);
    const word = m[1];
    const wrongWord =
      word.toLowerCase() !== fw.divisionWord.toLowerCase()
        ? ` (${fw.key} is divided into ${fw.divisionWord}s, not ${word}s)`
        : '';
    if (outside.length > 0 || wrongWord) {
      findings.push({
        line: text.slice(0, m.index).split('\n').length,
        rule: 'division-span',
        message:
          `${fw.key} ${fw.divisionWord} ${m[2].toUpperCase()} is Arts. ${span[0]}-${span[1]}; ` +
          `cited as ${cited.join('-')}${wrongWord}`,
        context: text.slice(m.index, m.index + m[0].length).replace(/\s+/g, ' '),
      });
    }
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Rule 2 — subject: an obligation named right next to a number
// ---------------------------------------------------------------------------

/**
 * How close the subject phrase must sit to the number for the rule to fire.
 * Wide enough for the real shape of these lines — "Beneficial ownership
 * identification and verification (Arts. 40–45)" puts 55 characters between the
 * subject and the number — but narrow enough that a paragraph merely mentioning
 * two things does not bind them. The clause- and parenthesis-aware bounds below
 * do most of the work; this is only the outer limit.
 */
const SUBJECT_WINDOW = 90;

import { SUBJECT_RULES, seq, type SubjectRule } from './citation-subject-rules.js';
export { SUBJECT_RULES } from './citation-subject-rules.js';

/**
 * A second, narrower kind of rule: an article that is so easy to reach for by
 * mistake that citing it AT ALL requires the surrounding text to name what it
 * actually says. Both entries here are articles the corpus reached for wrongly
 * and that an allowed-articles set cannot catch, because the wrong use sits
 * inside the same subject band as the right one.
 */
interface ArticleContextRule {
  framework: Framework['key'];
  article: number;
  required: RegExp;
  why: string;
}

export const ARTICLE_CONTEXT_RULES: readonly ArticleContextRule[] = [
  {
    framework: 'AMLR',
    article: 16,
    required: /group|subsidiar|parent undertaking|branch/i,
    why: 'Art. 16 is "Group-wide requirements" — the business-wide risk assessment is Art. 10',
  },
  {
    framework: 'AMLR',
    article: 45,
    required: /ceas|former|no longer|cooling[- ]off/i,
    why: 'Art. 45 is "Measures for persons who CEASE to be politically exposed persons" — the live PEP regime is Arts. 42-44 and 46',
  },
];

/**
 * A prompt that deliberately names a wrong article to warn against it ("do not
 * attribute the shell-bank prohibition to Art. 40") is the opposite of the
 * defect this guard hunts. Those sentences carry a negation, so a line that
 * contains one is left alone.
 */
const NEGATION = /\bdo(?:es)?\s+not\b|\bnever\b|\bnot\b\s+(?:a|the|an)\b|non-existent|\brather than\b|\bis not\b|\bincorrect\b|\bmisattribut/i;

/**
 * Text to the LEFT of a citation, stopping where the label can no longer belong
 * to it: the previous citation, a clause break, or a parenthetical that closed
 * before this citation began (a parenthetical annotates what comes BEFORE it,
 * so "Art. 39 (shell institutions) / Art. 36" must not bind "shell" to Art. 36).
 */
function leftNear(text: string, from: number, floor: number): string {
  let i = from;
  let depth = 0;
  while (i > floor) {
    const ch = text[i - 1];
    if (ch === ')' && depth === 0) break;          // a closed parenthetical: stop
    if (ch === ')') depth++;
    else if (ch === '(') { if (depth > 0) depth--; }
    else if (depth === 0 && (ch === ';' || ch === '|' || ch === '\n')) break;
    i--;
  }
  return text.slice(i, from);
}

/**
 * Text to the RIGHT of a citation, stopping at the first clause break that is
 * not inside a parenthetical the citation opened — so "Art. 26 (EDD)" binds,
 * and "(Art.62), suspicious transaction reporting" does not.
 */
function rightNear(text: string, from: number, ceiling: number): string {
  let i = from;
  let depth = 0;
  while (i < ceiling) {
    const ch = text[i];
    if (ch === '(') depth++;
    else if (ch === ')') {
      // A ')' at depth 0 closes a group that opened BEFORE the citation — the
      // citation's own bracket. Everything after it annotates something else:
      // "standard CDD (Arts. 20-23) and enhanced due diligence (Art. 34)".
      if (depth === 0) break;
      depth--;
    } else if (depth === 0 && (ch === ',' || ch === ';' || ch === '|' || ch === '\n')) break;
    i++;
  }
  return text.slice(from, i);
}

export function checkSubjects(text: string): Finding[] {
  const findings: Finding[] = [];
  const citations = extractCitations(text);
  const lineStarts: number[] = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') lineStarts.push(i + 1);

  for (const c of citations) {
    const lineStart = lineStarts[c.line - 1] ?? 0;
    const nextNewline = text.indexOf('\n', c.end);
    const lineEnd = nextNewline === -1 ? text.length : nextNewline;
    if (NEGATION.test(text.slice(lineStart, lineEnd))) continue;

    // Only look inside the citation's own line, and only as far as the nearest
    // other citation — so "Art. 33 SDD; Arts. 20-23 standard CDD; Art. 34 EDD"
    // binds each label to the number it sits against.
    const others = citations.filter((o) => o !== c && o.line === c.line);
    const floor = Math.max(
      lineStart,
      c.start - SUBJECT_WINDOW,
      ...others.filter((o) => o.end <= c.start).map((o) => o.end),
    );
    const ceiling = Math.min(
      lineEnd,
      c.end + SUBJECT_WINDOW,
      ...others.filter((o) => o.start >= c.end).map((o) => o.start),
    );
    const left = leftNear(text, c.start, floor);
    const right = rightNear(text, c.end, ceiling);
    const near = `${left} ${right}`;

    for (const rule of SUBJECT_RULES) {
      if (rule.framework !== c.framework) continue;
      if (!rule.subject.test(near)) continue;
      const wrong = c.articles.filter((n) => !rule.allowed.includes(n));
      if (wrong.length === 0) continue;
      findings.push({
        line: c.line,
        rule: 'subject-article',
        message:
          `cited ${c.framework} Art. ${c.articles.join('-')} for "${rule.subject.source}" — ` +
          `${rule.why}. Art. ${wrong[0]} is "${FRAMEWORKS[c.framework].articles.get(wrong[0]) ?? 'not in the framework file'}"`,
        context: c.context,
      });
    }

    for (const rule of ARTICLE_CONTEXT_RULES) {
      if (rule.framework !== c.framework) continue;
      if (c.range || c.articles[0] !== rule.article) continue;
      if (rule.required.test(near)) continue;
      findings.push({
        line: c.line,
        rule: 'article-context',
        message: `${c.framework} Art. ${rule.article} cited without naming what it says — ${rule.why}`,
        context: c.context,
      });
    }
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Rule 3 — the article has to exist
// ---------------------------------------------------------------------------

export function checkExistence(text: string): Finding[] {
  const findings: Finding[] = [];
  for (const c of extractCitations(text)) {
    const fw = FRAMEWORKS[c.framework];
    for (const n of c.articles) {
      if (n >= 1 && n <= fw.maxArticle) continue;
      findings.push({
        line: c.line,
        rule: 'article-exists',
        message: `${fw.key} has ${fw.maxArticle} articles; Art. ${n} does not exist`,
        context: c.context,
      });
    }
  }
  return findings;
}

export function checkText(text: string): Finding[] {
  return [...checkDivisions(text), ...checkSubjects(text), ...checkExistence(text)];
}

// ---------------------------------------------------------------------------
// Corpus walk
// ---------------------------------------------------------------------------

function collect(): string[] {
  const files: string[] = [];
  const walk = (dir: string): void => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.(md|json)$/.test(e.name)) files.push(full);
    }
  };
  for (const d of CORPUS_DIRS) walk(path.join(REPO_ROOT, d));
  for (const f of CORPUS_FILES) {
    const full = path.join(REPO_ROOT, f);
    if (fs.existsSync(full)) files.push(full);
  }
  return files;
}

describe('AMLR / MiCA citations match the articles that carry the obligation', () => {
  it('the framework files the guard stands on are the ones it thinks they are', () => {
    // AMLR is a complete article list (90 of 90), so absence proves absence.
    expect(AMLR.articles.size).toBe(90);
    expect(AMLR.complete).toBe(true);
    expect(AMLR.articles.get(10)).toMatch(/business-wide risk assessment/i);
    expect(AMLR.articles.get(16)).toMatch(/group-wide/i);
    expect(AMLR.articles.get(73)).toMatch(/prohibition of disclosure/i);
    expect(AMLR.articles.get(77)).toMatch(/record retention/i);
    expect(AMLR.divisions.get('III')).toEqual([19, 50]);
    // MiCA was a SPARSE selection when this guard was written (39 of 149), so
    // absence proved nothing and only its division spans and article ceiling were
    // usable. Wave 7 filled it from the Official Journal, so absence now proves
    // absence there too and Rule 3 bites on the whole regulation.
    expect(MICA.articles.size).toBe(149);
    expect(MICA.complete).toBe(true);
    expect(MICA.maxArticle).toBe(149);
    expect(MICA.articles.get(59)).toMatch(/^authorisation$/i);
    expect(MICA.articles.get(73)).toMatch(/^outsourcing$/i);
    expect(MICA.divisions.get('V')).toEqual([59, 85]);
    expect(MICA.divisions.get('VI')).toEqual([86, 92]);
  });

  it('every SUBJECT_RULE names articles the framework actually has', () => {
    const bad: string[] = [];
    for (const rule of SUBJECT_RULES) {
      const fw = FRAMEWORKS[rule.framework];
      for (const n of rule.allowed) {
        if (n < 1 || n > fw.maxArticle) bad.push(`${rule.framework} Art. ${n} (${rule.subject.source})`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('the corpus is non-trivial (the walk found the prompts it is meant to read)', () => {
    const files = collect();
    expect(files.length).toBeGreaterThan(400);
    const citations = files.flatMap((f) => extractCitations(fs.readFileSync(f, 'utf-8')));
    expect(citations.length).toBeGreaterThan(150);
  });

  it('no prompt cites an article whose own heading contradicts the obligation', () => {
    const problems: string[] = [];
    for (const file of collect()) {
      const rel = path.relative(REPO_ROOT, file).replace(/\\/g, '/');
      for (const f of checkText(fs.readFileSync(file, 'utf-8'))) {
        if (EXCEPTIONS.some((e) => e.file === rel && e.line === f.line)) continue;
        problems.push(`${rel}:${f.line} [${f.rule}] ${f.message}\n      …${f.context}…`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('carries no exceptions', () => {
    expect(EXCEPTIONS).toEqual([]);
  });
});

describe('citation rules self-check (so the guard cannot pass vacuously)', () => {
  it('catches a MiCA Title V range that runs past Art. 85', () => {
    const f = checkText('| CASP | MiCA Title V (Arts. 59–110) | NCA |');
    expect(f.map((x) => x.rule)).toContain('division-span');
    expect(f[0].message).toMatch(/Title V is Arts\. 59-85/);
  });

  it('catches an AMLR chapter span cited under the wrong division word and range', () => {
    const f = checkText('### 1. Customer Due Diligence (AMLR Title II, Arts. 20–45)');
    expect(f.map((x) => x.rule)).toContain('division-span');
  });

  it('accepts the corrected forms of every defect it was built for', () => {
    const ok = [
      'You are producing the Business-Wide Risk Assessment (BWRA) required by AMLR Article 10.',
      '- AMLR: Compliance manager and compliance officer (Article 11) — required at entity and group level',
      '### 6. Training (AMLR Art. 12)',
      '### 2. Transaction Monitoring (AMLR Art. 26)',
      '- Tipping-off prohibition controls (AMLR Art. 73): who knows about a filed report',
      '### 4. Record-Keeping (AMLR Arts. 77–78)',
      '### 8. Correspondent Banking (AMLR Arts. 36–39)',
      '- PEP screening and categorisation (AMLR Arts. 42–46)',
      '5. Cite specific regulatory anchors. AMLR Art. 10, Art. 20-23 (CDD), Art. 34 (EDD)',
      '| Crypto-Asset Service Provider (CASP) | MiCA Title V (Arts. 59–85) | National NCA |',
      '- MiCA Art. 68(8) ICT security requirements',
      '### Significant ART Enhanced Requirements (MiCA Arts. 43–45)',
    ];
    for (const s of ok) expect(checkText(s), s).toEqual([]);
  });

  it('rejects each defect the corpus actually carried', () => {
    const bad: Array<[string, string]> = [
      ['the Business-Wide Risk Assessment (BWRA) required by AMLR Article 16', 'BWRA as group-wide requirements'],
      ['- AMLR: Compliance officer (Article 9)', 'compliance function as scope of internal policies'],
      ['### 6. Training (AMLR Art. 18)', 'training as outsourcing'],
      ['### 2. Transaction Monitoring (AMLR Art. 50)', 'monitoring as guidelines on reliance'],
      ['- Tipping-off prohibition controls (AMLR Art. 56)', 'tipping-off as notifications'],
      ['### 4. Record-Keeping (AMLR Arts. 67–70)', 'retention as foreign legal entities'],
      ['### 8. Correspondent Banking (AMLR Art. 46 + Wolfsberg)', 'correspondent as PEP associates'],
      ['- PEP customers due for annual review (AMLR Art. 45 requires annual review)', 'PEP regime as the cooling-off rule'],
      ['Cite specific regulatory anchors. AMLR Art. 16, Art. 20-23 (CDD), Art. 26 (EDD)', 'EDD as ongoing monitoring'],
      ['4. Beneficial ownership identification and verification (AMLR Arts. 40–45)', 'BO as self-hosted addresses / PEPs'],
      ['- MiCA Art. 75 ICT security requirements', 'ICT/security as the custody service'],
      ['### Significant ART Enhanced Requirements (MiCA Arts. 39–44)', 'significant ART as redemption/acquisitions'],
      ['- AMLR Art. 59 (transaction monitoring): scenario coverage', 'monitoring as class of beneficiaries'],
      ['**AMLR Art. 15 — Outsourcing of AML/CFT Functions**', 'outsourcing as specific employees'],
      ['- 5-year retention for CDD and transaction records (AMLR Art. 67)', 'retention as foreign legal entities'],
    ];
    for (const [s, why] of bad) {
      expect(checkText(s).length, `${why}: ${s}`).toBeGreaterThan(0);
    }
  });

  it('does not fire on another instrument that shares the sentence', () => {
    const ok = [
      '### 2. AI risk-management system (AI Act Art. 9 + DORA Art. 6 + AMLR Art. 9 RBA)',
      'GDPR (EU) 2016/679 — Art. 9 (biometric data), Art. 22 (automated decision-making), Art. 35 (DPIA), alongside AMLR',
      'AMLR and NIS2 supply-chain security (NIS2 Art. 21)',
      'AMLR context, but see Reg. (EU) 2019/452 Art. 4 and Arts. 6–7 cooperation',
      'AMLR outsourcing rules and the DORA ICT third-party register (DORA Arts. 28–30)',
    ];
    for (const s of ok) expect(checkText(s), s).toEqual([]);
  });
});
