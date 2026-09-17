/**
 * rerun-chip-actions.test.ts — the "Rerun with…" chip exposes both actions
 * (Wave 5 track B).
 *
 * Recompose ("Run comparison": another model through the live pipeline) was
 * the only action; verbatim replay ("Same model, verbatim": the stored prompt
 * and history against the model that served the original) is the second.
 * This static guard pins that the toolbar posts each mode through the shared
 * api helper, that both buttons carry aria labels, and that the comparison
 * view renders the three equality rows a replay reports.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('OutputToolbar "Rerun with…" chip', () => {
  const src = read('src/components/shared/OutputToolbar.tsx');

  it('keeps the recompose action and adds the verbatim replay action', () => {
    expect(src).toMatch(/Run comparison/);
    expect(src).toMatch(/Same model, verbatim/);
    expect(src).toMatch(/handleRerun\('recompose'\)/);
    expect(src).toMatch(/handleRerun\('replay'\)/);
  });

  it('posts each mode through the shared api helper, never a raw fetch to /api/rerun', () => {
    expect(src).toMatch(/rerunMessage\(\{ sessionId, mode: 'replay' \}\)/);
    expect(src).toMatch(/rerunMessage\(\{ sessionId, mode: 'recompose', newModelId: rerunModel, areaId \}\)/);
    expect(src).not.toMatch(/fetchWithAuth\('\/api\/rerun'/);
  });

  it('labels both actions for assistive technology', () => {
    expect(src).toMatch(/aria-label="Rerun with another model and compare"/);
    expect(src).toMatch(/aria-label="Replay verbatim with the same model and the stored prompt"/);
  });

  it('does not gate replay on picking a different model', () => {
    const replayButton = src.slice(src.indexOf("handleRerun('replay')"), src.indexOf('Same model, verbatim'));
    expect(replayButton).toMatch(/disabled=\{rerunLoading \|\| !sessionId\}/);
    expect(replayButton).not.toMatch(/rerunModel === lastRunModel/);
  });
});

describe('RerunComparison equality view', () => {
  const src = read('src/components/shared/RerunComparison.tsx');

  it('branches on the response mode', () => {
    expect(src).toMatch(/data\.mode === 'replay'/);
  });

  it('shows model, prompt and output equality with a one-line explanation', () => {
    expect(src).toMatch(/label="Model"/);
    expect(src).toMatch(/label="Prompt"/);
    expect(src).toMatch(/label="Output"/);
    expect(src).toMatch(/sampling can differ even with identical inputs/);
  });

  it('keeps the drift banner for recompose only', () => {
    expect(src).toMatch(/\{!isReplay && data\.sourceDriftAvailable && changedSources\.length > 0 &&/);
  });
});

describe('api helper', () => {
  it('exports rerunMessage typed on RerunResponse', () => {
    const api = read('src/lib/api.ts');
    expect(api).toMatch(/export async function rerunMessage\(body: RerunRequest\): Promise<import\('\.\/types'\)\.RerunResponse>/);
    const types = read('src/lib/types.ts');
    expect(types).toMatch(/export interface RerunResponse \{/);
    expect(types).toMatch(/mode: RerunMode;/);
  });
});
