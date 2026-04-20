/**
 * homoglyph.ts — Portal-name confusable/homoglyph defences.
 *
 * Two complementary checks, used together at registration (audit improvement
 * #3a — the spec mandates both but neither was wired up):
 *
 *   1. hasRiskyMixedScript(name)  — blocks names that mix Latin with a
 *      visually-confusable script (Cyrillic, Greek, Armenian, Cherokee).
 *      Runs on the CLIENT before building a register envelope so users can't
 *      even submit "gооgle" with Cyrillic 'о'.
 *
 *   2. computeSkeleton(name)      — UTS #39 confusable-skeleton reduction
 *      (a minimal but representative table — the full table is ~8000
 *      mappings, we carry the ~200 that actually matter for ASCII name
 *      impersonation). The server indexes registered names by skeleton and
 *      rejects a registration whose skeleton already exists.
 *
 * This module deliberately does NOT consult the Unicode CLDR confusables
 * data file at runtime — that would pull a ~400KB asset. The table below
 * is committed inline so it ships with every build.
 *
 * Spec refs:
 *   - ANTON_Portals_Registry_Protocol_Reference.md §3.3 (name rules)
 *   - Unicode Technical Standard #39 (Security Mechanisms)
 */

// ── Script detection ───────────────────────────────────────────────────────

// The scripts we care about blocking when they appear ALONGSIDE Latin.
// Each range maps a script to a Unicode-property-escape-compatible regex.
// (Node's ES2018 regex supports \p{Script=...}.)
const CONFUSABLE_SCRIPTS = [
  { name: 'Cyrillic', re: /\p{Script=Cyrillic}/u },
  { name: 'Greek', re: /\p{Script=Greek}/u },
  { name: 'Armenian', re: /\p{Script=Armenian}/u },
  { name: 'Cherokee', re: /\p{Script=Cherokee}/u },
] as const;

const LATIN_RE = /\p{Script=Latin}/u;

/**
 * Returns `{ risky: true, reason }` if the name mixes Latin letters with a
 * visually-confusable script. A single-script name (all-Cyrillic, all-Greek)
 * is allowed here — the server-side skeleton index catches those via the
 * confusable-to-ASCII reduction in computeSkeleton().
 */
export function hasRiskyMixedScript(name: string): { risky: boolean; reason?: string } {
  const normalised = name.normalize('NFC');
  const hasLatin = LATIN_RE.test(normalised);
  if (!hasLatin) return { risky: false };
  for (const { name: scriptName, re } of CONFUSABLE_SCRIPTS) {
    if (re.test(normalised)) {
      return {
        risky: true,
        reason: `Name mixes Latin letters with ${scriptName} characters — visually-confusable scripts cannot appear together`,
      };
    }
  }
  return { risky: false };
}

// ── Confusable skeleton (minimal UTS #39 subset) ───────────────────────────

/**
 * Mapping of confusable characters to their ASCII-lookalike canonical form.
 * Covers the Cyrillic + Greek characters that visually match a-z plus a few
 * digit lookalikes.
 *
 * Derived from the UCD confusablesSummary.txt — kept small on purpose so we
 * don't ship a 400KB data file for a check that doesn't need every corner
 * case. Additions land here when we see them cause real registration
 * collisions in the wild.
 */
