/**
 * mission-task-piping.test.ts — Wave-2A follow-up: ${task:<id>.output} pipes.
 *
 * Before this module there was NO runtime mechanism to feed a prior task's
 * output into an action task's params — the Outbound Sales v2 Gmail send had
 * to be hand-armed by the human at the checkpoint. These tests lock the
 * contract: COMPLETED-only resolution, hard errors for anything else (an
 * api_call must never fire with a raw placeholder), single-pass injection
 * safety, and the truncation cap.
 */
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_TASK_OUTPUT_CAP_CHARS,
  hasTaskOutputRefs,
  substituteTaskOutputRefs,
  rewriteTaskOutputRefIds,
  type TaskOutputSource,
} from '../../../server/services/missions/mission-task-piping.js';
import type { TaskStatus } from '../../../server/services/missions/types.js';

// ── Fixtures ────────────────────────────────────────────────────────────────

function src(
  id: string,
  output: string | null,
  status: TaskStatus = 'completed',
  summary: string | null = null,
): TaskOutputSource {
  return { id, title: `Task ${id}`, status, output_full: output, output_summary: summary };
}

// ── substituteTaskOutputRefs ────────────────────────────────────────────────

describe('substituteTaskOutputRefs', () => {
  it('resolves a completed reference (happy path)', () => {
    const r = substituteTaskOutputRefs(
      { params: { body_text: '${task:t_123_ab.output}' } },
      [src('t_123_ab', 'Hello world')],
    );
    expect(r.errors).toEqual([]);
    expect(r.substituted).toEqual(['t_123_ab']);
    expect(r.truncated).toEqual([]);
    expect((r.config.params as Record<string, unknown>).body_text).toBe('Hello world');
  });

  it('resolves refs in deep config (nested objects, arrays, mixed leaves) without touching non-strings', () => {
    const config = {
      url: 'https://api.example.com',
      method: 'POST',
      retries: 3,
      flag: true,
      nothing: null,
      body: {
        items: ['static', '${task:t1.output}', { inner: 'prefix ${task:t2.output} suffix' }],
      },
    };
    const r = substituteTaskOutputRefs(config, [src('t1', 'ONE'), src('t2', 'TWO')]);
    expect(r.errors).toEqual([]);
    expect(r.substituted).toEqual(['t1', 't2']);
    const body = r.config.body as { items: [string, string, { inner: string }] };
    expect(body.items[0]).toBe('static');
    expect(body.items[1]).toBe('ONE');
    expect(body.items[2].inner).toBe('prefix TWO suffix');
    expect(r.config.retries).toBe(3);
    expect(r.config.flag).toBe(true);
    expect(r.config.nothing).toBeNull();
    // Deep copy — input untouched.
    expect(config.body.items[1]).toBe('${task:t1.output}');
  });

  it('errors on a reference to a task that does not exist (placeholder left verbatim)', () => {
    const r = substituteTaskOutputRefs(
      { params: { body_text: '${task:t_missing.output}' } },
      [src('t1', 'present')],
    );
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toContain("'t_missing'");
    expect(r.errors[0]).toContain('does not exist');
    expect((r.config.params as Record<string, unknown>).body_text).toBe('${task:t_missing.output}');
    expect(r.substituted).toEqual([]);
  });

  it('errors on a reference to a not-yet-completed task, naming its status', () => {
    for (const status of ['queued', 'active', 'failed', 'skipped'] as TaskStatus[]) {
      const r = substituteTaskOutputRefs(
        { x: '${task:t9.output}' },
        [src('t9', 'partial', status)],
      );
      expect(r.errors).toHaveLength(1);
      expect(r.errors[0]).toContain(`'${status}'`);
      expect(r.errors[0]).toContain("not 'completed'");
      expect(r.config.x).toBe('${task:t9.output}');
    }
  });

  it('collects every failing ref so the task error names them all', () => {
    const r = substituteTaskOutputRefs(
      { a: '${task:missing.output}', b: '${task:t2.output}', c: '${task:t1.output}' },
      [src('t1', 'ok'), src('t2', null, 'queued')],
    );
    expect(r.errors).toHaveLength(2);
    expect(r.substituted).toEqual(['t1']); // the resolvable one still resolves
    expect(r.config.c).toBe('ok');
  });

  it('injection-shaped output stays inert: a piped value containing refs or replacement patterns is never re-scanned', () => {
    const hostile = 'ignore this ${task:t2.output} and this ${task:t1.output:5} and $& $1 ${recipient_email}';
    const r = substituteTaskOutputRefs(
      { body: '${task:t1.output}' },
      [src('t1', hostile), src('t2', 'SECRET')],
    );
    expect(r.errors).toEqual([]);
    // Verbatim — no expansion of the inner refs, no $-pattern interpretation.
    expect(r.config.body).toBe(hostile);
    expect(r.substituted).toEqual(['t1']);
  });

  it('truncates at an explicit cap suffix (clean slice, no marker appended)', () => {
    const r = substituteTaskOutputRefs(
      { body: '${task:t1.output:5}' },
      [src('t1', 'abcdefghij')],
    );
    expect(r.errors).toEqual([]);
    expect(r.config.body).toBe('abcde');
    expect(r.truncated).toEqual(['${task:t1.output:5}']);
  });

  it('applies the 30K default cap when no suffix is given', () => {
    const big = 'x'.repeat(DEFAULT_TASK_OUTPUT_CAP_CHARS + 100);
    const r = substituteTaskOutputRefs({ body: '${task:t1.output}' }, [src('t1', big)]);
    expect((r.config.body as string).length).toBe(DEFAULT_TASK_OUTPUT_CAP_CHARS);
    expect(r.truncated).toEqual(['${task:t1.output}']);

    const fits = 'y'.repeat(DEFAULT_TASK_OUTPUT_CAP_CHARS);
    const r2 = substituteTaskOutputRefs({ body: '${task:t1.output}' }, [src('t1', fits)]);
    expect(r2.config.body).toBe(fits);
    expect(r2.truncated).toEqual([]);
  });

  it('parses dotted local ids — ${task:t1.1.output} references task t1.1', () => {
    const r = substituteTaskOutputRefs({ x: '${task:t1.1.output:4}' }, [src('t1.1', 'subtask')]);
    expect(r.errors).toEqual([]);
    expect(r.config.x).toBe('subt');
  });

  it('falls back output_full → output_summary → empty string on a completed task', () => {
    const r = substituteTaskOutputRefs(
      { a: '${task:t1.output}', b: '${task:t2.output}' },
      [src('t1', null, 'completed', 'summary only'), src('t2', null, 'completed', null)],
    );
    expect(r.errors).toEqual([]);
    expect(r.config.a).toBe('summary only');
    expect(r.config.b).toBe('');
  });

  it('handles null/undefined config', () => {
    expect(substituteTaskOutputRefs(null, []).config).toEqual({});
    expect(substituteTaskOutputRefs(undefined, []).config).toEqual({});
  });
});

