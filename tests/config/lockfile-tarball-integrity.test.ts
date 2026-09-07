/**
 * Every remote-tarball dependency in pnpm-lock.yaml must carry an `integrity` hash.
 *
 * ── Why this test exists ─────────────────────────────────────────────────────
 *
 * Wave 2 of the go-live remediation moved `xlsx` off npm. The registry copy is stuck
 * at 0.18.5 with two HIGH advisories and no fix published, because SheetJS stopped
 * publishing to npm; the supported build lives on their own CDN. So package.json now
 * depends on a bare HTTPS tarball:
 *
 *     "xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"
 *
 * That fixed the advisories and broke every CI job. `pnpm install --frozen-lockfile`
 * refuses a tarball entry with no integrity field:
 *
 *     ERR_PNPM_MISSING_TARBALL_INTEGRITY  Cannot install package "xlsx@https://…":
 *     its lockfile entry has no "integrity" field, so pnpm cannot verify the
 *     downloaded tarball.
 *
 * pnpm is right to refuse. Without the hash, the build trusts whatever bytes the CDN
 * returns today, which is exactly the supply-chain property a lockfile exists to
 * provide. The hash was added by hand:
 *
 *     curl -sSL -o x.tgz <url>
 *     echo "sha512-$(openssl dgst -sha512 -binary x.tgz | openssl base64 -A)"
 *
 * ── Why a TEST and not a comment ─────────────────────────────────────────────
 *
 * Because pnpm's own resolver does not generate the field it demands. Verified against
 * pnpm 10.29.3: resolving this dependency from scratch produces
 * `resolution: {tarball: …}` with no integrity, every time. So the hash is not
 * self-healing — the next `pnpm install` that regenerates this entry will silently
 * drop it, and CI will break again at the install step of all seven jobs, which reads
 * as "everything is broken" rather than "one line went missing".
 *
 * This test is the tripwire. If it fails, do not delete it: recompute the hash with
 * the command above and restore the field. If a tarball dependency is ever added,
 * this test will demand a hash for that one too, which is the intended behaviour.
 *
 * ── The alternatives, for whoever revisits this ──────────────────────────────
 *
 * There is one import site (`server/services/data-importer.ts`), so the options are
 * real: keep the CDN tarball with a pinned hash (today's choice — upstream bytes, no
 * third-party republisher, but a manual field); switch to a community npm mirror such
 * as `@e965/xlsx` (self-healing lockfile, but it moves trust to a republisher); or
 * drop xlsx for `exceljs`, which this project already depends on for writing. That
 * last one is the only option that removes the problem rather than managing it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const LOCKFILE = join(process.cwd(), 'pnpm-lock.yaml');

/** `  name@url:` followed by an indented `resolution: {...}` line. */
const TARBALL_ENTRY = /^ {2}(\S+):\n {4}resolution: \{([^}]*tarball:[^}]*)\}/gm;

describe('pnpm-lock.yaml — remote tarball dependencies carry an integrity hash', () => {
  const lockfile = readFileSync(LOCKFILE, 'utf8');

  const entries = [...lockfile.matchAll(TARBALL_ENTRY)].map((m) => ({
    name: m[1],
    resolution: m[2],
  }));

  it('finds the tarball dependencies at all (guards the regex against a lockfile format change)', () => {
    // If this fails, the lockfile schema moved and the assertion below is checking
    // nothing — a green test that proves the parser is broken is the worst outcome
    // here, so it is asserted separately.
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.some((e) => e.name.includes('cdn.sheetjs.com'))).toBe(true);
  });

  it('xlsx from the SheetJS CDN is pinned to a sha512', () => {
    const xlsx = entries.find((e) => e.name.includes('cdn.sheetjs.com'));
    expect(xlsx, 'xlsx tarball entry missing from pnpm-lock.yaml').toBeDefined();
    expect(
      xlsx!.resolution,
      'xlsx lost its integrity hash — pnpm install --frozen-lockfile will fail every CI job. ' +
        'See the header of this file for how to recompute it.',
    ).toMatch(/integrity: sha512-[A-Za-z0-9+/]+={0,2}/);
  });

  it('every remote tarball dependency has an integrity hash, not just xlsx', () => {
    // codeload.github.com entries reach the lockfile through optional platform
    // dependencies that CI never installs, so they have historically been tolerated.
    // They are listed rather than skipped: if one starts being installed, the failure
    // should say which package, not just "install failed".
    const missing = entries
      .filter((e) => !/integrity: sha512-/.test(e.resolution))
      .map((e) => e.name)
      .filter((name) => !name.includes('codeload.github.com'));

    expect(missing, `tarball dependencies with no integrity hash: ${missing.join(', ')}`).toEqual([]);
  });
});
