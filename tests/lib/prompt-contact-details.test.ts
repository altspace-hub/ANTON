import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

/**
 * Guard: no module prompt hands a user a telephone number.
 *
 * A prompt that states a number is asserting a fact it cannot check. The numbers
 * go stale, nothing in the repo notices, and the person who dials one is, by
 * construction, the person least able to absorb a dead end — someone in a mental
 * health crisis, a migrant worker whose passport has been taken, someone
 * reporting a bribe.
 *
 * The 2026-09-18 sweep found the class was already unreliable on its own terms:
 * `complaint-against-official` and `government-service-complaint` gave two
 * DIFFERENT toll-free numbers for the same Kenyan commission. 41
 * numbers across ten prompts were removed and replaced with routing that does
 * not decay — the emergency number the user already knows, the nearest facility,
 * a named institution and its website, a person who can stay with them tonight.
 *
 * WHAT COUNTS. Only shapes that read as a dialable contact: a `+CC ...` number, a
 * run of digits in groups, a toll-free prefix. Article numbers, monetary
 * thresholds, dates, percentages, word counts and ISO clause numbers are not
 * phone numbers and must not be flagged — a guard that fires on "Art. 20" or
 * "EUR 10 000" would be turned off within a week.
 *
 * The exception list is empty and must stay empty. A prompt that genuinely needs
 * a number should instead name the body and tell the user where to look it up.
 */

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const ROOTS = [path.join('server', 'areas'), path.join('server', 'prompts')];

/** Sites the guard knowingly tolerates. Empty by design. */
const EXCEPTIONS: ReadonlyArray<{ file: string; line: number; why: string }> = [];

/**
 * A dialable number. Deliberately narrow:
 *   +254 722 178 177 / +63-2-8722-1144   international
 *   0800 720 700 / 0800-1000             toll-free national
 *   1860-2662-345 / 08060601000          grouped or long national runs
 */
const PHONE = new RegExp(
  [
    String.raw`\+\d{1,3}[\s-]\d{1,4}[\s-]?\d{2,4}[\s-]?\d{2,4}`,
    String.raw`\b0800[\s-]?\d{3}[\s-]?\d{3,4}\b`,
    String.raw`\b\d{4}-\d{3,4}-\d{3,4}\b`,
    String.raw`\b0\d{9,11}\b`,
  ].join('|'),
);

/** Things that look numeric but are not contact details. */
const NOT_A_PHONE = [
  /\bArt(icle)?s?\.?\s*\d/i,
  /\b(EUR|USD|GBP|SEK|ZAR|KES|NGN|INR)\b/i,
  /\b(19|20)\d{2}\b.*\b(19|20)\d{2}\b/,
  /\b\d{4}\/\d{1,4}\b/,
  /\bISO\b|\bNIST\b|\bPCI\b/i,
  /\bwords?\b|\bpages?\b|\bcharacters?\b/i,
];

/**
 * A line that shows the SAME digits reformatted ("07001234567 → 0700-123-45-67")
 * is demonstrating how to chunk a number for memorisation, not handing anyone a
 * contact. Recognised by the digits matching on both sides of the arrow, which is
 * narrow enough that a real contact written with an arrow still fails.
 */
function isReformattingExample(text: string): boolean {
  const parts = text.split(/→|->/);
  if (parts.length !== 2) return false;
  const digits = (s: string): string => (s.match(/\d/g) ?? []).join('');
  const [a, b] = parts.map(digits);
  return a.length > 5 && a === b;
}

interface Hit { file: string; line: number; text: string }

function walk(dir: string, out: string[]): void {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (e.name.endsWith('.md')) out.push(full);
  }
}

function scan(): { hits: Hit[]; files: number; lines: number } {
  const files: string[] = [];
  for (const r of ROOTS) walk(path.join(REPO_ROOT, r), files);
  const hits: Hit[] = [];
  let lines = 0;
  for (const file of files) {
    const rel = path.relative(REPO_ROOT, file).replace(/\\/g, '/');
    const content = fs.readFileSync(file, 'utf-8').split('\n');
    lines += content.length;
    content.forEach((text, i) => {
      if (!PHONE.test(text)) return;
      if (NOT_A_PHONE.some((rx) => rx.test(text))) return;
      if (isReformattingExample(text)) return;
      hits.push({ file: rel, line: i + 1, text: text.trim().slice(0, 140) });
    });
  }
  return { hits, files: files.length, lines };
}

const RESULT = scan();

describe('module prompts do not hand out telephone numbers', () => {
  it('the walk found the prompt corpus (so the guard cannot pass vacuously)', () => {
    expect(RESULT.files).toBeGreaterThan(500);
    expect(RESULT.lines).toBeGreaterThan(20000);
  });

  it('the pattern recognises a real number and ignores what merely looks like one', () => {
    const phones = [
      '- Kenya: Befrienders Kenya — +254 722 178 177 (24 hours)',
      '**Ghana:** CHRAJ — 0800 800 800 (toll-free).',
      '- India: Vandrevala Foundation — 1860-2662-345',
      '- Nigeria: SURPIN — 08060601000',
    ];
    for (const p of phones) {
      expect(PHONE.test(p), `should be read as a phone number: ${p}`).toBe(true);
    }
    expect(isReformattingExample('- Phone number 07001234567 → 0700-123-45-67')).toBe(true);
    expect(isReformattingExample('- Kenya: EACC → 0800 720 700'), 'an arrow must not excuse a real contact').toBe(false);
    const notPhones = [
      'Cite AMLR Art. 20 for customer due diligence measures.',
      'An occasional transaction of at least EUR 10 000 triggers CDD.',
      'The transposition deadline was 10 July 2027, four years after 2023.',
      'Regulation (EU) 2024/1624 applies from that date.',
      'Keep the letter to 400-600 words maximum.',
      'ISO 27001:2022 Annex A control 8.12 covers data leakage.',
    ];
    for (const p of notPhones) {
      const flagged = PHONE.test(p) && !NOT_A_PHONE.some((rx) => rx.test(p));
      expect(flagged, `should NOT be read as a phone number: ${p}`).toBe(false);
    }
  });

  it('no prompt states a telephone number', () => {
    const problems = RESULT.hits
      .filter((h) => !EXCEPTIONS.some((e) => e.file === h.file && e.line === h.line))
      .map((h) => `${h.file}:${h.line} — ${h.text}`);
    expect(problems).toEqual([]);
  });

  it('carries no exceptions', () => {
    expect(EXCEPTIONS).toEqual([]);
  });
});
