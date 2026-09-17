/**
 * renderer-registry-run.test.ts — the registry fails loudly and offers
 * content-aware transforms before extraction (Wave 3, 2026-09-16).
 *
 *   1. A renderer that throws leaves a `failed` row in renderer_audit_log
 *      carrying the message and stage, and surfaces as a RendererRunError.
 *      renderer_audit_log on the dev database had two rows, both 'invoked'.
 *   2. Experimental renderers are hidden from listings by default and shown
 *      only on request — they stay in the registry.
 *   3. Without a payload, a content-aware renderer is offered flagged
 *      `needs_extraction` using the MODULE's content type; with a payload
 *      the required-fields filter is exact.
 *
 * The database and the render function are fakes at the registry's seams.
 */

import { describe, it, expect, vi } from 'vitest';
import type { DatabaseAdapter } from '../../server/db/database.js';
import { createRendererRegistry, RendererRunError, rendererNeedsStructured } from '../../server/services/renderer-registry.js';
import type { RenderFn } from '../../server/services/renderer-registry.types.js';

interface RendererRow {
  id: string; label: string; description: string | null; category: string; trigger: string;
  applies_when: unknown; output: unknown; renderer_module: string; preview_module: string | null;
  phase: number; status: string; sort_order: number;
}

const heatmapRow: RendererRow = {
  id: 'svg-risk-heatmap', label: 'Risk heatmap', description: 'A 5x5 heatmap', category: 'visualize', trigger: 'post_hoc',
  applies_when: { content_types: ['risk_register'], requires_fields: ['items[*].likelihood', 'items[*].impact'] },
  output: { file_type: 'svg', mime_type: 'image/svg+xml', filename_template: 'x' },
  renderer_module: './renderers/visualize/svg-risk-heatmap.js', preview_module: null, phase: 1, status: 'beta', sort_order: 10,
};
const flowchartRow: RendererRow = {
  ...heatmapRow, id: 'mermaid-flowchart', label: 'Flowchart',
  applies_when: { content_types: ['process_map'], requires_fields: ['steps'] },
  renderer_module: './renderers/visualize/mermaid-flowchart.js',
};
const plainRow: RendererRow = {
  ...heatmapRow, id: 'plain-language', label: 'Plain language', category: 'adapt_audience', applies_when: {},
  output: { file_type: 'md', mime_type: 'text/markdown', filename_template: 'x' },
  renderer_module: './renderers/adapt/plain-language.js',
};

const session = (over: Record<string, unknown> = {}) => ({
  id: 'sess-1', module_id: 'atlas-threat-cataloguer', title: 'Threat paths', user_id: 'alice',
  content_type: null, sector: null, output_structured: null, structured_status: 'pending', ...over,
});

function fakeDb(opts: { session?: Record<string, unknown>; renderer?: RendererRow; renderers?: RendererRow[]; markdown?: string }) {
  const audits: Array<{ event: string; details: Record<string, unknown>; artifactId: unknown }> = [];
  const alls: Array<{ sql: string; params: unknown[] }> = [];
  const db = {
    dialect: 'postgresql',
    get: vi.fn(async (sql: string) => {
      if (/FROM sessions/.test(sql)) return opts.session;
      if (/FROM renderers/.test(sql)) return opts.renderer;
      if (/FROM messages/.test(sql)) return opts.markdown !== undefined ? { content: opts.markdown } : undefined;
      if (/INSERT INTO rendered_artifacts/.test(sql)) return { id: 7 };
      if (/MAX\(version_number\)/.test(sql)) return { maxv: 0 };
      return undefined;
    }),
    all: vi.fn(async (sql: string, ...params: unknown[]) => {
      alls.push({ sql, params });
      if (/FROM renderers/.test(sql)) return opts.renderers ?? [];
      return [];
    }),
    run: vi.fn(async (sql: string, ...params: unknown[]) => {
      if (/INSERT INTO renderer_audit_log/.test(sql)) {
        audits.push({ event: params[4] as string, details: JSON.parse(params[5] as string) as Record<string, unknown>, artifactId: params[2] });
      }
      return { changes: 1, lastInsertRowid: 0 };
    }),
    exec: vi.fn(async () => undefined),
    transaction: vi.fn(async (fn: (d: unknown) => unknown) => fn(db)),
    close: vi.fn(async () => undefined),
  } as unknown as DatabaseAdapter;
  return { db, audits, alls };
}

