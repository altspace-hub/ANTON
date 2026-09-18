/**
 * The freshness regime — one definition of the "As of:" footer and the year rule.
 *
 * Two consumers, deliberately in the same file so the rule cannot drift:
 *
 *  - `tests/lib/area-context-as-of.test.ts` guards `server/areas/<area>/area-context.md`
 *    for a named list of regulated areas.
 *  - `tests/lib/module-prompt-as-of.test.ts` guards `server/areas/<area>/modules/<id>/
 *    system-prompt.md` BY PRESENCE — a prompt that carries the footer is claiming it was
 *    reviewed, so the year rule applies to it; a prompt without one is not yet in scope.
 *
 * A third consumer is production: `stripMaintainerFooter()` keeps this metadata out of
 * the composed system prompt. See the note on that function for why.
 */

/**
 * The canonical footer, exactly. Anything else — a different dash, a missing month, a
 * trailing sentence — is not the footer and does not put a file under the guard.
 *
 * Where a file records WHICH sources were checked, that note goes on its own line ABOVE
 * this one (see `server/areas/trades/area-context.md`), so the canonical line stays the
 * final line and this regex stays exact.
 */
export const AS_OF_LINE =
  /^_As of: \d{4}-\d{2} — verify dates against primary sources before relying on them\._$/m;

/** A provenance note directly above the footer: `_Sources checked …_` on its own line. */
export const SOURCES_CHECKED_LINE = /^_Sources checked[^\n]*_$/m;

/** Build the canonical footer for a given month. */
export function asOfFooter(yearMonth: string): string {
  return `_As of: ${yearMonth} — verify dates against primary sources before relying on them._`;
}

/** Does this text carry the canonical footer at all? */
export function hasAsOfFooter(text: string): boolean {
  return AS_OF_LINE.test(text);
}

/**
 * The `YYYY-MM` from the canonical footer, or null when there is none.
 *
 * The footer is stripped before any text reaches a model, because its verb phrase is an
 * instruction the model cannot carry out. The DATE, though, is a plain fact, and the
 * provenance-and-limits layer already asks an answer to say what was not checked. This
 * is what lets it say how old the domain context was.
 */
export function extractAsOfMonth(text: string): string | null {
  const m = /^_As of: (\d{4}-\d{2}) — verify dates against primary sources before relying on them\._$/m.exec(text);
  return m ? m[1] : null;
}

/** Is the canonical footer the final non-empty line? */
export function asOfFooterIsLastLine(text: string): boolean {
  const lastLine = text.trimEnd().split('\n').at(-1) ?? '';
  return AS_OF_LINE.test(lastLine.trimEnd());
}

/**
 * Remove the maintainer footer (and a `_Sources checked …_` note directly above it) from
 * text that is about to be injected into a model's system prompt.
 *
 * Why strip rather than pass through: the footer is addressed to a human maintainer. Its
 * verb phrase — "verify dates against primary sources before relying on them" — is an
 * imperative, and an imperative inside a system prompt reads as an instruction to the
 * model. The model cannot verify anything against a primary source unless web search
 * happens to be on, so it is an uncompliable instruction, and the `_Sources checked …_`
 * line is provenance about the FILE rather than knowledge about the domain.
 *
 * This is not hypothetical: `prompt-composer` pushes the area context and the module
 * prompt verbatim, so every area context dated in September 2026 has been shipping its
 * footer to the model ever since.
 */
export function stripMaintainerFooter(text: string): string {
  if (!text) return text;
  const lines = text.split('\n');

  // Walk back from the end over blank lines to find the last non-empty line.
  let i = lines.length - 1;
  while (i >= 0 && lines[i].trim() === '') i--;
  if (i < 0 || !AS_OF_LINE.test(lines[i].trimEnd())) return text;
  lines.length = i; // drop the footer and everything blank after it

  // A `_Sources checked …_` note directly above (blank lines allowed between) goes too.
  let j = lines.length - 1;
  while (j >= 0 && lines[j].trim() === '') j--;
  if (j >= 0 && SOURCES_CHECKED_LINE.test(lines[j].trimEnd())) lines.length = j;

  return lines.join('\n').trimEnd();
}

// ── The year rule ────────────────────────────────────────────────────────────
//
// A four-digit year 19xx/20xx is ALLOWED when any of these hold —
//   1. it is >= MIN_BARE_YEAR (recent enough that the As-of line covers it);
//   2. it is adjacent to '/' or ':' — an act, guideline or standard NUMBER
//      ("2024/1624", "EBA/GL/2021/05", "ISO 31000:2018", "lag (2017:630)");
//   3. it sits inside a parenthetical tag "( … )" that is not a currency claim — the
//      edition / adoption year of a named instrument ("COSO ERM Framework (2017)",
//      "(2021, updated 2023)", "Law 25 (2022)"); a parenthetical containing "as of",
//      "since" or "until" is a currency claim and gets no exemption;
//   4. it completes a specific date — a full calendar date ("25 May 2018",
//      "January 17, 2025") or a month and year ("December 2021", "June 2021") — because
//      a specific date is a fact, not a claim about today. The one exception is the
//      snapshot phrase "as of": "as of March 2023, the threshold is X" is precisely the
//      sentence that goes stale, so "as of" before a date gets no exemption;
//   5. it is the version year of a named instrument, i.e. directly followed by an
//      instrument noun ("2020 amendments"), directly preceded by one ("Sanctions and
//      Anti-Money Laundering Act 2018"), or directly preceded by an ALL-CAPS product
//      token ("COBIT 2019");
//   6. it is an era label — a year carrying a `pre-` or `post-` prefix ("pre-2021
//      records", "post-2023 Administrative Guidance"). An era label names a period, and
//      a period does not go stale.
// Anything else — a bare year in prose ("since 2018", "in 2021", "as of 2023") — must be
// >= MIN_BARE_YEAR, because that is exactly the kind of sentence that silently goes stale.

