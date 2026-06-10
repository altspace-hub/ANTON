// ── Missions — Task-output piping (Wave-2A follow-up) ───────────────────────
// ${task:<taskId>.output} inside a module_config string leaf resolves, at
// execution time, to the COMPLETED referenced task's output — so an action
// task (api_call / browser / notification) can consume what a prior LLM task
// produced without a human hand-arming params at a checkpoint. An optional
// truncation suffix caps the injected length: ${task:t1.output:5000}. With
// no suffix the cap is DEFAULT_TASK_OUTPUT_CAP_CHARS (30 000 chars — the
// same per-task ceiling mission-notification uses for delivery bundles).
// Truncation is a clean slice with NO marker appended: the piped value may
// be a payload the human approved verbatim (an email body, an API field),
// and a marker would silently alter the approved content.
//
// Two phases:
//   1. rewriteTaskOutputRefIds — at persist time (mission-controller), the
//      graph's local ids ("t1") inside references are rewritten to real task
//      ids using the same idMap that resolves depends_on. Unknown local ids
//      are left verbatim — they then fail loudly at execution.
//   2. substituteTaskOutputRefs — at execution time (mission-executor),
//      every reference must point at a COMPLETED task in the same mission.
//      Anything else is an error and the executor hard-fails the task
//      BEFORE any external call — an api_call must never fire with a raw
//      placeholder in its params.
//
// Injection safety: same single-pass replace technique as
// mission-template-parameters.ts — substituted values are returned from the
// replace() callback and are never re-scanned, so an output containing
// "${task:x.output}" (or replacement patterns like "$&") stays inert text.
//
// All functions are pure — unit-tested without a DB.

import type { MissionTask } from './types.js';

/** Default injected-output cap — matches mission-notification's PER_TASK_CAP_CHARS. */
export const DEFAULT_TASK_OUTPUT_CAP_CHARS = 30_000;

// Lazy id quantifier so "${task:t1.1.output}" parses as id "t1.1" with the
// literal ".output" anchored after it. Covers template local ids ("t1",
// "t1.1") and real persisted ids ("t_<ts>_<hex8>"). Optional ":<digits>"
// suffix is the truncation cap.
const TASK_OUTPUT_REF_RE = /\$\{task:([a-zA-Z0-9_.-]+?)\.output(?::([0-9]+))?\}/g;

/** The slice of a task row the substitution needs — tests build these inline. */
export type TaskOutputSource = Pick<
  MissionTask, 'id' | 'title' | 'status' | 'output_full' | 'output_summary'
>;

export interface TaskOutputSubstitutionResult {
  config: Record<string, unknown>;
  /** Distinct task ids whose output was injected at least once. */
  substituted: string[];
  /** Raw refs (e.g. "${task:t1.output:100}") whose output was cut at the cap. */
  truncated: string[];
  /** One human-readable error per failing ref — the task must hard-fail when non-empty. */
  errors: string[];
}

/** Deep-map every string leaf of a JSON-ish value. Non-strings pass through untouched. */
function mapStringLeaves(value: unknown, fn: (s: string) => string): unknown {
  if (typeof value === 'string') return fn(value);
  if (Array.isArray(value)) return value.map((v) => mapStringLeaves(v, fn));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = mapStringLeaves(v, fn);
    }
    return out;
  }
  return value;
}

/** Cheap pre-check so the executor only loads the mission's tasks when needed. */
export function hasTaskOutputRefs(value: unknown): boolean {
  if (typeof value === 'string') {
    TASK_OUTPUT_REF_RE.lastIndex = 0; // global regex — reset before .test
    return TASK_OUTPUT_REF_RE.test(value);
  }
  if (Array.isArray(value)) return value.some(hasTaskOutputRefs);
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).some(hasTaskOutputRefs);
  }
  return false;
}

/**
 * Execution-time resolution of ${task:<id>.output[:<cap>]} references against
 * the mission's tasks. Returns a deep copy — the input config is never
 * mutated. A reference resolves ONLY when the referenced task exists and is
 * status='completed' (output_full, falling back to output_summary, falling
 * back to ''). Unknown ids and not-yet-completed tasks are collected as
 * errors with the placeholder left verbatim — the caller must fail the task
 * without running any executor.
 */
export function substituteTaskOutputRefs(
  config: Record<string, unknown> | null | undefined,
  tasks: ReadonlyArray<TaskOutputSource>,
): TaskOutputSubstitutionResult {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const substituted = new Set<string>();
  const truncated = new Set<string>();
  const errors = new Set<string>();

  const sub = (value: string): string =>
    value.replace(TASK_OUTPUT_REF_RE, (whole, taskId: string, capRaw: string | undefined) => {
      const source = byId.get(taskId);
      if (!source) {
        errors.add(`'${whole}' references task '${taskId}', which does not exist in this mission`);
        return whole;
      }
      if (source.status !== 'completed') {
        errors.add(
          `'${whole}' references task '${taskId}' ('${source.title}'), which is '${source.status}', not 'completed' — add a blocking dependency on it so it finishes first`,
        );
        return whole;
      }
      const output = source.output_full ?? source.output_summary ?? '';
      const cap = capRaw !== undefined
        ? Math.max(1, Number.parseInt(capRaw, 10))
        : DEFAULT_TASK_OUTPUT_CAP_CHARS;
      substituted.add(taskId);
      if (output.length > cap) {
        truncated.add(whole);
        return output.slice(0, cap);
      }
      return output;
    });

  return {
    config: (config ? mapStringLeaves(config, sub) : {}) as Record<string, unknown>,
    substituted: [...substituted].sort(),
    truncated: [...truncated].sort(),
    errors: [...errors],
  };
}

/**
 * Persist-time rewrite of template/decomposition local ids ("t1") to real
 * task ids, using the same local_id → id map persistTaskGraph builds for
 * depends_on. The truncation suffix is preserved. Ids not in the map (real
 * ids on re-decomposition, or author typos) are left verbatim — typos then
 * hard-fail at execution with the raw placeholder in the error.
 */
export function rewriteTaskOutputRefIds(
  config: Record<string, unknown>,
  idMap: ReadonlyMap<string, string>,
): Record<string, unknown> {
  const sub = (value: string): string =>
    value.replace(TASK_OUTPUT_REF_RE, (whole, taskId: string, capRaw: string | undefined) => {
      const realId = idMap.get(taskId);
      if (!realId) return whole;
      return `\${task:${realId}.output${capRaw !== undefined ? `:${capRaw}` : ''}}`;
    });
  return mapStringLeaves(config, sub) as Record<string, unknown>;
}
