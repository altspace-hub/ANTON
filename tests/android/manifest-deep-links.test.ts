/**
 * manifest-deep-links.test.ts — an http/https intent filter without an
 * android:host claims EVERY web link on the device.
 *
 * The Companion manifest shipped an <intent-filter android:autoVerify="true">
 * with <data android:scheme="https"/> and two <data android:pathPrefix=…/>
 * elements, and no host. Android's <data> merge rule is that when a filter
 * names no host, the port and ALL path attributes are ignored — so the filter
 * did not match /anton/enroll and /anton/join, it matched every https URI.
 * Companion therefore offered itself in the chooser for every link the user
 * tapped anywhere, which is both a phishing surface and the kind of thing a
 * Play reviewer opens the manifest to look for. autoVerify could never have
 * rescued it either: verification needs a domain to fetch assetlinks.json
 * from, and each deployment's pairing host is the operator's own.
 *
 * Written as a structural rule over every filter rather than an assertion that
 * one specific block is gone, because the failure mode is "someone adds an App
 * Link filter and forgets the host" — the same mistake, not the same block.
 *
 * ── 2026-09-07: this guard was audited and had two holes ─────────────────────
 *
 * A CodeQL alert on the comment-strip below prompted a proper look at whether
 * the guard actually guards. The alert itself was a false positive — the
 * stripped string reaches nothing but expect() — but the audit found two real
 * defects, neither of them the thing CodeQL flagged:
 *
 *   1. THE MATCHERS ONLY UNDERSTOOD ONE SPELLING. They hardcoded `="`, so
 *      android:scheme='https' (single quotes) and android:scheme = "https"
 *      (whitespace around =) both sailed past. XML permits either quote
 *      character and whitespace around `=`, and aapt2 accepts all of it, so a
 *      host-less autoVerify filter written either way was invisible to a guard
 *      whose entire job is to see it.
 *
 *   2. IT COVERED ONE APP OUT OF FIVE ON CI. The four private trees are
 *      gitignored (.gitignore:124-132, deliberately), so `describe.each` over
 *      the ones present on disk emitted ZERO tests on a public runner and the
 *      file reported green. It only ever covered all five on a machine that
 *      happened to have the private trees checked out — i.e. never on CI, which
 *      is the one place the guard has to hold.
 *
 * Both are fixed below: attributes are parsed rather than string-matched, and
 * the four private manifests are committed as fixtures in tests/android/fixtures/
 * so CI checks all five. See the fixture block for what that does and does not buy.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const COMPANION_MANIFEST = join(process.cwd(), 'android/app/src/main/AndroidManifest.xml');

/**
 * Split the manifest into its <intent-filter …>…</intent-filter> blocks.
 *
 * Comments are stripped first. A comment explaining a removed filter quotes the
 * markup it is warning about, and without this the scanner treats that prose as
 * a live declaration — the guard then fails on the very note that documents the
 * fix, which is worse than useless: it teaches the next reader to delete the
 * explanation to get green.
 *
 * The strip is regex, not a parser, so it can in principle be fooled by a `<!--`
 * that XML does not consider a comment start — inside CDATA, say, where the
 * strip would swallow a live filter and hide it. No manifest here uses CDATA and
 * none has any reason to, so rather than carry a parser for a case that does not
 * exist, `hasNoCdata` below asserts the precondition and fails loudly if that
 * ever stops being true.
 */
function intentFilters(xml: string): string[] {
  const live = xml.replace(/<!--[\s\S]*?-->/g, '');
  return [...live.matchAll(/<intent-filter[\s\S]*?<\/intent-filter>/g)].map((m) => m[0]);
}

/**
 * Every value of one android:* attribute in a filter.
 *
 * Parsed, not string-matched. XML's AttValue accepts either quote character and
 * permits whitespace around `=`, so `android:scheme="https"`, `='https'` and
 * `android:scheme = "https"` are the same declaration to aapt2 and must be the
 * same declaration here. The backreference keeps the quote characters paired, so
 * an apostrophe inside a double-quoted value does not truncate the match.
 */
