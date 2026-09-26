/**
 * folder-guard-allowed-root.test.ts — allowedRootOf(), the containment a call
 * site repeats beside its file read or write (CodeQL js/path-injection only
 * sees a guard in the same function as the sink).
 */
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { allowedRootOf } from '../../server/lib/folder-guard.js';

const base = path.resolve('/srv/anton-shared');
const other = path.resolve('/srv/other');

describe('allowedRootOf', () => {
  it('names the base a path lies in, or the base itself', () => {
    expect(allowedRootOf(path.join(base, 'policies', 'a.csv'), [other, base])).toBe(base);
    expect(allowedRootOf(base, [base])).toBe(base);
  });

  it('refuses a sibling that merely shares the prefix, and a path outside', () => {
    expect(allowedRootOf(`${base}-evil${path.sep}x.csv`, [base])).toBeNull();
    expect(allowedRootOf(path.resolve('/etc/passwd'), [base])).toBeNull();
    expect(allowedRootOf(path.join(base, 'x'), [])).toBeNull();
  });
});
