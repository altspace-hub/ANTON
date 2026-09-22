/**
 * framework-id-traversal.test.ts — a framework id cannot leave data/frameworks,
 * and a module id cannot leave the areas tree.
 *
 * Found 2026-09-22 while triaging CodeQL on PR #71 (pre-existing on main):
 * GET /api/gap-assessments/frameworks/..%2F..%2Fpackage answered the repo's own
 * package.json — getFramework() joined the raw route parameter onto the
 * frameworks directory, so any .json file reachable by relative path could be
 * read. POST /exchange/export/:moduleId had the same shape through
 * bundleBuiltinModuleToAnton().
 */
import { describe, it, expect } from 'vitest';
import { getFramework } from '../../server/services/gap-assessment-engine.js';
import { bundleBuiltinModuleToAnton } from '../../server/services/anton-bundler.js';
import { isSafePathSegment } from '../../server/lib/safe-id.js';

describe('getFramework', () => {
  it('loads a real framework', () => {
    expect(getFramework('amlr-2024')?.id ?? getFramework('amlr-2024')?.name).toBeTruthy();
  });

  it.each(['../../package', '..\\..\\package', '../frameworks/amlr-2024', '/etc/passwd', 'amlr-2024/../../../package', ''])(
    'refuses %j', (id) => {
      expect(getFramework(id)).toBeNull();
    },
  );
});

describe('bundleBuiltinModuleToAnton', () => {
  // '../modules/green-claims-review' resolves to a real module folder through a
  // dot-segment — before the fix it bundled; any separator must be refused.
  it.each(['../modules/green-claims-review', '../../../server', '..\\..\\x', 'a/b'])('refuses module id %j', async (id) => {
    await expect(bundleBuiltinModuleToAnton(id)).rejects.toThrow(/Module not found|Invalid module id/);
  });
});

describe('isSafePathSegment', () => {
  it('accepts the ids the catalogue uses', () => {
    for (const id of ['amlr-2024', 'green-claims-review', 'iso27001_2022', 'eu.ai-act']) expect(isSafePathSegment(id)).toBe(true);
  });
  it('rejects separators, dot-segments and empty', () => {
    for (const id of ['..', '.', 'a/b', 'a\\b', '../x', '', ' ', 'a\0b']) expect(isSafePathSegment(id)).toBe(false);
  });
});