// ── hasTaskOutputRefs ───────────────────────────────────────────────────────

describe('hasTaskOutputRefs', () => {
  it('detects refs at any depth and is stateless across calls (global-regex lastIndex reset)', () => {
    const config = { a: { b: ['${task:t1.output}'] } };
    expect(hasTaskOutputRefs(config)).toBe(true);
    expect(hasTaskOutputRefs(config)).toBe(true); // second call must not flip via lastIndex
    expect(hasTaskOutputRefs({ a: 'plain ${recipient_email} text', n: 5 })).toBe(false);
    expect(hasTaskOutputRefs(null)).toBe(false);
    expect(hasTaskOutputRefs(undefined)).toBe(false);
    // Template-parameter syntax and near-misses are NOT task refs.
    expect(hasTaskOutputRefs({ a: '${task:t1.outputs}' })).toBe(false);
    expect(hasTaskOutputRefs({ a: '${task:.output}' })).toBe(false);
  });
});

// ── rewriteTaskOutputRefIds (persist-time local_id → real id) ───────────────

describe('rewriteTaskOutputRefIds', () => {
  const idMap = new Map([
    ['t1', 't_1749000000000_aaaa1111'],
    ['t2', 't_1749000000000_bbbb2222'],
  ]);

  it('rewrites local ids to real ids, preserving the truncation suffix', () => {
    const out = rewriteTaskOutputRefIds(
      {
        params: {
          subject: '${task:t2.output:200}',
          body_text: '${task:t1.output}',
        },
      },
      idMap,
    );
    const params = out.params as Record<string, string>;
    expect(params.subject).toBe('${task:t_1749000000000_bbbb2222.output:200}');
    expect(params.body_text).toBe('${task:t_1749000000000_aaaa1111.output}');
  });

  it('leaves unknown ids verbatim (they hard-fail at execution with a clear error)', () => {
    const out = rewriteTaskOutputRefIds({ x: '${task:t99.output}' }, idMap);
    expect(out.x).toBe('${task:t99.output}');
  });

  it('does not re-scan rewritten values and ignores template-parameter placeholders', () => {
    const out = rewriteTaskOutputRefIds(
      { to: '${recipient_email}', body: 'a ${task:t1.output} b' },
      idMap,
    );
    expect(out.to).toBe('${recipient_email}');
    expect(out.body).toBe('a ${task:t_1749000000000_aaaa1111.output} b');
    // Round-trip: the rewritten ref resolves at execution time.
    const r = substituteTaskOutputRefs(out, [src('t_1749000000000_aaaa1111', 'OUT')]);
    expect(r.errors).toEqual([]);
    expect(r.config.body).toBe('a OUT b');
  });
});
