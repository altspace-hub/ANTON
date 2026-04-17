// Unit test for the mermaid-flowchart renderer.
// Verifies the Mermaid source emitted matches the shape rules in the
// renderer (node shapes per step.kind, edge labels, classDef footer).

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';

describe('mermaid-flowchart renderer', () => {
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'anton-mermaid-test-'));
    process.env.OUTPUT_DIR = tmpDir;
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('emits a flowchart with correct node shapes + edge labels', async () => {
    const { render } = await import('../../../server/services/renderers/visualize/mermaid-flowchart.js');
    const result = await render(
      {
        schema_version: '1.0', module_id: 'onboard', area_id: 'ops', content_type: 'process_map',
        sector: null, generated_at: '', model: '',
        body: {
          title: 'Test flow',
          steps: [
            { id: 's0', label: 'Start',         kind: 'start',    next: [{ to: 's1' }] },
            { id: 's1', label: 'Do the thing',  kind: 'action',   next: [{ to: 's2' }] },
            { id: 's2', label: 'High risk?',    kind: 'decision', next: [{ to: 's3', label: 'yes' }, { to: 's4', label: 'no' }] },
            { id: 's3', label: 'Reject',        kind: 'end' },
            { id: 's4', label: 'Accept',        kind: 'end' },
          ],
        },
      },
      { session: { id: 'sess_flow_1', module_id: 'onboard', title: 'Onboarding', area_id: 'ops', content_type: 'process_map', sector: null, user_id: null }, options: {} },
    );

    expect(result.file_type).toBe('mmd');
    expect(result.metadata.node_count).toBe(5);
    // s0→s1, s1→s2, s2→s3 (yes), s2→s4 (no) = 4 edges
    expect(result.metadata.edge_count).toBe(4);

    const mermaid = result.metadata.mermaid_syntax as string;
    expect(mermaid).toContain('flowchart TD');
    // Stadium shape for start/end
    expect(mermaid).toMatch(/s0\(\[Start\]\)/);
    expect(mermaid).toMatch(/s3\(\[Reject\]\)/);
    // Rhombus for decision
    expect(mermaid).toMatch(/s2\{High risk\?\}/);
    // Edge labels for decision branches
    expect(mermaid).toMatch(/s2 -->\|yes\| s3/);
    expect(mermaid).toMatch(/s2 -->\|no\| s4/);
    // Class assignments
    expect(mermaid).toMatch(/class s0 start/);
    expect(mermaid).toMatch(/class s3,s4 end/);
  });

  it('sanitises step ids that contain unsafe characters', async () => {
    const { render } = await import('../../../server/services/renderers/visualize/mermaid-flowchart.js');
    const result = await render(
      {
        schema_version: '1.0', module_id: 'm', area_id: '', content_type: 'process_map',
        sector: null, generated_at: '', model: '',
        body: {
          steps: [
            { id: 'step.one', label: 'First',  next: [{ to: 'step-two' }] },
            { id: 'step-two', label: 'Second' },
          ],
        },
      },
      { session: { id: 'sess_flow_2', module_id: 'm', title: 'm', area_id: '', content_type: 'process_map', sector: null, user_id: null }, options: {} },
    );
    const mermaid = result.metadata.mermaid_syntax as string;
    expect(mermaid).toMatch(/step_one\[First\]/);
    expect(mermaid).toMatch(/step_two\[Second\]/);
    expect(mermaid).toMatch(/step_one --> step_two/);
  });
});
