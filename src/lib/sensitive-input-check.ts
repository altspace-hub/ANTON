/**
 * sensitive-input-check.ts — the public demo's check before a visitor's text
 * is sent (DEMO_MODE=true; privacy review H3). The demo must not receive real
 * personal data, so the Work page asks the visitor to confirm before it sends
 * text that looks like a Swedish personal identity number (personnummer or
 * samordningsnummer, with a valid check digit), an email address or a phone
 * number. It only asks: the visitor can still send made-up or public details.
 *
 * Pure functions, run in the browser; nothing is sent or stored.
 */

export type SensitiveKind = 'personnummer' | 'email' | 'phone';

export interface SensitiveFinding {
  kind: SensitiveKind;
  /** The text as found, so the visitor can find it. */
  match: string;
}

/** What each kind is called in the question to the visitor. */
export const SENSITIVE_KIND_LABELS: Readonly<Record<SensitiveKind, string>> = {
  personnummer: 'a Swedish personal identity number (personnummer)',
  email: 'an email address',
  phone: 'a phone number',
};

// ── Personnummer ─────────────────────────────────────────────────────────────

/**
 * YYMMDD-NNNC, YYMMDD+NNNC, YYYYMMDD-NNNC, with a space or no separator too.
 * Never part of a longer run of digits.
 */
const PERSONNUMMER = /(?<!\d)(?:(18|19|20)(\d{2})|(\d{2}))(\d{2})(\d{2})[-+ ]?(\d{3})(\d)(?!\d)/g;

/** The Luhn check over the ten digits YYMMDDNNNC (weights 2,1,2,1,…). */
function luhnValid(tenDigits: string): boolean {
  let sum = 0;
  for (let i = 0; i < tenDigits.length; i++) {
    let d = Number(tenDigits[i]) * (i % 2 === 0 ? 2 : 1);
    if (d > 9) d -= 9;
    sum += d;
  }
  return sum % 10 === 0;
}

function findPersonnummer(text: string): Array<SensitiveFinding & { start: number; end: number }> {
  const found: Array<SensitiveFinding & { start: number; end: number }> = [];
  for (const m of text.matchAll(PERSONNUMMER)) {
    const yy = m[2] ?? m[3];
    const month = Number(m[4]);
    const day = Number(m[5]);
    // A samordningsnummer adds 60 to the day. An organisation number has a
    // "month" of 20 or more, so it never passes.
    const dayOk = (day >= 1 && day <= 31) || (day >= 61 && day <= 91);
    if (month < 1 || month > 12 || !dayOk) continue;
    if (!luhnValid(`${yy}${m[4]}${m[5]}${m[6]}${m[7]}`)) continue;
    const start = m.index ?? 0;
    found.push({ kind: 'personnummer', match: m[0], start, end: start + m[0].length });
  }
  return found;
}

// ── Email ────────────────────────────────────────────────────────────────────

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;

/** Domains reserved for examples (RFC 2606, RFC 6761): never a real mailbox. */
function reservedDomain(address: string): boolean {
  const domain = address.slice(address.lastIndexOf('@') + 1).toLowerCase();
  return /(^|\.)example\.(com|net|org)$/.test(domain) || /\.(example|test|invalid|localhost)$/.test(domain);
}

// ── Phone ────────────────────────────────────────────────────────────────────

/** A run of digits with spaces, hyphens or brackets, optionally after '+'. */
const PHONE_CANDIDATE = /(?<![\w+.,/:@])\+?\(?\d[\d ()-]{5,22}\d(?![\w@/]|[.,]\d)/g;

function looksLikePhone(raw: string): boolean {
  const s = raw.trim();
  // A date, or a personnummer-shaped number (checked above), is not a phone number.
  if (/^\d{1,2}-\d{1,2}-\d{2,4}$/.test(s) || /^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) return false;
  if (/^(?:\d{2})?\d{6}[-+ ]\d{4}$/.test(s)) return false;
  const digits = s.replace(/\D/g, '');
  // International: +46 70 123 45 67, 0046 70 123 45 67.
  if (s.startsWith('+')) return digits.length >= 8 && digits.length <= 15;
  if (digits.startsWith('00')) return digits[2] !== '0' && digits.length - 2 >= 8 && digits.length - 2 <= 15;
  // National, with the trunk 0: 070-123 45 67, 08-123 456 78. A number
  // without a leading 0 or + (an amount, a year, an article) is not asked about.
  return digits.startsWith('0') && digits.length >= 8 && digits.length <= 10;
}

/**
 * The phone number in a run of digit groups, if any. A run can join a phone
 * number to a number next to it ("room 12 070-123 45 67"), so when the whole
 * run is not one, its space-separated parts are tried, longest first.
 */
function phoneIn(run: string): string | null {
  const whole = run.trim();
  if (looksLikePhone(whole)) return whole;
  const groups = whole.split(' ').filter(Boolean);
  for (let len = groups.length - 1; len >= 1; len--) {
    for (let from = 0; from + len <= groups.length; from++) {
      const part = groups.slice(from, from + len).join(' ');
      if (looksLikePhone(part)) return part;
    }
  }
  return null;
}

// ── The check ────────────────────────────────────────────────────────────────

/** What in these texts looks like real personal data; one finding per distinct match. */
export function findSensitiveInput(texts: readonly string[]): SensitiveFinding[] {
  const out: SensitiveFinding[] = [];
  const seen = new Set<string>();
  const add = (f: SensitiveFinding) => {
    const key = `${f.kind}:${f.match}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ kind: f.kind, match: f.match });
  };

  for (const text of texts) {
    if (!text) continue;
    const ids = findPersonnummer(text);
    ids.forEach(add);
    for (const m of text.matchAll(EMAIL)) {
      if (!reservedDomain(m[0])) add({ kind: 'email', match: m[0] });
    }
    for (const m of text.matchAll(PHONE_CANDIDATE)) {
      const start = m.index ?? 0;
      const end = start + m[0].length;
      // Already reported as a personnummer.
      if (ids.some((id) => start < id.end && id.start < end)) continue;
      const phone = phoneIn(m[0]);
      if (phone) add({ kind: 'phone', match: phone });
    }
  }
  return out;
}

/**
 * The text values of a module's inputs (guided inputs), which are sent with
 * the prompt: strings, and strings inside arrays and objects, a few levels deep.
 */
export function textsOfInputs(values: unknown, depth = 0): string[] {
  if (typeof values === 'string') return [values];
  if (depth >= 4 || values === null || typeof values !== 'object') return [];
  const items = Array.isArray(values) ? values : Object.values(values as Record<string, unknown>);
  return items.flatMap((v) => textsOfInputs(v, depth + 1));
}

/** "a phone number", "an email address and a phone number", "a, b and c". */
export function describeSensitiveKinds(findings: readonly SensitiveFinding[]): string {
  const kinds = [...new Set(findings.map((f) => f.kind))].map((k) => SENSITIVE_KIND_LABELS[k]);
  if (kinds.length <= 1) return kinds[0] ?? '';
  return `${kinds.slice(0, -1).join(', ')} and ${kinds[kinds.length - 1]}`;
}
