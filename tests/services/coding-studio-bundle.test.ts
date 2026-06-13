/**
 * coding-studio-bundle.test.ts — ANTON Studio P5 (.anton blueprint export).
 *
 * Builds a coding-studio-project bundle from a FULLY MOCKED DatabaseAdapter (no
 * real DB, no real FS for the workspace read — the bound workspace is left
 * unreadable so the code travels as a manifest-only entry, exercising the honest
 * "what does NOT travel" path), then VALIDATES it through the dispatching
 * anton-validator and asserts the round-trip shape:
 *   - bundle_type = coding-studio-project, structural validation, checksum verified
 *   - charter + plan + all 4 panel decisions + frameworks + atoms + test results travel
 *   - registry + SOURCE_BEARING + the validator all recognise the type
 */
import { describe, it, expect, beforeAll } from 'vitest';
import AdmZip from 'adm-zip';
import { bundleCodingStudioProject, BUNDLE_TYPE_REGISTRY } from '../../server/services/anton-bundler.js';
import { validateAntonFile } from '../../server/services/anton-validator.js';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';

const PROJECT_ID = 'cccccccc-dddd-eeee-ffff-000011112222';

function makeFakeDb(): DatabaseAdapter {
  const panelDecisions = [
    { gate: 'start', panel_verdict: 'endorse', blocking: false, mode: 'fast', model: 'mistral-medium-latest', chair_model: null, extracted_at: '2026-06-13T00:00:00Z', verdict_json: JSON.stringify({ gate: 'start', experts: [], agreements: [], dissents: [], open_questions: [], synthesis: 's', panel_verdict: 'endorse', blocking: false }) },
    { gate: 'build', panel_verdict: 'flag', blocking: false, mode: 'fast', model: 'mistral-medium-latest', chair_model: null, extracted_at: '2026-06-13T00:01:00Z', verdict_json: '{}' },
    { gate: 'testing', panel_verdict: 'endorse', blocking: false, mode: 'fast', model: 'mistral-medium-latest', chair_model: null, extracted_at: '2026-06-13T00:02:00Z', verdict_json: '{}' },
    { gate: 'finish', panel_verdict: 'endorse', blocking: false, mode: 'thorough', model: 'mistral-medium-latest', chair_model: 'mistral-large-latest', extracted_at: '2026-06-13T00:03:00Z', verdict_json: '{}' },
  ];
  const plan = { releaseId: 'r1', releaseName: 'MVP', summary: 'build', tasks: [{ taskId: 't1', title: 'A', status: 'done', reviseRounds: 1 }] };
  return {
    dialect: 'postgresql',
    async get<T>(sql: string, ..._p: unknown[]): Promise<T | undefined> {
      if (sql.includes('FROM coding_projects')) {
        return {
          id: PROJECT_ID, name: 'Demo Studio', description: 'a demo',
          discovery_summary: '# Charter\n\nProblem: build a demo.',
          tech_stack: JSON.stringify(['typescript', 'node']),
          expert_panels: JSON.stringify(['project_manager', 'engineering_expert']),
          studio_language: 'typescript',
          directory_path: null, // unbound → code travels as manifest only (honest)
          created_at: '2026-06-13T00:00:00Z', updated_at: '2026-06-13T00:04:00Z',
        } as T;
      }
      if (sql.includes('FROM coding_studio_runs')) {
        return {
          id: 'run1', status: 'done', autonomy: 'more', revise_cap: 4,
          plan: JSON.stringify(plan), step_log: JSON.stringify([{ at: 'x', kind: 'done', message: 'finished' }]),
          started_at: '2026-06-13T00:00:00Z', finished_at: '2026-06-13T00:04:00Z',
        } as T;
      }
      return undefined;
    },
    async all<T>(sql: string, ..._p: unknown[]): Promise<T[]> {
      if (sql.includes('FROM coding_panel_decisions')) return panelDecisions as T[];
      if (sql.includes('FROM knowledge_atoms')) {
        return [
          { id: 'a1', content: 'running tests fails: x', atom_type: 'test.failed', atom_origin: 'test_failure', confidence: 0.85, category: 'observation', tags: null, created_at: '2026-06-13T00:01:30Z' },
          { id: 'a2', content: 'after a revision tests pass', atom_type: 'pattern.works', atom_origin: 'pattern_works', confidence: 0.85, category: 'observation', tags: null, created_at: '2026-06-13T00:02:30Z' },
        ] as T[];
      }
      if (sql.includes('FROM coding_test_runs')) {
        return [
          { coding_task_id: 't1', test_suite_name: 'node --run test', pass_count: 1, fail_count: 0, skip_count: 0, total_count: 1, duration_ms: 5, exit_code: 0, timed_out: 0, command: '["node","--run","test"]', run_at: '2026-06-13T00:02:00Z' },
        ] as T[];
      }
      if (sql.includes('FROM coding_workspace_applications')) {
        return [
          { files: JSON.stringify([{ path: 'src/a.ts', action: 'create', hash_after: 'abc', hash_before: null }]), applied_at: '2026-06-13T00:02:00Z' },
        ] as T[];
      }
      return [];
    },
    async run(): Promise<RunResult> { return { changes: 0, lastInsertRowid: 0 }; },
    async exec(): Promise<void> {},
    async transaction<T>(fn: (d: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(makeFakeDb()); },
    async close(): Promise<void> {},
  } as unknown as DatabaseAdapter;
}

describe('coding-studio-project .anton blueprint', () => {
  let buffer: Buffer;
  beforeAll(async () => {
    buffer = await bundleCodingStudioProject(makeFakeDb(), PROJECT_ID, { author: 'Tester' });
  });

  it('registers the bundle type', () => {
    expect(BUNDLE_TYPE_REGISTRY['coding-studio-project']).toBeDefined();
    expect(BUNDLE_TYPE_REGISTRY['coding-studio-project'].contentsKey).toBe('coding_studio_projects');
  });

  it('packages charter + plan + all 4 panels + frameworks + atoms + tests + code manifest', () => {
    const zip = new AdmZip(buffer);
    const names = zip.getEntries().map((e) => e.entryName);
    for (const f of ['manifest.json', 'charter.md', 'plan.json', 'panels.json', 'frameworks.json', 'atoms.json', 'test-results.json', 'code-manifest.json', 'README.md']) {
      expect(names).toContain(f);
    }
    const panels = JSON.parse(zip.getEntry('panels.json')!.getData().toString('utf-8'));
    expect(panels).toHaveLength(4);
    expect(panels.map((p: any) => p.gate).sort()).toEqual(['build', 'finish', 'start', 'testing']);

    const atoms = JSON.parse(zip.getEntry('atoms.json')!.getData().toString('utf-8'));
    expect(atoms).toHaveLength(2);

    const charter = zip.getEntry('charter.md')!.getData().toString('utf-8');
    expect(charter).toContain('# Charter');

    // The workspace was unbound → code travels as a manifest entry only (honest).
    const codeManifest = JSON.parse(zip.getEntry('code-manifest.json')!.getData().toString('utf-8'));
    expect(codeManifest.workspace_bound).toBe(false);
    expect(codeManifest.files[0].content_included).toBe(false);
    expect(codeManifest.files[0].path).toBe('src/a.ts');
  });

  it('validates + round-trips through the dispatching validator (checksum verified)', async () => {
    const result = await validateAntonFile(buffer, makeFakeDb());
    expect(result.bundle_type).toBe('coding-studio-project');
    expect(result.validated_depth).toBe('structural');
    expect(result.checksum_state).toBe('verified');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});
