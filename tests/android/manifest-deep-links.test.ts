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
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const MANIFEST = join(process.cwd(), 'android/app/src/main/AndroidManifest.xml');

/**
 * Split the manifest into its <intent-filter …>…</intent-filter> blocks.
 *
 * Comments are stripped first. A comment explaining a removed filter quotes the
 * markup it is warning about, and without this the scanner treats that prose as
 * a live declaration — the guard then fails on the very note that documents the
 * fix, which is worse than useless: it teaches the next reader to delete the
 * explanation to get green.
 */
function intentFilters(xml: string): string[] {
  const live = xml.replace(/<!--[\s\S]*?-->/g, '');
  return [...live.matchAll(/<intent-filter[\s\S]*?<\/intent-filter>/g)].map((m) => m[0]);
}

const hasWebScheme = (f: string) => /android:scheme="https?"/.test(f);
const hasHost      = (f: string) => /android:host="/.test(f);
const autoVerified = (f: string) => /android:autoVerify="true"/.test(f);

describe('Companion Android manifest — deep links', () => {
  it('has a manifest to check', () => {
    // Without this, a moved or renamed file would make every rule below pass
    // over an empty list.
    expect(existsSync(MANIFEST), `${MANIFEST} missing`).toBe(true);
    expect(intentFilters(readFileSync(MANIFEST, 'utf8')).length).toBeGreaterThan(2);
  });

  it('declares no http/https filter without an explicit android:host', () => {
    const bad = intentFilters(readFileSync(MANIFEST, 'utf8')).filter(
      (f) => hasWebScheme(f) && !hasHost(f),
    );
    expect(
      bad,
      'An http/https <intent-filter> with no android:host matches EVERY web URL on the\n' +
      'device (Android ignores pathPrefix/pathPattern when no host is given). Either name\n' +
      'the host this build actually serves pairing from, or use the anton:// scheme.',
    ).toEqual([]);
  });

  it('declares no autoVerify filter without a host to verify against', () => {
    // autoVerify with no host can never succeed — there is no domain whose
    // /.well-known/assetlinks.json Android could fetch. Kept as its own rule so
    // a regression names the real problem instead of a diff.
    const bad = intentFilters(readFileSync(MANIFEST, 'utf8')).filter(
      (f) => autoVerified(f) && !hasHost(f),
    );
    expect(bad, 'autoVerify="true" requires an android:host plus a served assetlinks.json').toEqual([]);
  });

  it('still routes the anton:// pairing links, which is how pairing QRs are minted', () => {
    // The paired positive: a manifest with every deep link deleted would satisfy
    // the two rules above and silently break pairing. src/pages/AppGatewayPage.tsx
    // emits anton://enroll?… (and anton://join?… for legacy invitations).
    const filters = intentFilters(readFileSync(MANIFEST, 'utf8'));
    expect(filters.some((f) => /android:scheme="anton"/.test(f) && /android:host="enroll"/.test(f))).toBe(true);
    expect(filters.some((f) => /android:scheme="anton"/.test(f) && /android:host="join"/.test(f))).toBe(true);
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
 * The private app trees are gitignored from the public repo, so each is skipped
 * when absent rather than failing. On public CI that leaves Companion — which is
 * where the bug was first found — and locally it covers all five.
 */
const OTHER_TREES = ['android-agent', 'android-pay', 'android-comm', 'android-business'];

const present = OTHER_TREES
  .map((dir) => ({ dir, path: join(process.cwd(), dir, 'app/src/main/AndroidManifest.xml') }))
  .filter((t) => existsSync(t.path));

describe.each(present)('$dir Android manifest — deep links', (tree) => {
  const filters = () => intentFilters(readFileSync(tree.path, 'utf8'));

  it('parses to real intent filters', () => {
    expect(filters().length).toBeGreaterThan(0);
  });

  it('declares no http/https filter without an explicit android:host', () => {
    expect(
      filters().filter((f) => hasWebScheme(f) && !hasHost(f)),
      `${tree.dir}: an http/https <intent-filter> with no android:host matches EVERY web\n` +
      'URL on the device. Name the host, or use this app\'s own custom scheme.',
    ).toEqual([]);
  });

  it('declares no autoVerify filter without a host to verify against', () => {
    expect(
      filters().filter((f) => autoVerified(f) && !hasHost(f)),
      `${tree.dir}: autoVerify="true" requires an android:host plus a served assetlinks.json`,
    ).toEqual([]);
  });

  it('keeps at least one custom-scheme VIEW filter, so links still route', () => {
    // The paired positive again: deleting every deep link would satisfy the rules
    // above and quietly break pairing. Each app owns a distinct scheme —
    // anton-agent://, futurechain://, and so on — so assert the shape, not a name.
    const viewFilters = filters().filter((f) => /android\.intent\.action\.VIEW/.test(f));
    if (viewFilters.length === 0) return; // an app with no deep links at all is fine
    expect(viewFilters.some((f) => /android:scheme="(?!https?")[^"]+"/.test(f))).toBe(true);
  });
});
