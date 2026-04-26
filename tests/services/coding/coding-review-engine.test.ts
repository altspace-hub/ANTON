/**
 * coding-review-engine.test.ts — pure-function tests for the
 * lens-mapping, file-hash, and change-detection helpers.
 */

import { describe, it, expect } from 'vitest';
import { createCodingReviewEngine } from '../../../server/services/coding-review-engine.js';
import type { DatabaseAdapter } from '../../../server/db/database.js';

const stubDb = {
  all: async () => [],
  get: async () => undefined,
  run: async () => {},
  exec: async () => {},
} as unknown as DatabaseAdapter;

describe('mapLensToPersona', () => {
  it('maps developer lens to senior-engineer + software-eng area', async () => {
    const eng = await createCodingReviewEngine(stubDb);
    const r = eng.mapLensToPersona('developer');
    expect(r.personaId).toBe('senior-engineer');
    expect(r.areaContext).toBe('software-eng');
  });

  it('maps security to cyber-expert + cyber area', async () => {
    const eng = await createCodingReviewEngine(stubDb);
    const r = eng.mapLensToPersona('security');
    expect(r.personaId).toBe('cyber-expert');
    expect(r.areaContext).toBe('cyber');
  });

  it('maps compliance to fcp-expert', async () => {
    const eng = await createCodingReviewEngine(stubDb);
    expect(eng.mapLensToPersona('compliance').personaId).toBe('fcp-expert');
  });

  it('maps architecture to solutions-architect', async () => {
    const eng = await createCodingReviewEngine(stubDb);
    expect(eng.mapLensToPersona('architecture').personaId).toBe('solutions-architect');
  });

  it('maps product to product-manager (no area context)', async () => {
    const eng = await createCodingReviewEngine(stubDb);
    const r = eng.mapLensToPersona('product');
    expect(r.personaId).toBe('product-manager');
    expect(r.areaContext).toBeUndefined();
  });

  it('falls back to senior-engineer for unknown lens', async () => {
    const eng = await createCodingReviewEngine(stubDb);
    expect(eng.mapLensToPersona('unknown-lens-name').personaId).toBe('senior-engineer');
  });
});

describe('computeFileHashes', () => {
  it('produces sha256 hex hashes per file', async () => {
    const eng = await createCodingReviewEngine(stubDb);
    const hashes = eng.computeFileHashes([
      { path: 'a.ts', content: 'const a = 1;' },
      { path: 'b.ts', content: 'const b = 2;' },
    ]);
    expect(Object.keys(hashes)).toEqual(['a.ts', 'b.ts']);
    expect(hashes['a.ts']).toMatch(/^[0-9a-f]{64}$/);
    expect(hashes['b.ts']).toMatch(/^[0-9a-f]{64}$/);
    expect(hashes['a.ts']).not.toBe(hashes['b.ts']);
  });

  it('returns identical hash for identical content', async () => {
    const eng = await createCodingReviewEngine(stubDb);
    const h1 = eng.computeFileHashes([{ path: 'x.ts', content: 'same' }]);
    const h2 = eng.computeFileHashes([{ path: 'y.ts', content: 'same' }]);
    expect(h1['x.ts']).toBe(h2['y.ts']);
  });

  it('returns empty record for empty input', async () => {
    const eng = await createCodingReviewEngine(stubDb);
    expect(eng.computeFileHashes([])).toEqual({});
  });
});

describe('detectChanges', () => {
  it('classifies added / modified / deleted / unchanged correctly', async () => {
    const eng = await createCodingReviewEngine(stubDb);
    const oldHashes = { 'a.ts': 'h_a', 'b.ts': 'h_b', 'c.ts': 'h_c' };
    const newHashes = { 'a.ts': 'h_a', 'b.ts': 'h_b_new', 'd.ts': 'h_d' };
    const r = eng.detectChanges(oldHashes, newHashes);

    expect(r.unchanged).toEqual(['a.ts']);
    expect(r.modified).toEqual(['b.ts']);
    expect(r.deleted).toEqual(['c.ts']);
    expect(r.added).toEqual(['d.ts']);
  });

  it('all-empty inputs → all-empty outputs', async () => {
    const eng = await createCodingReviewEngine(stubDb);
    const r = eng.detectChanges({}, {});
    expect(r).toEqual({ added: [], modified: [], deleted: [], unchanged: [] });
  });

  it('all files added (empty old)', async () => {
    const eng = await createCodingReviewEngine(stubDb);
    const r = eng.detectChanges({}, { 'a.ts': 'h', 'b.ts': 'h' });
    expect(r.added.sort()).toEqual(['a.ts', 'b.ts']);
    expect(r.modified).toEqual([]);
    expect(r.deleted).toEqual([]);
  });

  it('all files deleted (empty new)', async () => {
    const eng = await createCodingReviewEngine(stubDb);
    const r = eng.detectChanges({ 'a.ts': 'h', 'b.ts': 'h' }, {});
    expect(r.deleted.sort()).toEqual(['a.ts', 'b.ts']);
    expect(r.added).toEqual([]);
    expect(r.modified).toEqual([]);
  });

  it('rename detected as add+delete (hash-based detection)', async () => {
    const eng = await createCodingReviewEngine(stubDb);
    // Same content moved from a.ts → renamed.ts
    const r = eng.detectChanges({ 'a.ts': 'h_a' }, { 'renamed.ts': 'h_a' });
    expect(r.added).toEqual(['renamed.ts']);
    expect(r.deleted).toEqual(['a.ts']);
    expect(r.modified).toEqual([]);
    // (Rename detection would need separate logic; this confirms current behaviour.)
  });
});
