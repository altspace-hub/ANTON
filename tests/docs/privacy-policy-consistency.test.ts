/**
 * privacy-policy-consistency.test.ts — three copies of one legal document.
 *
 * The privacy policy exists in three places, each with a reason:
 *
 *   docs/legal/privacy-policy.md    canonical source, for the homepage build
 *   docs/legal/privacy-policy.html  self-contained, generated from the .md, hostable as-is
 *   docs/help/privacy.html          the in-product copy, on the help-site template
 *
 * That is a drift problem waiting to happen, and the failure mode is nasty: a policy
 * that says one thing at the URL filed with Google Play and something else inside the
 * app is worse than one that says nothing, because it is now a misrepresentation rather
 * than an omission. Nobody notices until it matters, and by then the wrong version has
 * been relied on.
 *
 * So this pins the CLAIMS rather than the bytes. The three renderings legitimately
 * differ in markup, wrapping and entity encoding, and asserting equality of text would
 * fail on formatting and get deleted the first time it did. What must not differ is
 * what the document promises — particularly the load-bearing negatives, which exist to
 * stop us over-claiming and are exactly what a careless edit would soften.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n');

const MD = 'docs/legal/privacy-policy.md';
const STANDALONE = 'docs/legal/privacy-policy.html';
const IN_PRODUCT = 'docs/help/privacy.html';

/** Strip tags, entities and markdown emphasis so the three become comparable prose. */
function prose(raw: string): string {
  return raw
    .replace(/<!--[\s\S]*?-->/g, ' ')          // editor-facing comments
    .replace(/<style[\s\S]*?<\/style>/gi, ' ') // inline CSS in the standalone page
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')     // help-site sidebar
    .replace(/<[^>]+>/g, ' ')
    .replace(/&mdash;/g, '—').replace(/&euro;/g, '€').replace(/&rarr;/g, '→')
    .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
    .replace(/[*_`>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/**
 * The substantive commitments. Each is a phrase that must survive rewording of the
 * surrounding sentence — if one genuinely changes, this test should fail and the change
 * should be deliberate.
 */
const CLAIMS: Array<[string, string]> = [
  ['no account system',        'there is no account system'],
  ['cannot read messages',     'we cannot read your messages'],
  ['no data selling',          'we do not sell or rent personal data'],
  ['no ad identifiers',        'we do not use advertising identifiers'],
  ['on-chain permanence',      'public and permanent'],
  ['on-chain undeletable',     'cannot be deleted, edited or withdrawn'],
  ['payer name is public',     "the payer's name"],
  ['travel-rule threshold',    '1,000 or more'],
  ['address↔IP linkage',       'associate the address with your ip address'],
  ['NO forward secrecy claim', 'do not claim forward secrecy'],
  ['FS not externally reviewed', 'not yet been externally reviewed'],
  ['school stores nothing',    'ordinary conversations are not stored'],
  ['school category only',     'never what the pupil wrote'],
  ['keys are on-device',       'private keys, recovery phrases'],
  ['user-configured provider', 'using your api key'],
  ['relay sees routing only',  'cannot decrypt, the content'],
  ['not legal advice',         'not legal advice'],
];

describe('all three copies of the privacy policy exist', () => {
  it.each([MD, STANDALONE, IN_PRODUCT])('%s', (p) => {
    expect(existsSync(join(process.cwd(), p)), `${p} is missing`).toBe(true);
    // Guards the claim checks below from passing vacuously over a stub.
    expect(prose(read(p)).length).toBeGreaterThan(5000);
  });
});

describe.each(CLAIMS)('claim: %s', (_label, phrase) => {
  it.each([MD, STANDALONE, IN_PRODUCT])('is present in %s', (p) => {
    expect(
      prose(read(p)),
      `"${phrase}" is missing from ${p} — if the policy genuinely changed, change all `
      + 'three and update this test deliberately.',
    ).toContain(phrase.toLowerCase());
  });
});

describe('the negatives have not been quietly softened', () => {
  // These are the ones that protect us from over-claiming. A well-meaning edit that
  // turns "we do not claim forward secrecy" into "your messages are fully secure" would
  // satisfy a reader and misrepresent the product.
  //
  // These must match the AFFIRMATIVE form only. The first version of this list held the
  // bare substring 'forward secrecy for all', which fired on the correct sentence — "we
  // do not claim forward secrecy for all traffic" — i.e. the guard flagged the very
  // wording it exists to protect. A denylist over a document that discusses its own
  // limitations has to distinguish the claim from its negation.
  const FORBIDDEN: Array<[string, RegExp]> = [
    ['claims forward secrecy',   /(?<!do not |does not |never )(?:we )?(?:claim|provide|offer|guarantee)s? forward secrecy/],
    ['guarantees security',      /we guarantee/],
    ['claims full anonymity',    /completely anonymous|fully anonymous/],
    ['claims untraceability',    /cannot be traced/],
    ['overstates encryption',    /fully encrypted at all times|encrypted end to end at all times/],
    ['claims reversibility',     /payments can be reversed|transactions can be reversed/],
    ['claims on-chain deletion', /we can delete your on-chain|remove the on-chain record for you/],
  ];

  it.each([MD, STANDALONE, IN_PRODUCT])('%s makes no overclaim', (p) => {
    const text = prose(read(p));
    const found = FORBIDDEN.filter(([, re]) => re.test(text)).map(([label]) => label);
    expect(found, `overclaim in ${p}: ${found.join(', ')}`).toEqual([]);
  });

  it('the overclaim check can actually fire', () => {
    // Without this the regexes above could all be silently broken and every document
    // would pass — the failure mode this whole file is about, one level up.
    const [, claimsFS] = FORBIDDEN[0];
    expect(claimsFS.test('anton provides forward secrecy on every message')).toBe(true);
    expect(claimsFS.test('we do not claim forward secrecy for all traffic')).toBe(false);
  });
});

describe('the standalone page really is standalone', () => {
  // It is the copy meant for the homepage, on a machine that has none of this repo's
  // assets. A stylesheet link or a CDN font would render it unstyled or leak a request.
  const html = read(STANDALONE);

  it('references no external file', () => {
    expect(html).not.toMatch(/<link[^>]+stylesheet/i);
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/https?:\/\//);
  });

  it('carries its own styles, so it is not merely link-free and unstyled', () => {
    expect(html).toMatch(/<style>/);
    expect(html).toMatch(/prefers-color-scheme/);
  });

  it('has no relative links that would 404 off the help site', () => {
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    const relative = hrefs.filter((h) => !h.startsWith('#') && !h.startsWith('mailto:'));
    expect(relative, `would break off-site: ${relative.join(', ')}`).toEqual([]);
  });
});
