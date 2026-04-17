// Verify the SME General pack loads end-to-end through the loader.
// This is the spec's "build the loader by exercising it with the
// foundational pack" check — if this passes, the loader contract is good
// and Phase 1c modules + Phase 1g packs can use it.

import { describe, it, expect } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACK_DIR = path.resolve(__dirname, '..', '..', '..', 'data', 'risk-atlas', 'packs', 'sme-general');

describe('SME General pack — content readability', () => {
  it('readPackDir returns a complete IndustryPackContent', async () => {
    const { createAtlasPackLoader } = await import('../../../server/services/risk-atlas/atlas-pack-loader.js');
    // Loader needs a db adapter for upserts; for read-only tests we pass a
    // stub that throws on any call (proving readPackDir doesn't hit it).
    const stubDb = {
      run: () => { throw new Error('readPackDir should not call db.run'); },
      get: () => { throw new Error('readPackDir should not call db.get'); },
      all: () => { throw new Error('readPackDir should not call db.all'); },
    } as never;
    const loader = createAtlasPackLoader(stubDb);
    const content = await loader._readPackDir(PACK_DIR);

    // Manifest
    expect(content.manifest.id).toBe('sme-general');
    expect(content.manifest.name).toBe('SME General');
    expect(content.manifest.amlr_obliged).toBe(false);

    // Libraries non-empty
    expect(content.exposurePoints.length).toBeGreaterThanOrEqual(10);
    expect(content.threatPaths.length).toBeGreaterThanOrEqual(10);
    expect(content.vulnerabilities.length).toBeGreaterThanOrEqual(15);
    expect(content.controls.length).toBeGreaterThanOrEqual(10);

    // Glossary covers core terms
    expect(content.glossary).toBeDefined();
    expect(content.glossary?.['Threat path']).toBeDefined();
    expect(content.glossary?.['Residual risk']).toBeDefined();

    // Socratic scripts — all 7 stages
    for (let stage = 1; stage <= 7; stage++) {
      expect(content.socraticScripts?.[`stage-${stage}`], `stage-${stage}.md missing`).toBeTruthy();
      expect(content.socraticScripts?.[`stage-${stage}`].length).toBeGreaterThan(200);
    }

    // Appetite heuristics + escalation triggers
    expect(Object.keys(content.appetiteHeuristics ?? {}).length).toBeGreaterThan(0);
    expect((content.escalationTriggers ?? []).length).toBeGreaterThan(0);
  });

  it('threat paths reference exposures + vulnerabilities that exist', async () => {
    const { createAtlasPackLoader } = await import('../../../server/services/risk-atlas/atlas-pack-loader.js');
    const stubDb = { run: () => {}, get: () => {}, all: () => {} } as never;
    const loader = createAtlasPackLoader(stubDb);
    const content = await loader._readPackDir(PACK_DIR);

    const exposureIds = new Set(content.exposurePoints.map(e => e.id));
    const vulnIds = new Set(content.vulnerabilities.map(v => v.id));

    for (const path of content.threatPaths) {
      for (const ref of path.exposure_refs ?? []) {
        expect(exposureIds.has(ref), `${path.code}: unknown exposure ref ${ref}`).toBe(true);
      }
      for (const ref of path.vulnerability_refs ?? []) {
        expect(vulnIds.has(ref), `${path.code}: unknown vulnerability ref ${ref}`).toBe(true);
      }
    }
  });

  it('controls reference vulnerabilities that exist', async () => {
    const { createAtlasPackLoader } = await import('../../../server/services/risk-atlas/atlas-pack-loader.js');
    const stubDb = { run: () => {}, get: () => {}, all: () => {} } as never;
    const loader = createAtlasPackLoader(stubDb);
    const content = await loader._readPackDir(PACK_DIR);

    const vulnIds = new Set(content.vulnerabilities.map(v => v.id));
    for (const ctrl of content.controls) {
      for (const ref of ctrl.vulnerability_refs ?? []) {
        expect(vulnIds.has(ref), `${ctrl.code}: unknown vulnerability ref ${ref}`).toBe(true);
      }
    }
  });

  it('appetite heuristics reference threat paths that exist', async () => {
    const { createAtlasPackLoader } = await import('../../../server/services/risk-atlas/atlas-pack-loader.js');
    const stubDb = { run: () => {}, get: () => {}, all: () => {} } as never;
    const loader = createAtlasPackLoader(stubDb);
    const content = await loader._readPackDir(PACK_DIR);

    const pathIds = new Set(content.threatPaths.map(p => p.id));
    for (const ref of Object.keys(content.appetiteHeuristics ?? {})) {
      expect(pathIds.has(ref), `appetite-heuristics references unknown path ${ref}`).toBe(true);
    }
  });

  it('mergePackContent: child overrides parent by id; lists deduplicate', async () => {
    const { mergePackContent } = await import('../../../server/services/risk-atlas/atlas-pack-loader.js');
    const parent = {
      manifest: { id: 'p', name: 'Parent', version: '1.0' } as never,
      exposurePoints: [
        { id: 'a', name: 'parent-a', description: '', category: 'system' },
        { id: 'b', name: 'parent-b', description: '', category: 'system' },
      ],
      threatPaths: [],
      vulnerabilities: [],
      controls: [],
      glossary: { x: 'parent x' },
    };
    const child = {
      manifest: { id: 'c', name: 'Child', version: '1.0' } as never,
      exposurePoints: [
        { id: 'a', name: 'child-a (overridden)', description: '', category: 'system' },
        { id: 'c', name: 'child-c', description: '', category: 'system' },
      ],
      threatPaths: [],
      vulnerabilities: [],
      controls: [],
      glossary: { y: 'child y' },
    };
    const merged = mergePackContent(parent, child);
    expect(merged.manifest.id).toBe('c');                                 // child manifest wins
    expect(merged.exposurePoints.length).toBe(3);                         // a, b, c
    expect(merged.exposurePoints.find(e => e.id === 'a')!.name).toBe('child-a (overridden)');
    expect(merged.glossary?.x).toBe('parent x');                          // shallow merge
    expect(merged.glossary?.y).toBe('child y');
  });
});
