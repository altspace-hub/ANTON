// ── Missions — Template Parameters (Wave-3 3A.1) ───────────────────────────
// Every built-in template defines a parameters_schema, and the API accepted
// template_parameters — but the values were explicitly discarded at the
// route boundary and ${placeholder} substitution was delegated to LLM
// guesswork. This module makes parameters real:
//
//   1. createMission appends the typed values to the mission context as a
//      machine-recoverable block (formatTemplateParametersBlock /
//      extractTemplateParameters round-trip — no schema change needed).
//   2. decomposeMission substitutes ${param} into the template task graph
//      DETERMINISTICALLY before the refinement prompt is built. Exact-key,
//      single-pass replacement: parameter values are inert plain text and
//      are never re-scanned for further placeholders, so injection-shaped
//      values (e.g. a value containing "${other_param}") cannot expand.
//   3. Placeholders with no matching parameter are left verbatim and
//      reported, so the refinement prompt can tell the LLM exactly which
//      ones still need concrete values from the brief.
//
// All functions are pure — unit-tested without a DB.

import type { MissionTemplateParameter, TaskGraphTemplate, TaskGraphNode } from './types.js';

export type TemplateParameterValues = Record<string, string | number | boolean>;

// Marker line delimiting the auto-attached block inside mission.context.
// extractTemplateParameters scans for the LAST occurrence so user-authored
// context containing a similar line cannot shadow the real block.
export const TEMPLATE_PARAMETERS_MARKER = '--- Template parameters (auto-attached) ---';

// Same key alphabet as the Service Pack substitution helpers.
const PLACEHOLDER_RE = /\$\{([a-zA-Z0-9_]+)\}/g;

/**
 * Fill schema defaults for parameters the caller did not provide. Provided
 * values win; unknown keys (not in the schema) are kept — the template
 * author may document extra placeholders outside parameters_schema.
 */
export function mergeTemplateParameterDefaults(
  schema: MissionTemplateParameter[],
  provided: TemplateParameterValues,
): TemplateParameterValues {
  const out: TemplateParameterValues = { ...provided };
  for (const p of schema) {
    if (out[p.key] === undefined && p.default !== undefined) {
      out[p.key] = p.default;
    }
  }
  return out;
}

/**
 * Render the parameters as a human-readable, machine-recoverable block to
 * append to mission.context. One `key = <json>` line per parameter — values
 * are JSON-encoded so multi-line strings stay on one line and round-trip
 * exactly through extractTemplateParameters.
 */
export function formatTemplateParametersBlock(params: TemplateParameterValues): string {
  const keys = Object.keys(params);
  if (keys.length === 0) return '';
  const lines = keys.map(k => `${k} = ${JSON.stringify(params[k])}`);
  return `${TEMPLATE_PARAMETERS_MARKER}\n${lines.join('\n')}`;
}

/** Append the parameter block to a (possibly empty) context string. */
export function appendTemplateParametersToContext(
  context: string | null | undefined,
  params: TemplateParameterValues,
): string | null {
  const block = formatTemplateParametersBlock(params);
  const base = context?.trim() ?? '';
  if (!block) return base || null;
  return base ? `${base}\n\n${block}` : block;
}

/**
 * Recover the parameter map from a mission context. Returns {} when no
 * block is present. Parsing stops at the first line that doesn't match the
 * `key = <json>` shape, so trailing prose is ignored.
 */
export function extractTemplateParameters(context: string | null | undefined): TemplateParameterValues {
  if (!context) return {};
  const markerIdx = context.lastIndexOf(TEMPLATE_PARAMETERS_MARKER);
  if (markerIdx === -1) return {};
  const after = context.slice(markerIdx + TEMPLATE_PARAMETERS_MARKER.length);
  const params: TemplateParameterValues = {};
  for (const rawLine of after.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const m = /^([a-zA-Z0-9_]+) = (.+)$/.exec(line);
    if (!m) break;
    try {
      const value: unknown = JSON.parse(m[2]);
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        params[m[1]] = value;
      }
    } catch { break; }
  }
  return params;
}

export interface SubstitutionResult {
  graph: TaskGraphTemplate;
  /** Unique parameter keys that were substituted at least once. */
  substituted: string[];
  /** Unique placeholder keys found in the graph with no matching parameter (left verbatim for the LLM). */
  unresolved: string[];
}

/**
 * Deterministic ${param} substitution into a template task graph. Returns a
 * deep copy — the input graph is never mutated.
 *
 * Substitutes string fields (title, description, prompt, checkpoint_message)
 * and string leaves inside module_config (arrays/objects walked recursively;
 * numbers/booleans/null untouched). Single pass: substituted values are
 * plain text and are NOT re-scanned, so a value containing "${other}" stays
 * literal. Unknown placeholders are left in place and collected.
 */
export function substituteTemplateParameters(
  graph: TaskGraphTemplate,
  params: TemplateParameterValues,
): SubstitutionResult {
  const substituted = new Set<string>();
  const unresolved = new Set<string>();

  function sub(value: string): string {
    return value.replace(PLACEHOLDER_RE, (whole, key: string) => {
      if (Object.prototype.hasOwnProperty.call(params, key)) {
        substituted.add(key);
        return String(params[key]);
      }
      unresolved.add(key);
      return whole;
    });
  }

  function subDeep(value: unknown): unknown {
    if (typeof value === 'string') return sub(value);
    if (Array.isArray(value)) return value.map(subDeep);
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        out[k] = subDeep(v);
      }
      return out;
    }
    return value;
  }

  const tasks: TaskGraphNode[] = graph.tasks.map(t => ({
    ...t,
    title: sub(t.title),
    description: t.description !== undefined ? sub(t.description) : undefined,
    prompt: t.prompt !== undefined ? sub(t.prompt) : undefined,
    checkpoint_message: t.checkpoint_message !== undefined ? sub(t.checkpoint_message) : undefined,
    module_config: t.module_config !== undefined
      ? subDeep(t.module_config) as Record<string, unknown>
      : undefined,
  }));

  return {
    graph: { tasks },
    substituted: [...substituted].sort(),
    unresolved: [...unresolved].sort(),
  };
}
