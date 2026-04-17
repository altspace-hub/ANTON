// Unit test for the svg-risk-heatmap renderer.
// The renderer writes a file as part of its contract, so we run it
// against a temp OUTPUT_DIR and verify the SVG content it produced.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';

describe('svg-risk-heatmap renderer', () => {
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'anton-heatmap-test-'));
    process.env.OUTPUT_DIR = tmpDir;
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('renders a risk_register payload to an SVG file with expected markers', async () => {
    const { render } = await import('../../../server/services/renderers/visualize/svg-risk-heatmap.js');
    const result = await render(
      {
        schema_version: '1.0',
        module_id: 'test-module',
        area_id: 'risk',
        content_type: 'risk_register',
        sector: null,
        generated_at: new Date().toISOString(),
        model: 'test',
        body: {
          title: 'Test Register',
          items: [
            { id: 'R-1', risk: 'Market risk',    likelihood: 3, impact: 4 },
            { id: 'R-2', risk: 'Operational',    likelihood: 2, impact: 5 },
            { id: 'R-3', risk: 'Compliance',     residual_likelihood: 4, residual_impact: 4 },
            { id: 'R-4', risk: 'No score at all' /* should be skipped */ },
          ],
        },
      },
      {
        session: { id: 'sess_test_1', module_id: 'test-module', title: 'Test', area_id: 'risk', content_type: 'risk_register', sector: null, user_id: null },
        options: {},
      },
    );

    expect(result.file_type).toBe('svg');
    expect(result.mime_type).toBe('image/svg+xml');
    expect(result.metadata.risks_plotted).toBe(3);
    expect(result.metadata.total_risks).toBe(4);

    const abs = path.join(tmpDir, 'renderer-artifacts', 'sess_test_1', path.basename(result.file_path));
    const svg = await fs.readFile(abs, 'utf8');
    expect(svg).toMatch(/^<\?xml version="1\.0"/);
    expect(svg).toMatch(/<svg /);
    expect(svg).toMatch(/Test Register/);
    // Three risks should produce three <circle> elements with <title> tooltips
    expect((svg.match(/<circle /g) ?? []).length).toBe(3);
    expect(svg).toMatch(/<title>R-1: Market risk<\/title>/);
  });

  it('throws when the register has no items', async () => {
    const { render } = await import('../../../server/services/renderers/visualize/svg-risk-heatmap.js');
    await expect(render(
      {
        schema_version: '1.0',
        module_id: 'test-module',
        area_id: 'risk',
        content_type: 'risk_register',
        sector: null,
        generated_at: new Date().toISOString(),
        model: 'test',
        body: { title: 'Empty', items: [] },
      },
      { session: { id: 'sess_test_2', module_id: 'test-module', title: 'Empty', area_id: 'risk', content_type: 'risk_register', sector: null, user_id: null }, options: {} },
    )).rejects.toThrow(/no items/);
  });

  it('rejects a wrong content_type', async () => {
    const { render } = await import('../../../server/services/renderers/visualize/svg-risk-heatmap.js');
    await expect(render(
      {
        schema_version: '1.0', module_id: 't', area_id: '', content_type: 'gap_analysis',
        sector: null, generated_at: '', model: '', body: {},
      } as never,
      { session: { id: 'sess_test_3', module_id: 't', title: 't', area_id: '', content_type: 'gap_analysis', sector: null, user_id: null }, options: {} },
    )).rejects.toThrow(/expects risk_register/);
  });
});