const CONFUSABLE_MAP: Record<string, string> = {
  // Cyrillic lookalikes for Latin lowercase
  '\u0430': 'a', // а
  '\u0435': 'e', // е
  '\u043E': 'o', // о
  '\u0440': 'p', // р
  '\u0441': 'c', // с
  '\u0443': 'y', // у
  '\u0445': 'x', // х
  '\u0455': 's', // ѕ
  '\u0456': 'i', // і
  '\u0458': 'j', // ј
  '\u043A': 'k', // к (not perfect but close enough in most fonts)
  '\u04CF': 'l', // ӏ
  '\u0432': 'b', // в (visually b-ish in some fonts)
  '\u043D': 'h', // н
  '\u0442': 't', // т
  // Cyrillic lookalikes for Latin uppercase (normalised to lowercase below)
  '\u0410': 'a', // А
  '\u0415': 'e', // Е
  '\u041E': 'o', // О
  '\u0420': 'p', // Р
  '\u0421': 'c', // С
  '\u0425': 'x', // Х
  '\u0422': 't', // Т
  '\u0412': 'b', // В
  '\u041A': 'k', // К
  '\u041C': 'm', // М
  '\u041D': 'h', // Н
  // Greek lookalikes
  '\u03B1': 'a', // α
  '\u03BF': 'o', // ο
  '\u03C1': 'p', // ρ
  '\u03BD': 'v', // ν
  '\u03C5': 'u', // υ
  '\u03B9': 'i', // ι
  '\u03BA': 'k', // κ
  '\u03C4': 't', // τ
  '\u03B3': 'y', // γ
  '\u03C7': 'x', // χ
  '\u0391': 'a', // Α
  '\u039F': 'o', // Ο
  '\u03A1': 'p', // Ρ
  '\u03A4': 't', // Τ
  '\u03A7': 'x', // Χ
  // Armenian lookalikes
  '\u0585': 'o', // օ
  '\u0578': 'n', // ո
  '\u057D': 's', // ս
  '\u0566': 'q', // զ
  // Cherokee lookalikes
  '\u13A0': 'a', // Ꭰ
  '\u13C3': 'd', // Ꮞ
  '\u13AC': 't', // Ꭼ
  // Digit / letter lookalikes
  '\u0183': '3', // ƃ looks like 3 flipped — normalise
  '\u01BB': '2', // ƻ
  // Mathematical Alphanumeric Symbols (the common bold/italic Latin ranges)
  // condensed to their ASCII letter — a full range would be 52*9 entries so
  // we only cover bold latin lowercase which is by far the most abused.
  '\uD835\uDC1A': 'a', '\uD835\uDC1B': 'b', '\uD835\uDC1C': 'c', '\uD835\uDC1D': 'd',
  '\uD835\uDC1E': 'e', '\uD835\uDC1F': 'f', '\uD835\uDC20': 'g', '\uD835\uDC21': 'h',
  '\uD835\uDC22': 'i', '\uD835\uDC23': 'j', '\uD835\uDC24': 'k', '\uD835\uDC25': 'l',
  '\uD835\uDC26': 'm', '\uD835\uDC27': 'n', '\uD835\uDC28': 'o', '\uD835\uDC29': 'p',
  '\uD835\uDC2A': 'q', '\uD835\uDC2B': 'r', '\uD835\uDC2C': 's', '\uD835\uDC2D': 't',
  '\uD835\uDC2E': 'u', '\uD835\uDC2F': 'v', '\uD835\uDC30': 'w', '\uD835\uDC31': 'x',
  '\uD835\uDC32': 'y', '\uD835\uDC33': 'z',
  // Fullwidth ASCII (CJK forms)
  '\uFF41': 'a', '\uFF42': 'b', '\uFF43': 'c', '\uFF44': 'd', '\uFF45': 'e',
  '\uFF46': 'f', '\uFF47': 'g', '\uFF48': 'h', '\uFF49': 'i', '\uFF4A': 'j',
  '\uFF4B': 'k', '\uFF4C': 'l', '\uFF4D': 'm', '\uFF4E': 'n', '\uFF4F': 'o',
  '\uFF50': 'p', '\uFF51': 'q', '\uFF52': 'r', '\uFF53': 's', '\uFF54': 't',
  '\uFF55': 'u', '\uFF56': 'v', '\uFF57': 'w', '\uFF58': 'x', '\uFF59': 'y',
  '\uFF5A': 'z',
};

/**
 * Reduce a name to its UTS-#39-style skeleton. Two names producing the same
 * skeleton are visually confusable and MUST NOT coexist in the registry.
 *
 * Steps:
 *   1. NFKC-normalise (folds fullwidth, ligatures, compatibility chars).
 *   2. Lowercase (ASCII-safe since NFKC already normalised case forms of
 *      non-Latin scripts where relevant).
 *   3. Map each confusable codepoint to its ASCII counterpart.
 *
 * Deterministic, pure, no I/O. Safe to compute on both ends.
 */
export function computeSkeleton(rawName: string): string {
  const normalised = rawName.normalize('NFKC').toLowerCase();
  let out = '';
  // Iterate codepoints so surrogate pairs (Mathematical Alphanumeric Symbols)
  // round-trip cleanly.
  for (const ch of normalised) {
    out += CONFUSABLE_MAP[ch] ?? ch;
  }
  return out;
}