function attrValues(filter: string, name: string): string[] {
  const re = new RegExp(`android:${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, 'g');
  return [...filter.matchAll(re)].map((m) => m[2]);
}

const hasWebScheme = (f: string) => attrValues(f, 'scheme').some((s) => /^https?$/i.test(s));
const hasHost      = (f: string) => attrValues(f, 'host').length > 0;
const autoVerified = (f: string) => attrValues(f, 'autoVerify').some((v) => v.trim() === 'true');
const isViewFilter = (f: string) => /android\.intent\.action\.VIEW/.test(f);
const customSchemes = (f: string) => attrValues(f, 'scheme').filter((s) => !/^https?$/i.test(s));
const hasNoCdata   = (xml: string) => !/<!\[CDATA\[/.test(xml);

/**
 * The rules themselves, applied to one manifest's text.
 *
 * Extracted so the Companion tree and the four fixture manifests run the SAME
 * assertions rather than two hand-maintained copies that drift — the original
 * file had exactly that duplication, and the copied-bug story below is what
 * happens when two copies of a rule are meant to stay in step.
 */
function assertDeepLinkRules(label: string, xml: string, opts: { expectCustomScheme?: boolean } = {}) {
  expect(
    hasNoCdata(xml),
    `${label}: manifest contains a CDATA section. The comment strip in intentFilters() is a\n` +
    'regex and a `<!--` inside CDATA would make it swallow live markup. Replace the strip\n' +
    'with a real XML parse before adding CDATA to a manifest.',
  ).toBe(true);

  const filters = intentFilters(xml);
  expect(filters.length, `${label}: parsed no intent filters at all — the scanner is broken, not the manifest`)
    .toBeGreaterThan(0);

  expect(
    filters.filter((f) => hasWebScheme(f) && !hasHost(f)),
    `${label}: an http/https <intent-filter> with no android:host matches EVERY web URL on\n` +
    'the device (Android ignores pathPrefix/pathPattern when no host is given). Either name\n' +
    'the host this build actually serves from, or use the app\'s own custom scheme.',
  ).toEqual([]);

  expect(
    filters.filter((f) => autoVerified(f) && !hasHost(f)),
    `${label}: autoVerify="true" requires an android:host plus a served assetlinks.json.\n` +
    'With no host there is no domain whose /.well-known/assetlinks.json Android could fetch,\n' +
    'so verification can never succeed.',
  ).toEqual([]);

  if (opts.expectCustomScheme) {
    // The paired positive: a manifest with every deep link deleted would satisfy both
    // rules above and silently break pairing. Assert the shape, not a name — each app
    // owns a distinct scheme (anton://, anton-agent://, futurechain://, antoncomm://).
    const viewFilters = filters.filter(isViewFilter);
    if (viewFilters.length > 0) {
      expect(
        viewFilters.some((f) => customSchemes(f).length > 0),
        `${label}: every VIEW filter is http/https. Deep links route through a custom scheme;\n` +
        'losing it breaks pairing while leaving both rules above satisfied.',
      ).toBe(true);
    }
  }
}

describe('Companion Android manifest — deep links', () => {
  const xml = () => readFileSync(COMPANION_MANIFEST, 'utf8');

  it('has a manifest to check', () => {
    // Without this, a moved or renamed file would make every rule below pass
    // over an empty list.
    expect(existsSync(COMPANION_MANIFEST), `${COMPANION_MANIFEST} missing`).toBe(true);
    expect(intentFilters(xml()).length).toBeGreaterThan(2);
  });

  it('obeys the deep-link rules', () => {
    assertDeepLinkRules('android (Companion)', xml());
  });

  it('still routes the anton:// pairing links, which is how pairing QRs are minted', () => {
    // Companion's schemes are named explicitly rather than shape-checked, because
    // src/pages/AppGatewayPage.tsx mints anton://enroll?… and anton://join?… and a
    // rename on either side breaks pairing silently.
    const filters = intentFilters(xml());
    const routes = (host: string) =>
      filters.some((f) => attrValues(f, 'scheme').includes('anton') && attrValues(f, 'host').includes(host));
    expect(routes('enroll'), 'anton://enroll filter missing').toBe(true);
    expect(routes('join'), 'anton://join filter missing').toBe(true);
  });
});

/**
 * The same rule for every other Android tree.
 *
 * The host-less autoVerify filter was not a Companion mistake, it was a copied
 * one: android-agent's manifest began as a verbatim copy of Companion's and
 * carried the same block, still claiming every https URL on the device after the
 * Companion fix landed. Fixing one copy of a copied bug and leaving the other is
 * how it comes back.
 *
 * ── Why fixtures, and what they are worth ────────────────────────────────────
 *
 * The four private app trees are gitignored from the public repo, deliberately
 * (.gitignore:124-132). Reading them directly meant the whole block below emitted
 * ZERO tests on CI while reporting green — the guard was absent exactly where it
 * needed to hold. Un-ignoring the trees would reverse a deliberate decision for a
 * test's convenience, so instead each manifest is committed as a fixture here.
 * They disclose nothing: hosts, custom schemes and applicationIds are all readable
 * from any shipped APK, and the only key-shaped string is the resource reference
 * @string/google_cloud_project_number, not a value.
 *
 * BE HONEST ABOUT THE LIMIT. On CI the fixture is what is checked, so a change to a
 * private manifest that never reaches the fixture is not caught there. The drift
 * test closes that on any machine that HAS the tree — which is every machine that
 * can edit one — and it fails loudly rather than skipping. So: CI proves the rules
 * hold for a known-good snapshot of all five apps; a developer's machine proves the
 * snapshot still matches reality. Neither alone is sufficient, and the pair is
 * strictly more than the nothing that was here before.
 */
const OTHER_TREES = ['android-agent', 'android-pay', 'android-comm', 'android-business'] as const;

const FIXTURE_DIR = join(process.cwd(), 'tests/android/fixtures');
const fixturePath = (dir: string) => join(FIXTURE_DIR, `${dir}.AndroidManifest.xml`);
const livePath = (dir: string) => join(process.cwd(), dir, 'app/src/main/AndroidManifest.xml');

describe('every app tree has a committed manifest fixture', () => {
  // The guard on the guard. If a fixture goes missing, describe.each below would
  // shrink silently — which is the exact failure this whole change exists to fix,
  // so it is asserted as a fixed-size expectation rather than a loop over whatever
  // happens to be on disk.
  it('covers all four private trees, by name', () => {
    const missing = OTHER_TREES.filter((dir) => !existsSync(fixturePath(dir)));
    expect(
      missing,
      `missing manifest fixtures: ${missing.join(', ')}. Recreate with:\n` +
      '  cp <tree>/app/src/main/AndroidManifest.xml tests/android/fixtures/<tree>.AndroidManifest.xml',
    ).toEqual([]);
    expect(OTHER_TREES.length).toBe(4);
  });
});

describe.each(OTHER_TREES)('%s Android manifest — deep links', (dir) => {
  it('obeys the deep-link rules (committed fixture — this is what CI checks)', () => {
    assertDeepLinkRules(dir, readFileSync(fixturePath(dir), 'utf8'), { expectCustomScheme: true });
  });

  it('fixture matches the working tree, when the tree is present', (ctx) => {
    // Skipped on public CI, where the tree is gitignored and absent. Not skipped on
    // any machine that can actually change the manifest — which is where drift starts.
    if (!existsSync(livePath(dir))) {
      ctx.skip();
      return;
    }
    expect(
      readFileSync(fixturePath(dir), 'utf8'),
      `${dir}: the committed fixture no longer matches ${dir}/app/src/main/AndroidManifest.xml.\n` +
      'CI checks the fixture, so an un-refreshed fixture means the real manifest is unguarded.\n' +
      'Refresh it:\n' +
      `  cp ${dir}/app/src/main/AndroidManifest.xml tests/android/fixtures/${dir}.AndroidManifest.xml`,
    ).toBe(readFileSync(livePath(dir), 'utf8'));
  });
});