const payloadWith = (items: Array<Record<string, unknown>>) => JSON.stringify({
  schema_version: '1.0', module_id: 'atlas-threat-cataloguer', area_id: 'risk', content_type: 'risk_register',
  sector: null, generated_at: '2026-09-16T00:00:00Z', model: 'sdk:claude-opus-5', body: { title: 'x', items },
});

// ── 1. Failures are logged ─────────────────────────────────

describe('runRenderer — failures reach the audit log', () => {
  it('a throwing render function → failed event with stage + message, RendererRunError(render)', async () => {
    const { db, audits } = fakeDb({ session: session(), renderer: plainRow, markdown: '# Output\n\nSome prose.' });
    const boom: RenderFn = async () => { throw new Error('pandoc exited with code 2'); };
    const registry = createRendererRegistry(db, { resolveRenderFn: async () => boom });

    const err = await registry.runRenderer('sess-1', 'plain-language', { tone: 'warm' }, 'alice').catch((e: unknown) => e);

    expect(err).toBeInstanceOf(RendererRunError);
    const runError = err as RendererRunError;
    expect(runError.stage).toBe('render');
    expect(runError.rendererId).toBe('plain-language');
    expect(runError.sessionId).toBe('sess-1');
    expect(runError.message).toBe('Plain language failed: pandoc exited with code 2');

    expect(audits.map((a) => a.event)).toEqual(['invoked', 'failed']);
    expect(audits[0].details).toEqual({ options: { tone: 'warm' } });
    expect(audits[1].details).toMatchObject({ stage: 'render', message: 'Plain language failed: pandoc exited with code 2' });
    expect(typeof audits[1].details.duration_ms).toBe('number');
  });

  it('a persistence failure after a successful render is a failed event at stage persist', async () => {
    const { db, audits } = fakeDb({ session: session(), renderer: plainRow, markdown: '# Output' });
    (db.transaction as unknown as { mockImplementation: (fn: () => Promise<never>) => void })
      .mockImplementation(async () => { throw new Error('deadlock detected'); });
    const ok: RenderFn = async () => ({ file_path: 'out.md', file_type: 'md', mime_type: 'text/markdown', file_size_bytes: 12, metadata: {} });
    const registry = createRendererRegistry(db, { resolveRenderFn: async () => ok });

    const err = await registry.runRenderer('sess-1', 'plain-language', {}, 'alice').catch((e: unknown) => e) as RendererRunError;
    expect(err.stage).toBe('persist');
    expect(err.message).toMatch(/could not be recorded: deadlock detected/);
    expect(audits.map((a) => a.event)).toEqual(['invoked', 'failed']);
    expect(audits[1].details).toMatchObject({ stage: 'persist' });
  });

  it('a content-aware renderer with no payload stops at the precondition — extraction_missing, not failed', async () => {
    const { db, audits } = fakeDb({ session: session(), renderer: heatmapRow, markdown: '# Output' });
    const never: RenderFn = async () => { throw new Error('must not run'); };
    const registry = createRendererRegistry(db, { resolveRenderFn: async () => never });

    const err = await registry.runRenderer('sess-1', 'svg-risk-heatmap', {}, 'alice').catch((e: unknown) => e) as RendererRunError;
    expect(err).toBeInstanceOf(RendererRunError);
    expect(err.stage).toBe('precondition');
    expect(audits.map((a) => a.event)).toEqual(['invoked', 'extraction_missing']);
  });

  it('a successful run logs succeeded with the artifact id', async () => {
    const { db, audits } = fakeDb({ session: session(), renderer: plainRow, markdown: '# Output' });
    const ok: RenderFn = async () => ({ file_path: 'out.md', file_type: 'md', mime_type: 'text/markdown', file_size_bytes: 12, metadata: {} });
    const registry = createRendererRegistry(db, { resolveRenderFn: async () => ok });

    const result = await registry.runRenderer('sess-1', 'plain-language', {}, 'alice');
    expect(result.artifact_id).toBe(7);
    expect(audits.map((a) => a.event)).toEqual(['invoked', 'succeeded']);
    expect(audits[1].artifactId).toBe(7);
  });

  it('an unknown renderer or session is a lookup error before anything is logged', async () => {
    const { db, audits } = fakeDb({ session: session(), renderer: undefined });
    const registry = createRendererRegistry(db);
    const err = await registry.runRenderer('sess-1', 'nope', {}, 'alice').catch((e: unknown) => e) as RendererRunError;
    expect(err.stage).toBe('lookup');
    expect(audits).toEqual([]);
  });
});

