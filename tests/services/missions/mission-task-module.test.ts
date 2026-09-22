/**
 * mission-task-module.test.ts — a mission task that names a module runs with
 * that module's prompt, and every module a built-in template names exists.
 *
 * 2026-09-22: the AMLR readiness programme's BWRA step said "Invoke the
 * business-wide-risk-assessment module…" in words while the executor ignored
 * mission_tasks.module_id; its required_modules named `amlr-gap-analysis`
 * (the module is `gap-analysis`) and `policy-document` (an output format).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolveTaskModule } from '../../../server/services/missions/mission-task-module.js';
import { BUILTIN_TEMPLATES, builtinDefinitionChanged } from '../../../server/services/missions/seed-templates.js';
import { getModuleSystemPrompt } from '../../../server/services/module-loader.js';

describe('resolveTaskModule', () => {
  it('a real module: its system prompt, under a heading that names it', async () => {
    const r = await resolveTaskModule('business-wide-risk-assessment');
    expect(r.moduleId).toBe('business-wide-risk-assessment');
    expect(r.warning).toBeUndefined();
    expect(r.block).toContain('EXPERT MODULE — Business-Wide Risk Assessment');
    expect(r.block).toContain('# Business-Wide Risk Assessment (BWRA)');
  });

  it('no module named: nothing added, nothing reported', async () => {
    for (const v of [null, undefined, '']) expect(await resolveTaskModule(v)).toEqual({ block: '', moduleId: null });
  });

  it('an unknown module: runs without it, and says so', async () => {
    const r = await resolveTaskModule('amlr-gap-analysis');
    expect(r.block).toBe('');
    expect(r.warning).toMatch(/amlr-gap-analysis was not found/);
  });

  it('an unsafe id is never looked up', async () => {
    const r = await resolveTaskModule('../fcp/modules/gap-analysis');
    expect(r.block).toBe('');
    expect(r.warning).toMatch(/not a valid id/);
  });
});

describe('built-in templates', () => {
  const named = BUILTIN_TEMPLATES.flatMap((t) => [
    ...t.task_graph_template.tasks.filter((n) => n.module_id).map((n) => ({ template: t.id, where: n.local_id, id: n.module_id as string })),
    ...(t.required_modules ?? []).map((id) => ({ template: t.id, where: 'required_modules', id })),
  ]);

  it('name at least the AMLR programme modules', () => {
    expect(named.filter((n) => n.template === 'tmpl_amlr_readiness_v1').map((n) => n.id)).toEqual(
      expect.arrayContaining(['fcp-scope-assessor', 'business-wide-risk-assessment', 'gap-analysis', 'document-creation', 'training-content']),
    );
  });

  it.each(named.map((n) => [`${n.template} ${n.where} → ${n.id}`, n.id]))('%s exists', async (_label, id) => {
    expect(await getModuleSystemPrompt(id as string)).toBeTruthy();
  });

  it('no task prompt tells the model to "invoke" a module or promises an executor that does not exist', () => {
    const text = JSON.stringify(BUILTIN_TEMPLATES.map((t) => t.task_graph_template));
    expect(text).not.toMatch(/amlr-gap-analysis|policy-document module|POST \/api\/atlas|atlas-\* sub-modules/);
  });
});

describe('builtinDefinitionChanged', () => {
  const amlr = BUILTIN_TEMPLATES.find((t) => t.id === 'tmpl_amlr_readiness_v1')!;

  it('ignores key order (jsonb does not keep it) and usage stats', () => {
    const reordered = JSON.parse(JSON.stringify({ ...amlr, times_used: 7 })) as typeof amlr;
    reordered.default_budget = Object.fromEntries(Object.entries(amlr.default_budget).reverse()) as typeof amlr.default_budget;
    expect(builtinDefinitionChanged(reordered, amlr)).toBe(false);
  });

  it('sees a changed task graph', () => {
    const old = JSON.parse(JSON.stringify(amlr)) as typeof amlr;
    old.task_graph_template.tasks[3].module_id = undefined;
    expect(builtinDefinitionChanged(old, amlr)).toBe(true);
  });
});

describe('wiring', () => {
  it('the executor applies the task module_id to the system prompt', () => {
    const src = readFileSync('server/services/missions/mission-executor.ts', 'utf8');
    expect(src).toMatch(/const taskModule = await resolveTaskModule\(task\.module_id\);/);
    expect(src).toMatch(/\$\{taskModule\.block\}`;/);
  });
});
