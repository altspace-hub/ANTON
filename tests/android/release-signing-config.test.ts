/**
 * release-signing-config.test.ts — the release build must actually be buildable.
 *
 * On 2026-09-05 a guard was appended to every app's `build.gradle` to stop an
 * UNSIGNED release artifact being produced when `keystore.properties` is absent:
 *
 *     if (!hasKeystore) { throw new GradleException(...) }
 *
 * It was written against the pay/comm/business layout, where `hasKeystore` is a
 * project-scope `def` at the top of the file. Companion and ANTON Agent load the
 * keystore INSIDE `signingConfigs.release` instead, so in those two the guard
 * referenced a property that did not exist. Every release build of both apps died
 * at configuration time with
 *
 *     Could not get unknown property 'hasKeystore' for project ':app'
 *
 * — found on 2026-09-06 by running the release chain for all five apps, a day
 * after the guard landed. Nothing else surfaces it: debug builds, `pnpm test`,
 * typecheck and CI are all completely silent, because the guard only runs when
 * an assemble/bundleRelease task is in the graph.
 *
 * Fixing that exposed a second one underneath. The two families keep their
 * keystores in different places:
 *
 *     pay / comm / business   repo root      android-<app>/keystore.properties
 *                                            says ../x.keystore, resolved by
 *                                            rootProject.file() from android-<app>/
 *     companion / agent       inside the     android-tree/keystore.properties says
 *                             android tree   ../x.keystore, resolved by file()
 *                                            from android-tree/app/
 *
 * so copying `rootProject.file(...)` into Companion pointed one directory too
 * high and failed `validateSigningRelease`. Both bugs are silent-until-release,
 * which is the worst moment to find them, so they are pinned here instead.
 *
 * The private app trees (android-pay, android-comm, android-business,
 * android-agent) are gitignored from the public repo. Each is skipped when
 * absent rather than failing — on public CI that leaves Companion, which is the
 * app the regression actually hit.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const ROOT = resolve(__dirname, '../..');

/** `base` is the directory that app's `storeFile` value resolves against. */
const APPS = [
  { name: 'companion', dir: 'android', resolver: 'file' },
  { name: 'pay', dir: 'android-pay', resolver: 'rootProject.file' },
  { name: 'comm', dir: 'android-comm', resolver: 'rootProject.file' },
  { name: 'business', dir: 'android-business', resolver: 'rootProject.file' },
  { name: 'agent', dir: 'android-agent', resolver: 'file' },
] as const;

const present = APPS.filter((a) => existsSync(join(ROOT, a.dir, 'app/build.gradle')));

/** Strip line + block comments so a commented-out example never satisfies a check. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

it('finds at least the public Companion project', () => {
  // If this fails the whole suite below silently checked nothing.
  expect(present.map((a) => a.name)).toContain('companion');
});

describe.each(present)('$name — android app project', (app) => {
  const gradlePath = join(ROOT, app.dir, 'app/build.gradle');
  const src = code(readFileSync(gradlePath, 'utf8'));

  it('defines every signing property its release guard reads', () => {
    // The exact crash: referenced in the guard, defined nowhere.
    for (const prop of ['hasKeystore', 'keystorePropertiesFile']) {
      if (new RegExp(`\\b${prop}\\b`).test(src)) {
        expect(
          new RegExp(`^\\s*def\\s+${prop}\\s*=`, 'm').test(src),
          `${app.dir}/app/build.gradle reads '${prop}' but never defines it — ` +
            `gradle fails with "Could not get unknown property '${prop}'" on every ` +
            `assembleRelease/bundleRelease`,
        ).toBe(true);
      }
    }
  });

  it('defines them at project scope, not inside a nested block', () => {
    // Defining them inside `signingConfigs { release { ... } }` type-checks as
    // Groovy and reads fine, but the guard at the bottom of the file is outside
    // that scope — which is exactly how this broke.
    const androidBlock = src.indexOf('\nandroid {');
    const def = src.search(/^\s*def\s+hasKeystore\s*=/m);
    if (def !== -1 && androidBlock !== -1) {
      expect(
        def,
        `'def hasKeystore' must appear before the android { } block in ${app.dir}`,
      ).toBeLessThan(androidBlock);
    }
  });

  it('still refuses to emit an unsigned release artifact', () => {
    // The guard is the reason the file was touched at all. Losing it is worse
    // than the bug it caused: an unsigned AAB lands at the usual output path
    // and looks completely normal.
    expect(src).toMatch(/gradle\.taskGraph\.whenReady/);
    expect(src).toMatch(/if\s*\(\s*!hasKeystore\s*\)/);
    expect(src).toMatch(/GradleException/);
  });

  it('applies the signing config only when a keystore is present', () => {
    // Unconditional `signingConfig signingConfigs.release` throws a different,
    // more confusing error when signingConfigs.release was never created.
    const buildTypes = src.slice(src.indexOf('buildTypes'));
    const apply = buildTypes.indexOf('signingConfig signingConfigs.release');
    expect(apply, `${app.dir}: no signingConfig applied in buildTypes`).toBeGreaterThan(-1);
    expect(
      /if\s*\(\s*hasKeystore\s*\)\s*\{\s*(?:\/\/[^\n]*\n\s*)*signingConfig signingConfigs\.release/.test(
        buildTypes,
      ),
      `${app.dir}: signingConfig must be guarded by if (hasKeystore)`,
    ).toBe(true);
  });

  it('resolves storeFile against the directory this app keeps its keystore in', () => {
    const m = src.match(/^\s*storeFile\s+(rootProject\.file|file)\(/m);
    expect(m, `${app.dir}: no storeFile line found`).not.toBeNull();
    expect(
      m![1],
      `${app.dir} keeps its keystore ${
        app.resolver === 'file' ? 'inside the android tree' : 'at the repo root'
      }, so storeFile must resolve with ${app.resolver}(...). Using the other one ` +
        `points at a directory that does not hold the key and fails validateSigningRelease.`,
    ).toBe(app.resolver);
  });

  it('resolves to a keystore that exists, when this machine has one', () => {
    // Skipped on CI and on any machine without the signing material. Where the
    // material IS present this is the check that catches an off-by-one-directory
    // storeFile — the second bug of the pair.
    //
    // The base directory is derived from the resolver WRITTEN IN THE GRADLE FILE,
    // never from the expectation table above. An earlier version used the table,
    // which made this test compare the table against itself: reverting the fix
    // left it passing. A negative control caught that.
    const propsPath = join(ROOT, app.dir, 'keystore.properties');
    if (!existsSync(propsPath)) return;

    const storeFile = readFileSync(propsPath, 'utf8').match(/^storeFile=(.+)$/m)?.[1].trim();
    expect(storeFile, `${app.dir}/keystore.properties has no storeFile`).toBeTruthy();

    const actual = src.match(/^\s*storeFile\s+(rootProject\.file|file)\(/m)?.[1];
    const base = actual === 'file' ? join(ROOT, app.dir, 'app') : join(ROOT, app.dir);
    const resolved = resolve(base, storeFile!);
    expect(
      existsSync(resolved),
      `${app.dir}: storeFile '${storeFile}' resolves to ${resolved}, which does not exist`,
    ).toBe(true);
  });
});