export const MIN_BARE_YEAR = 2024;

const MONTH =
  '(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)';
// Rule 4. "25 May 2018" / "January 17, 2025" / "December 2021". The bare month+year form
// was added in September 2026 when the guard widened from area contexts to module
// prompts: it was the single largest false-positive class, 21 hits across 14 files, every
// one a publication or commencement date ("issued June 2023", "transposed by June 2021",
// "the November 2023 proposals"). A month and a year is exactly as specific — and exactly
// as much a completed fact — as a day, a month and a year.
const FULL_DATE_BEFORE = new RegExp(
  `(?:\\d{1,2}\\s+${MONTH}\\s+|${MONTH}\\s+\\d{1,2},\\s+|${MONTH}\\s+)$`,
);
// …but "as of <date>" is a snapshot claim, not an event date, so it keeps no exemption.
// This has to span the whole date phrase, not just the token before the year: the text
// preceding the year in "as of 17 January 2023" is "as of 17 January ".
const SNAPSHOT_BEFORE_DATE = new RegExp(
  `\\bas of\\s+(?:\\d{1,2}\\s+)?${MONTH}\\s+(?:\\d{1,2},\\s+)?$`,
  'i',
);
// Instrument nouns are matched case-insensitively: real prompts write "the 2022
// guidelines" and "the 2013 guidelines" in lower case, and a lower-case instrument noun
// is still an instrument noun.
const INSTRUMENT_NOUN_AFTER =
  /^\s+(?:amendments?|Act|Directive|Regulation|Guidelines?|Guidance|Rules?|Model|Framework|Standards?|Reform|edition|update|version|Global)\b/i;
// Plurals matter: real instrument titles end "…Regulations 2018", "…Amendment Act 2021",
// "…Rules 2023". Without the optional `s` the guard flagged genuine instrument names as
// stale bare years — found when the mobile-money area context was dated in September 2026.
// Two more gaps of the same shape, found in September 2026 when the corpus widened from
// 59 area contexts to 560 module prompts. Both are citation forms, not prose:
//
//   - THE SEPARATOR. Real citations put a comma between the noun and the year — "Consumer
//     Protection Act, 2019", "CBK (Digital Credit Providers) Regulations, 2022". Requiring
//     a bare space flagged 33 of the corpus's 98 remaining hits across 6 files, 40 of them
//     in `consumer-legal/global-south-consumer-protection` alone. A guard that cries wolf
//     40 times in one file is a guard somebody deletes.
//   - THE "OF" FORM. "Consumer Protection Act, No. 46 of 2012", "Act No. 24 of 2019" is
//     the standard Kenyan/Nigerian/Indian citation. 11 hits.
//
// `Bulletins?`, `Circulars?`, `Ordonnances?` and `Reports?` are on the same evidence —
// "OCC Bulletin 2011-12", "FATF TBML Report 2006", "Ordonnance 2021-1190" are numbered
// instruments. So are `Frameworks?`, `Schemes?`, `Strategy` and `Codes?` ("RBI Integrated
// Ombudsman Scheme 2021", "CBN Consumer Protection Framework 2016", "National Payments
// Strategy 2022-2025"). Nothing is on this list that the corpus did not actually produce.
const INSTRUMENT_NOUN_BEFORE =
  /\b(?:Acts?|Laws?|Bills?|Ordinances?|Ordonnances?|Directives?|Regulations?|Standards?|Guidelines?|Rules?|Bulletins?|Circulars?|Reports?|Frameworks?|Schemes?|Strategy|Codes?|amendments?|No\.?|nr)\s*,?\s+(?:No\.?\s*\d+\s+of\s+)?$/;
const ALLCAPS_TOKEN_BEFORE = /\b[A-Z][A-Z0-9-]{2,}\s$/;
// Rule 6. "pre-2021 records", "post-2023 Administrative Guidance" — a named period.
const ERA_PREFIX_BEFORE = /\b(?:pre|post)-$/i;
const CURRENCY_WORDS = /\b(?:as of|since|until|through)\b/i;

export interface YearHit {
  year: number;
  line: number;
  context: string;
  allowed: boolean;
}

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
      // 3. parenthetical tag — nearest '(' before with no ')' in between, and a ')' after
      //    with no '(' in between
      const openIdx = text.lastIndexOf('(', start);
      const closeIdx = text.indexOf(')', end);
      if (openIdx !== -1 && closeIdx !== -1) {
        const inner = text.slice(openIdx + 1, closeIdx);
        if (
          !inner.includes(')') &&
          !inner.includes('(') &&
          !inner.includes('\n') &&
          !CURRENCY_WORDS.test(inner)
        ) {
          allowed = true;
        }
      }
    }
    // 4. a specific date — unless "as of" makes it a snapshot claim
    if (!allowed && FULL_DATE_BEFORE.test(before) && !SNAPSHOT_BEFORE_DATE.test(before)) {
      allowed = true;
    }
    if (!allowed && INSTRUMENT_NOUN_AFTER.test(after)) allowed = true; // 5a. "2020 amendments"
    if (!allowed && INSTRUMENT_NOUN_BEFORE.test(before)) allowed = true; // 5b. "Act 2018"
    if (!allowed && ALLCAPS_TOKEN_BEFORE.test(before)) allowed = true; // 5c. "COBIT 2019"
    if (!allowed && ERA_PREFIX_BEFORE.test(before)) allowed = true; // 6. "post-2023"

    hits.push({ year, line, context, allowed });
  }
  return hits;
}
