/**
 * runtime-deps-classification.test.ts — a devDependency the SERVER imports is
 * invisible to the security gate, and missing from a production install.
 *
 * Found 2026-09-06. `xlsx` was declared in `devDependencies` while
 * `server/services/text-extractor.ts`, `server/services/data-importer.ts` and
 * `server/routes/files.ts` imported it to parse uploaded spreadsheets. Two
 * consequences, both silent:
 *
 *   1. Both CI audit gates run `pnpm audit --prod` (.github/workflows/ci.yml and
 *      security.yml). `--prod` walks the `dependencies` tree ONLY, so it could not
 *      see xlsx@0.18.5's two HIGH advisories — CVE-2023-30533 (prototype pollution)
 *      and CVE-2024-22363 (ReDoS), both in the parser we feed user uploads to.
 *      The gate was green *because* the package was misfiled. That is the worst
 *      kind of green: it looks like assurance and certifies nothing.
 *   2. `pnpm install --prod` would not install it at all, so `start` (which runs
 *      the TypeScript sources through tsx) would throw ERR_MODULE_NOT_FOUND on the
 *      first spreadsheet upload. `tiktoken` had the same misfiling, and its
 *      importers (server/services/token-estimator.ts, chunker.ts) are pulled in
 *      statically by server/routes/audit.ts and pathfinder.ts — so that one would
 *      have failed at boot, not on first use.
 *
 * Guard 1 is the general invariant: nothing under server/ may import a package
 * that package.json files as dev-only.
 *
 * Guard 2 pins the xlsx remediation specifically. SheetJS left the npm registry at
 * 0.18.5, so `pnpm audit` reports "no patch available" and both CVEs are fixed only
 * in builds published at cdn.sheetjs.com (0.19.3 and 0.20.2 respectively). We pin
 * the CDN tarball. A later reader "tidying" that odd-looking URL back to a registry
 * range would silently reintroduce both CVEs while the audit gate stays green
 * (it reports them as unfixable, and an ignore entry would then hide them for good).
 * This assertion is what stops that, so do not relax it to a range check.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();

interface Pkg {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}
const pkg: Pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const prodDeps = new Set(Object.keys(pkg.dependencies ?? {}));
const devDeps = new Set(Object.keys(pkg.devDependencies ?? {}));

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return walk(p);
    return /\.tsx?$/.test(name) && !name.endsWith('.d.ts') ? [p] : [];
  });
}

/** `import x from 'pkg'`, `export … from 'pkg'`, and `await import('pkg')`. */
const SPECIFIER = /(?:from\s*|import\s*\(\s*)['"]([^'"]+)['"]/g;

/** 'xlsx/utils' -> 'xlsx'; '@scope/pkg/sub' -> '@scope/pkg'. */
function packageName(specifier: string): string {
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

describe('runtime dependency classification', () => {
  it('no package imported by server/ is filed as a devDependency', () => {
    const offenders: string[] = [];

    for (const file of walk(join(ROOT, 'server'))) {
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(SPECIFIER)) {
        const spec = m[1];
        // Relative paths and node: builtins are not packages.
        if (spec.startsWith('.') || spec.startsWith('node:')) continue;
        const name = packageName(spec);
        // Only packages this manifest actually declares. An undeclared specifier
        // is a different bug (a bare Node builtin, or a workspace alias) and is
        // deliberately out of scope here.
        if (!devDeps.has(name) || prodDeps.has(name)) continue;
        offenders.push(`${name} <- ${file.slice(ROOT.length + 1).replace(/\\/g, '/')}`);
      }
    }

    expect(
      [...new Set(offenders)].sort(),
      'These packages are imported by server runtime code but declared in ' +
        'devDependencies. They are therefore invisible to `pnpm audit --prod` ' +
        '(the CI security gate) and absent from a `pnpm install --prod` deploy. ' +
        'Move them to "dependencies".',
    ).toEqual([]);
  });

  it('xlsx is pinned to a build that carries the CVE-2023-30533 + CVE-2024-22363 fixes', () => {
    const spec = pkg.dependencies?.xlsx;
    expect(spec, 'xlsx must be a runtime dependency — the server parses uploads with it').toBeDefined();

    // The patched builds exist only off-registry. Any registry range (^0.18.5 and
    // friends) resolves to 0.18.5, which is vulnerable to both.
    const m = /^https:\/\/cdn\.sheetjs\.com\/xlsx-(\d+)\.(\d+)\.(\d+)\/xlsx-\1\.\2\.\3\.tgz$/.exec(
      spec ?? '',
    );
    expect(
      m,
      `xlsx is pinned to "${spec}". The npm registry's last SheetJS release is 0.18.5, ` +
        'which is vulnerable to CVE-2023-30533 (prototype pollution, fixed 0.19.3) and ' +
        'CVE-2024-22363 (ReDoS, fixed 0.20.2). Both are reachable: server/routes/files.ts ' +
        'accepts .xlsx uploads and hands them to text-extractor.ts, which calls XLSX.read() ' +
        'on the bytes. Pin the cdn.sheetjs.com tarball for >= 0.20.2 instead.',
    ).not.toBeNull();

    const [major, minor, patch] = m!.slice(1, 4).map(Number);
    // >= 0.20.2 clears the later of the two fixes (ReDoS), which subsumes 0.19.3.
    const ordinal = major * 1_000_000 + minor * 1_000 + patch;
    expect(ordinal, `xlsx ${major}.${minor}.${patch} predates the 0.20.2 ReDoS fix`).toBeGreaterThanOrEqual(
      0 * 1_000_000 + 20 * 1_000 + 2,
    );
  });
});
