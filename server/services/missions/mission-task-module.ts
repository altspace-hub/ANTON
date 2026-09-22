/**
 * A mission task that names an expert module runs WITH that module's prompt.
 *
 * Every task graph node carries `module_id` — templates set it, and the
 * decomposer asks the model for one — and it is persisted on mission_tasks.
 * Until 2026-09-22 the executor never read it: the AMLR programme's BWRA step
 * said "Invoke the business-wide-risk-assessment module…" in words, and the
 * model got that sentence under a generic mission prompt; the module's own
 * instructions (its 12 sections, its citations) were never loaded. Now the
 * module's system prompt is appended to the task's system prompt.
 *
 * A name that is unsafe or unknown does not fail the task — model-planned
 * missions may name modules loosely — but it is reported (`warning`), so the
 * run log says the step ran without the module it asked for.
 */
import { getModule, getModuleSystemPrompt } from '../module-loader.js';
import { isSafePathSegment } from '../../lib/safe-id.js';

export interface TaskModuleResolution {
  /** Text to append to the task's system prompt ('' when there is none). */
  block: string;
  /** The module actually applied, or null. */
  moduleId: string | null;
  /** Set when the task named a module that could not be applied. */
  warning?: string;
}

export async function resolveTaskModule(moduleId: unknown): Promise<TaskModuleResolution> {
  if (moduleId === undefined || moduleId === null || moduleId === '') return { block: '', moduleId: null };
  if (!isSafePathSegment(moduleId)) {
    return { block: '', moduleId: null, warning: `module id ${JSON.stringify(moduleId)} is not a valid id — ran without it` };
  }
  const prompt = await getModuleSystemPrompt(moduleId);
  if (!prompt) return { block: '', moduleId: null, warning: `module ${moduleId} was not found — ran without it` };
  const label = (await getModule(moduleId))?.label ?? moduleId;

  return {
    moduleId,
    block: `

EXPERT MODULE — ${label}
────────────────────────
This task runs as the "${moduleId}" module. Follow its instructions below for
the content and structure of the output; the mission context above tells you
what this task is for and what earlier tasks produced.

${prompt.trim()}`,
  };
}
