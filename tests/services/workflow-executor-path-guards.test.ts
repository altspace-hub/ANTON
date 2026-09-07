/**
 * workflow-executor-path-guards.test.ts — the two filesystem paths in the headless
 * executor, and the ways each one used to escape.
 *
 * ── file_read ────────────────────────────────────────────────────────────────
 *
 * It carried its own copy of the ALLOWED_FOLDER_PATHS check instead of calling
 * lib/folder-guard.ts, and the copy was wrong in three ways. The one that mattered:
 *
 *     const allowedBases = (process.env.ALLOWED_FOLDER_PATHS ?? '').split(',').filter(Boolean);
 *     if (allowedBases.length > 0 && !allowedBases.some(...)) throw ...
 *
 * With the variable unset — the default, and the state of this repo's own .env —
 * allowedBases is empty, the conjunct is false, and the check does not run at all. An
 * unset whitelist meant no whitelist. It also compared with an unanchored startsWith
 * (so /data admitted /data-backup) and ran AFTER fs.existsSync, making the step an
 * existence oracle over the host even when the read was refused.
 *
 * That matters most through the 'kl:' branch, which takes its path from
 * knowledge_library.path. The insert side of that table has been guarded since
 * 2026-09-06, but rows predating the guard are still there and this is the consumer
 * that never re-checked them.
 *
 * ── llm ──────────────────────────────────────────────────────────────────────
 *
 * promptName comes from step config and was joined straight onto a path:
 * path.join(__dirname, '..', 'prompts', `${promptName}.md`). '../' walks out.
 * The file's contents become the system prompt, so this is a disclosure channel
 * through the model's output, and in this repo a '.md' target reaches not_to_github/.
 *
 * ── Why the assertions are shaped this way ───────────────────────────────────
 *
 * ALLOWED_FOLDER_PATHS is deleted, not set, in the file_read cases. Setting it would
 * test the branch that always worked; the bug only appears when it is absent, which is
 * how a default install runs.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';

vi.mock('../../server/services/provider-router.js', () => ({
  callChat: async () => ({ text: 'mock-response' }),
  mapModelToProvider: (m: string) => m,
}));
vi.mock('../../server/services/utility-model.js', () => ({
  getRoutedUtilityModel: async () => 'utility-model',
}));
vi.mock('../../server/routes/workflows.js', () => ({
  resolveTemplate: (template: string) => template,
}));
vi.mock('../../server/services/connection-manager.js', () => ({
  createConnectionManager: vi.fn(async () => {
    throw new Error('connection-manager not used in this test');
  }),
}));

import { executeScheduledWorkflow } from '../../server/services/workflow-executor.js';

/** A workflow of one step, plus the knowledge_library row a 'kl:' file_read resolves. */
function makeFakeDb(definition: unknown, klPath?: string): DatabaseAdapter {
  const runs = new Map<string, Record<string, unknown>>();
  const db: DatabaseAdapter = {
    dialect: 'postgresql' as DatabaseAdapter['dialect'],
    async get<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
      if (sql.includes('FROM workflow_schedules')) {
        return { workflow_definition: JSON.stringify(definition) } as T;
      }
      if (sql.includes('FROM knowledge_library')) {
        return (klPath === undefined ? undefined : { path: klPath }) as T | undefined;
      }
      if (sql.includes('FROM workflow_runs')) return runs.get(String(params[0])) as T | undefined;
      return undefined;
    },
    async all<T>(): Promise<T[]> { return []; },
    async run(sql: string, ...params: unknown[]): Promise<RunResult> {
      if (sql.includes('INSERT INTO workflow_runs')) {
        runs.set(String(params[0]), { id: params[0], status: params[3] });
      }
      return { changes: 1, lastInsertRowid: 0 };
    },
    async exec() { /* noop */ },
    async transaction<T>(fn: (tx: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(db); },
    async close() { /* noop */ },
  };
  return db;
}

function oneStep(type: string, config: Record<string, unknown>) {
  return {
    id: 'wf-guard-test', label: 'Guard Test', shortLabel: 'G', icon: 'ClipboardList',
    description: '', category: 'custom', estimatedTime: '', tags: [],
    steps: [{ id: 'step-1', label: 'Step', description: '', type, config }],
  };
}

const fileReadStep = () => oneStep('file_read', { connectionId: 'kl:kl-1', outputVariable: 'files' });

let originalAllowed: string | undefined;
beforeEach(() => { originalAllowed = process.env.ALLOWED_FOLDER_PATHS; });
afterEach(() => {
  if (originalAllowed === undefined) delete process.env.ALLOWED_FOLDER_PATHS;
  else process.env.ALLOWED_FOLDER_PATHS = originalAllowed;
});

