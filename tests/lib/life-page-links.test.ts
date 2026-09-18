import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { MODULES } from '../../src/lib/constants';

/**
 * 2026-09-18 (Wave 6, track B): the Life pillar landing page gained a
 * "Personal Modules" card — the first route from Life into the module
 * catalogue. Its links are plain string literals, so a module rename
 * elsewhere would turn them into 404s with nothing to catch it.
 *
 * Read as text rather than imported, the same way module-area-integrity reads
 * ModulePage.tsx: the page's data array holds JSX, and the point here is to
 * cover *every* hard-coded /module/ link on the page, including any added
 * later outside that array.
 */
describe('Life landing page — module links', () => {
  const repoRoot = path.resolve(__dirname, '..', '..');
  const page = fs.readFileSync(path.join(repoRoot, 'src', 'pages', 'LifePage.tsx'), 'utf-8');
  const linked = [...page.matchAll(/['"`]\/module\/([a-z0-9-]+)['"`]/g)].map((m) => m[1]);
  const known = new Set<string>(MODULES.map((m) => m.id as string));

  it('links at least one module — the card did not silently lose its links', () => {
    expect(linked.length).toBeGreaterThan(0);
  });

  it('every /module/<id> link on the page resolves to a real module', () => {
    expect(linked.filter((id) => !known.has(id))).toEqual([]);
  });

  it('covers the personal-life ground CLAUDE.md claimed the pillar carried', () => {
    // The doc row said "microfinance, BoP finance, consumer protection". The
    // doc was corrected to describe the pillar accurately, and the card makes
    // the personal-money / consumer-rights / career areas reachable from Life
    // rather than only from the Work sidebar.
    const areasOf = (id: string): string | undefined =>
      (MODULES.find((m) => m.id === id) as { areaId?: string } | undefined)?.areaId;
    expect(linked).toContain('budget-planning');    // personal-finance
    expect(linked).toContain('debt-management');    // personal-finance
    expect(linked).toContain('product-complaint');  // consumer-rights
    expect(linked).toContain('cv-writer');          // personal-dev
    // areaId is optional on the catalogue type; if it is present it must agree.
    for (const [id, area] of [['budget-planning', 'personal-finance'], ['product-complaint', 'consumer-rights']]) {
      const actual = areasOf(id);
      if (actual !== undefined) expect(actual, id).toBe(area);
    }
  });
});