// ── 2. Visibility ──────────────────────────────────────────

describe('listRenderers — experimental hidden unless asked', () => {
  it('excludes disabled + experimental by default', async () => {
    const { db, alls } = fakeDb({ renderers: [] });
    await createRendererRegistry(db).listRenderers();
    expect(alls[0].sql).toMatch(/WHERE status NOT IN \(\?, \?\)/);
    expect(alls[0].params).toEqual(['disabled', 'experimental']);
  });

  it('includeExperimental keeps experimental, still drops disabled', async () => {
    const { db, alls } = fakeDb({ renderers: [] });
    await createRendererRegistry(db).listRenderers({ includeExperimental: true });
    expect(alls[0].params).toEqual(['disabled']);
  });

  it('includeDisabled + includeExperimental lists everything', async () => {
    const { db, alls } = fakeDb({ renderers: [] });
    await createRendererRegistry(db).listRenderers({ includeDisabled: true, includeExperimental: true });
    expect(alls[0].sql).not.toMatch(/WHERE/);
    expect(alls[0].params).toEqual([]);
  });
});

// ── 3. Applicability before and after extraction ───────────

describe('getApplicableRenderers — content-aware renderers before a payload exists', () => {
  it('uses the module content type and flags needs_extraction', async () => {
    const { db } = fakeDb({ session: session(), renderers: [heatmapRow, flowchartRow, plainRow] });
    const resolveContentType = vi.fn(async () => 'risk_register' as const);
    const registry = createRendererRegistry(db, { resolveContentType });

    const offered = await registry.getApplicableRenderers('sess-1');

    expect(resolveContentType).toHaveBeenCalledWith('atlas-threat-cataloguer');
    expect(offered.map((r) => [r.id, r.needs_extraction])).toEqual([
      ['svg-risk-heatmap', true],
      ['plain-language', false],
    ]);
  });

  it('with a payload the required-fields filter is exact and nothing needs extraction', async () => {
    const withScores = session({ content_type: 'risk_register', structured_status: 'extracted',
      output_structured: payloadWith([{ id: 'R1', likelihood: 3, impact: 4 }]) });
    const withoutScores = session({ content_type: 'risk_register', structured_status: 'extracted',
      output_structured: payloadWith([{ id: 'R1', likelihood: 3 }]) });
    const resolveContentType = vi.fn(async () => 'risk_register' as const);

    const a = await createRendererRegistry(fakeDb({ session: withScores, renderers: [heatmapRow, plainRow] }).db, { resolveContentType })
      .getApplicableRenderers('sess-1');
    expect(a.map((r) => [r.id, r.needs_extraction])).toEqual([['svg-risk-heatmap', false], ['plain-language', false]]);

    const b = await createRendererRegistry(fakeDb({ session: withoutScores, renderers: [heatmapRow, plainRow] }).db, { resolveContentType })
      .getApplicableRenderers('sess-1');
    expect(b.map((r) => r.id)).toEqual(['plain-language']);
    // The session already carried a content type — the module was not consulted.
    expect(resolveContentType).not.toHaveBeenCalled();
  });

  it('rendererNeedsStructured is true for content_types or requires_fields, false for neither', () => {
    expect(rendererNeedsStructured({ applies_when: { content_types: ['risk_register'] } })).toBe(true);
    expect(rendererNeedsStructured({ applies_when: { requires_fields: ['items'] } })).toBe(true);
    expect(rendererNeedsStructured({ applies_when: {} })).toBe(false);
    expect(rendererNeedsStructured({ applies_when: { content_types: [], requires_fields: [] } })).toBe(false);
  });
});