describe('file_read — the whitelist is consulted even when ALLOWED_FOLDER_PATHS is unset', () => {
  it('refuses a Knowledge Library path outside the allowed bases', async () => {
    // Unset, which is the default and was exactly the condition the old check skipped.
    // The target is the repo root: readable, so the OLD code genuinely succeeded here,
    // and outside the unset-fallback bases (./uploads, ./outputs), so the new one
    // refuses. An earlier version of this case pointed at the drive root and passed
    // against the vulnerable code by accident — Windows answers EPERM there, whose
    // message is "operation not permitted" and matched a loose /not permitted/. Hence
    // both the readable target and the exact guard wording below.
    delete process.env.ALLOWED_FOLDER_PATHS;
    const outside = process.cwd();
    const result = await executeScheduledWorkflow(makeFakeDb(fileReadStep(), outside), 'wf-guard-test', 1);

    expect(result.success).toBe(false);
    expect(JSON.stringify(result)).toMatch(/Folder access not permitted/);
  });

  it('refuses a sibling directory that merely shares a prefix with an allowed base', async () => {
    // The unanchored startsWith: a base of <cwd>/uploads used to admit
    // <cwd>/uploads-backup. Separator-anchored containment refuses it.
    process.env.ALLOWED_FOLDER_PATHS = path.resolve(process.cwd(), 'uploads');
    const sibling = path.resolve(process.cwd(), 'uploads-backup');
    const result = await executeScheduledWorkflow(makeFakeDb(fileReadStep(), sibling), 'wf-guard-test', 1);

    expect(result.success).toBe(false);
    expect(JSON.stringify(result)).toMatch(/Folder access not permitted/);
  });

  it('refuses before probing existence, so it is not an oracle over the host', async () => {
    // A path that does NOT exist and is NOT allowed must fail on permission, not on
    // "does not exist" — otherwise the two answers distinguish present from absent
    // anywhere on the disk.
    delete process.env.ALLOWED_FOLDER_PATHS;
    const missingAndOutside = path.resolve(process.cwd(), '..', `no-such-dir-${Date.now()}`);
    const result = await executeScheduledWorkflow(
      makeFakeDb(fileReadStep(), missingAndOutside), 'wf-guard-test', 1);

    expect(result.success).toBe(false);
    const text = JSON.stringify(result);
    expect(text).toMatch(/Folder access not permitted/);
    expect(text, 'the refusal revealed whether the path exists').not.toMatch(/does not exist/i);
  });

  it('still allows a path inside the allowed bases', async () => {
    // The half that would break every legitimate workflow if the guard were too strict.
    process.env.ALLOWED_FOLDER_PATHS = process.cwd();
    const inside = path.resolve(process.cwd(), 'server');
    const result = await executeScheduledWorkflow(makeFakeDb(fileReadStep(), inside), 'wf-guard-test', 1);

    expect(result.success, JSON.stringify(result)).toBe(true);
  });
});

describe('llm — the prompt name cannot walk out of server/prompts', () => {
  const llmStep = (prompt: string) => oneStep('llm', { prompt, userMessage: 'go', outputVariable: 'out' });

  it('refuses a traversing prompt name', async () => {
    const result = await executeScheduledWorkflow(
      makeFakeDb(llmStep('../../../../etc/passwd')), 'wf-guard-test', 1);

    expect(result.success).toBe(false);
    expect(JSON.stringify(result)).toMatch(/must live under server\/prompts/i);
  });

  it('refuses one that reaches a real file outside the directory', async () => {
    // '.md' is not much of a restriction in a repo full of them: this resolves to
    // <repo>/CLAUDE.md, and its contents would have become the system prompt.
    const result = await executeScheduledWorkflow(
      makeFakeDb(llmStep('../../CLAUDE')), 'wf-guard-test', 1);

    expect(result.success).toBe(false);
    expect(JSON.stringify(result)).toMatch(/must live under server\/prompts/i);
  });

  it('still accepts an ordinary prompt name, present or missing', async () => {
    // A missing prompt has always fallen back to a generic system prompt, and must keep
    // doing so — the throw is for escaping the directory, not for being absent.
    const result = await executeScheduledWorkflow(
      makeFakeDb(llmStep('nonexistent-prompt-name')), 'wf-guard-test', 1);

    expect(result.success, JSON.stringify(result)).toBe(true);
  });

  it('still accepts a nested name inside the directory', async () => {
    const result = await executeScheduledWorkflow(
      makeFakeDb(llmStep('markets/some-brief')), 'wf-guard-test', 1);

    expect(result.success, JSON.stringify(result)).toBe(true);
  });
});
