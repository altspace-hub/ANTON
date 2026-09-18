/**
 * module-loader.ts
 * Scans server/areas/ at startup, loads and validates all area + module configs,
 * caches them in memory, and exposes query functions.
 *
 * Directory structure expected:
 *   server/areas/[area-id]/
 *     ├── area.json
 *     ├── area-context.md
 *     └── modules/
 *         └── [module-id]/
 *             ├── module.json
 *             └── system-prompt.md
 */

import path from 'path';
import fs from 'fs-extra';
import { watch as fsWatch } from 'node:fs';
import { fileURLToPath } from 'url';
import type { AreaConfig, ModuleConfig, LoadedArea, FieldType } from '../types/area-config.js';
import { getSkillById, isDiskSkillsPreloaded } from './skills-manager.js';
import { CONTENT_TYPES, type ContentType } from '../schemas/content-types/index.js';
import {
  isThinkingLevel, isCreativityLevel, THINKING_LEVELS, CREATIVITY_LEVELS,
  type ThinkingLevel, type CreativityLevel,
} from './user-module-defaults.js';
import { listServerPersonaIds } from './prompt-builder.js';
import { OUTPUT_FORMATS } from '../../src/lib/output-format-definitions.js';
import { EXPERT_ROLES } from '../../src/lib/expert-roles.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AREAS_DIR = path.join(__dirname, '..', 'areas');

// ── In-memory cache ──────────────────────────────────────────

let _areas: LoadedArea[] | null = null;
let _moduleIndex: Map<string, ModuleConfig> | null = null; // moduleId → module

// Modules already warned about for a `recommendedSkills` id no skill has. The
// dev watcher reloads every module on each edit; one warning per module is enough.
const _warnedRecommendedSkills = new Set<string>();

/**
 * Check a module's `recommendedSkills` against the skill library and warn ONCE
 * per module for ids no skill has — the class of bug the client-side
 * MODULE_DEFAULT_SKILLS map carried for months (eight ids that never existed,
 * attached on "Apply" and printed by the trail as injected).
 * Skipped until the disk packs are preloaded, so a module loaded during boot
 * is not reported for a pack that is about to appear.
 * Returns the unknown ids (empty when all resolve or the check was skipped).
 */
export function validateRecommendedSkills(moduleId: string, recommendedSkills: unknown): string[] {
  if (!Array.isArray(recommendedSkills) || !isDiskSkillsPreloaded()) return [];
  const unknown: string[] = [];
  for (const id of recommendedSkills) {
    if (typeof id !== 'string' || !getSkillById(id)) unknown.push(String(id));
  }
  if (unknown.length > 0 && !_warnedRecommendedSkills.has(moduleId)) {
    _warnedRecommendedSkills.add(moduleId);
    console.warn(`[module-loader] module '${moduleId}' recommends skill(s) that do not exist: ${unknown.join(', ')}`);
  }
  return unknown;
}

// ── module.json validation ───────────────────────────────────
//
// module.json is read with fs.readJson and CAST to ModuleConfig, so TypeScript
// never sees what is actually on disk. Until Wave 0 the loader checked exactly
// one field (recommendedSkills), and three classes of defect shipped to
// production undetected:
//
//   • 30 guidedInputs[].type values the renderer has no branch for (27 x
//     'multiselect' instead of 'multi-select', 3 x 'toggle' instead of
//     'boolean'). The label drew, the control did not.
//   • 2 contentType values ('decision_memo', 'appetite_statement') that
//     safeContentType() silently downgraded to 'analytic_report'.
//   • recommendedPersonas ids the prompt composer cannot resolve, so the
//     module auto-selected a persona that injected nothing.
//
// validateModuleConfig() checks every field the loader trusts, against the
// ONE authority for each: FieldType (this repo's own type, via an exhaustive
// Record so adding a type forces a decision here), CONTENT_TYPES from the
// content-type schema registry, OUTPUT_FORMATS from the format registry,
// THINKING_LEVELS / CREATIVITY_LEVELS from user-module-defaults, and both
// persona registries the composer actually reads. Nothing is re-listed by hand.
//
// It never throws and never drops a module: a bad field is a warning, not an
// unloadable module.

/** What can be wrong with a module.json. */
export type ModuleConfigProblemKind =
  | 'config-malformed'          // the parsed module.json is not an object at all
  | 'guided-inputs-malformed'   // guidedInputs is not an array / an entry is not an object
  | 'field-id-missing'          // a guided input without a usable id
  | 'field-id-duplicate'        // two guided inputs share an id (the later one wins in the form)
  | 'field-type-unknown'        // a type FieldType does not declare — e.g. 'multiselect'
  | 'field-type-unrenderable'   // a type FieldType declares but the UI cannot draw — 'file'
  | 'field-options-missing'     // select / multi-select / chips with nothing to choose from
  | 'defaults-malformed'        // defaults missing or not an object
  | 'output-formats-malformed'  // defaults.outputFormats is not an array
  | 'output-format-unknown'     // an id no OUTPUT_FORMATS entry has
  | 'thinking-invalid'
  | 'creativity-invalid'
  | 'content-type-invalid'      // not one of the eight — safeContentType() would downgrade it
  | 'personas-malformed'
  | 'persona-unknown';          // an id getExpertRoleInstruction() resolves to nothing

export interface ModuleConfigProblem {
  kind: ModuleConfigProblemKind;
  /** Human-readable, already names the offending field/value. */
  detail: string;
}

/**
 * Every FieldType, and whether `src/components/modules/DynamicModule.tsx`
 * actually draws a control for it.
 *
 * This is a Record over FieldType on purpose: adding a member to FieldType
 * without answering "can the UI draw it?" is a compile error here. 'file' is
 * the current odd one out — declared by the type since the beginning, never
 * given a render branch, so a module that asks for it gets a label and no
 * control. That is a different bug from a typo'd type name, so the two are
 * reported under different kinds.
 */
const FIELD_TYPE_RENDERABLE: Record<FieldType, boolean> = {
  text: true,
  textarea: true,
  select: true,
  'multi-select': true,
  chips: true,
  boolean: true,
  number: true,
  file: false,   // no branch in DynamicModule.tsx
};

/** Types whose only way to answer is picking from `options`. */
const OPTION_DRIVEN_TYPES: ReadonlySet<string> = new Set(['select', 'multi-select', 'chips']);

/**
 * The eight content types ModuleConfig declares must be exactly the eight the
 * schema registry serves — otherwise this validator would accept a value
 * safeContentType() downgrades, or reject one it keeps. Type-level only.
 */
type _AssertContentTypeParity =
  [NonNullable<ModuleConfig['contentType']>] extends [ContentType]
    ? ([ContentType] extends [NonNullable<ModuleConfig['contentType']>] ? true : never)
    : never;
const _contentTypeParityHolds: _AssertContentTypeParity = true;
void _contentTypeParityHolds;

/**
 * Same for the run vocabularies: ModuleDefaults.thinking / .creativity must be
 * exactly the unions this validator checks against. They were NOT — the
 * thinking union omitted 'deep_investigate' while every other list in the
 * codebase carried it, and nothing noticed because module.json is cast, never
 * checked. Narrowing either union again is now a compile error here.
 */
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
const _thinkingParityHolds: Exact<ModuleConfig['defaults']['thinking'], ThinkingLevel> = true;
const _creativityParityHolds: Exact<ModuleConfig['defaults']['creativity'], CreativityLevel> = true;
void _thinkingParityHolds;
void _creativityParityHolds;

// Lazily built so importing this module costs nothing; the registries are
// static, so one build per process is enough.
let _knownOutputFormatIds: ReadonlySet<string> | null = null;
let _knownPersonaIds: ReadonlySet<string> | null = null;

function knownOutputFormatIds(): ReadonlySet<string> {
  if (!_knownOutputFormatIds) _knownOutputFormatIds = new Set(OUTPUT_FORMATS.map((f) => f.id));
  return _knownOutputFormatIds;
}

/**
 * The persona ids a run can actually resolve. resolvePersonaInstruction()
 * (prompt-builder.ts) answers from the server map first, then the client
 * picker registry, then personas installed from a bundle. Installed personas
 * live in the database and are not knowable here, so only the two static
 * registries are checked — the union, not either one alone, because a module
 * may legitimately name an id only one of them carries.
 *
 * NOTE: server/personas/<id>/persona.json (personas-manager.ts) is a THIRD
 * registry, but nothing in the run path reads it — buildPersonaInjection() has
 * no callers, and the composer goes through getExpertRoleInstruction(). An id
 * that exists only there still injects nothing, so it is reported.
 */
function knownPersonaIds(): ReadonlySet<string> {
  if (!_knownPersonaIds) {
    _knownPersonaIds = new Set<string>([
      ...listServerPersonaIds(),
      ...EXPERT_ROLES.map((r) => r.id),
    ]);
  }
  return _knownPersonaIds;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Short, log-safe rendering of a value that was supposed to be a string. */
function describe(value: unknown): string {
  if (typeof value === 'string') return `'${value}'`;
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (Array.isArray(value)) return `array(${value.length})`;
  return typeof value;
}

/** Modules already warned about, so the dev watcher's reload does not re-spam. */
const _warnedModuleConfig = new Set<string>();
/** Cap on how many modules print their problems in one process. */
const MODULE_CONFIG_WARN_LIMIT = 20;
let _moduleConfigWarnCount = 0;
let _moduleConfigWarnSuppressedNoticeShown = false;
/** Modules found invalid since the last loadAll() — reported in its summary. */
let _moduleConfigProblemCount = 0;

/**
 * Validate one module.json against every registry the loader trusts and warn
 * ONCE per module. Returns the problems found (empty when the config is clean),
 * so callers and tests can inspect them without reading the console.
 *
 * Never throws. A config that is not an object at all yields one problem
 * rather than an exception.
 */
export function validateModuleConfig(config: ModuleConfig): ModuleConfigProblem[] {
  const problems: ModuleConfigProblem[] = [];
  const raw = asRecord(config);
  if (!raw) {
    problems.push({ kind: 'config-malformed', detail: `module.json is ${describe(config)}, not an object` });
    warnModuleConfigProblems('(unparseable module.json)', problems);
    return problems;
  }

  const moduleId = typeof raw.id === 'string' && raw.id.trim() ? raw.id : '(module with no id)';

  // ── 1-3. Guided inputs ──────────────────────────────────────
  if (raw.guidedInputs !== undefined) {
    if (!Array.isArray(raw.guidedInputs)) {
      problems.push({ kind: 'guided-inputs-malformed', detail: `guidedInputs is ${describe(raw.guidedInputs)}, not an array` });
    } else {
      const seenIds = new Set<string>();
      raw.guidedInputs.forEach((entry: unknown, i: number) => {
        const field = asRecord(entry);
        if (!field) {
          problems.push({ kind: 'guided-inputs-malformed', detail: `guidedInputs[${i}] is ${describe(entry)}, not an object` });
          return;
        }
        const fieldId = typeof field.id === 'string' ? field.id.trim() : '';
        const where = fieldId || `guidedInputs[${i}]`;

        if (!fieldId) {
          problems.push({ kind: 'field-id-missing', detail: `guidedInputs[${i}] has no id (${describe(field.id)})` });
        } else if (seenIds.has(fieldId)) {
          problems.push({ kind: 'field-id-duplicate', detail: `guided input id '${fieldId}' appears more than once — the later field wins and the earlier one can never be answered` });
        } else {
          seenIds.add(fieldId);
        }

        const type = field.type;
        // Own-property lookup only: a plain index would answer 'constructor'
        // (and friends) from Object.prototype and wave the field through.
        const renderable = typeof type === 'string' && Object.prototype.hasOwnProperty.call(FIELD_TYPE_RENDERABLE, type)
          ? (FIELD_TYPE_RENDERABLE as Record<string, boolean>)[type]
          : undefined;

        if (renderable === undefined) {
          problems.push({ kind: 'field-type-unknown', detail: `guided input '${where}' has type ${describe(type)}, which is not a FieldType — the label renders, the control does not` });
        } else if (!renderable) {
          problems.push({ kind: 'field-type-unrenderable', detail: `guided input '${where}' has type ${describe(type)}: FieldType declares it but DynamicModule.tsx has no render branch for it` });
        }

        if (typeof type === 'string' && OPTION_DRIVEN_TYPES.has(type)) {
          if (!Array.isArray(field.options) || field.options.length === 0) {
            problems.push({ kind: 'field-options-missing', detail: `guided input '${where}' is a '${type}' with ${describe(field.options)} options — there is nothing to pick` });
          }
        }
      });
    }
  }

  // ── 4-5. Defaults ───────────────────────────────────────────
  const defaults = asRecord(raw.defaults);
  if (!defaults) {
    problems.push({ kind: 'defaults-malformed', detail: `defaults is ${describe(raw.defaults)}, not an object` });
  } else {
    if (!Array.isArray(defaults.outputFormats)) {
      problems.push({ kind: 'output-formats-malformed', detail: `defaults.outputFormats is ${describe(defaults.outputFormats)}, not an array` });
    } else {
      const known = knownOutputFormatIds();
      for (const id of defaults.outputFormats as unknown[]) {
        if (typeof id !== 'string' || !known.has(id)) {
          problems.push({ kind: 'output-format-unknown', detail: `defaults.outputFormats contains ${describe(id)}, which no OUTPUT_FORMATS entry has — the run gets no format instruction` });
        }
      }
    }

    if (!isThinkingLevel(defaults.thinking)) {
      problems.push({ kind: 'thinking-invalid', detail: `defaults.thinking is ${describe(defaults.thinking)}; expected one of ${THINKING_LEVELS.join(', ')}` });
    }
    if (!isCreativityLevel(defaults.creativity)) {
      problems.push({ kind: 'creativity-invalid', detail: `defaults.creativity is ${describe(defaults.creativity)}; expected one of ${CREATIVITY_LEVELS.join(', ')}` });
    }
  }

  // ── 6. Content type ─────────────────────────────────────────
  if (raw.contentType !== undefined) {
    if (typeof raw.contentType !== 'string' || !(CONTENT_TYPES as readonly string[]).includes(raw.contentType)) {
      problems.push({ kind: 'content-type-invalid', detail: `contentType is ${describe(raw.contentType)}, which safeContentType() silently downgrades to 'analytic_report'; expected one of ${CONTENT_TYPES.join(', ')}` });
    }
  }

  // ── 7. Personas ─────────────────────────────────────────────
  if (raw.recommendedPersonas !== undefined) {
    if (!Array.isArray(raw.recommendedPersonas)) {
      problems.push({ kind: 'personas-malformed', detail: `recommendedPersonas is ${describe(raw.recommendedPersonas)}, not an array` });
    } else {
      const known = knownPersonaIds();
      for (const id of raw.recommendedPersonas as unknown[]) {
        if (typeof id !== 'string' || !known.has(id)) {
          problems.push({ kind: 'persona-unknown', detail: `recommendedPersonas contains ${describe(id)}, which no persona registry the prompt composer reads can resolve — selecting it injects nothing` });
        }
      }
    }
  }

  if (problems.length > 0) warnModuleConfigProblems(moduleId, problems);
  return problems;
}

/** One warning per module, capped so a systemic defect cannot flood a boot. */
function warnModuleConfigProblems(moduleId: string, problems: ModuleConfigProblem[]): void {
  // Counted on every pass, printed only once — so a reload's summary still
  // reports the real number even though the per-module lines are deduped.
  _moduleConfigProblemCount++;
  if (_warnedModuleConfig.has(moduleId)) return;
  _warnedModuleConfig.add(moduleId);

  if (_moduleConfigWarnCount >= MODULE_CONFIG_WARN_LIMIT) {
    if (!_moduleConfigWarnSuppressedNoticeShown) {
      _moduleConfigWarnSuppressedNoticeShown = true;
      console.warn(`[module-loader] more than ${MODULE_CONFIG_WARN_LIMIT} modules have module.json problems — further per-module warnings suppressed; the load summary carries the count`);
    }
    return;
  }
  _moduleConfigWarnCount++;
  const lines = problems.map((p) => `    - [${p.kind}] ${p.detail}`).join('\n');
  console.warn(`[module-loader] module '${moduleId}' has ${problems.length} module.json problem(s):\n${lines}`);
}

/** Test seam — forget which modules have already been warned about. */
export function resetModuleConfigWarningsForTests(): void {
  _warnedModuleConfig.clear();
  _moduleConfigWarnCount = 0;
  _moduleConfigWarnSuppressedNoticeShown = false;
  _moduleConfigProblemCount = 0;
}

// ── Dev-mode file watcher ─────────────────────────────────────
// Invalidates cache whenever any area JSON/MD file changes so
// edits to module.json / system-prompt.md are picked up on the
// next request without a server restart.

if (process.env.NODE_ENV !== 'production') {
  try {
    fsWatch(AREAS_DIR, { recursive: true }, () => {
      _areas = null;
      _moduleIndex = null;
    });
  } catch {
    // Recursive watch not supported on all platforms — silently ignore
  }
}

// ── Loader ───────────────────────────────────────────────────

async function loadModule(modulePath: string, areaId: string): Promise<ModuleConfig | null> {
  const configPath = path.join(modulePath, 'module.json');
  const promptPath = path.join(modulePath, 'system-prompt.md');

  if (!await fs.pathExists(configPath)) return null;

  try {
    const config: ModuleConfig = await fs.readJson(configPath);
    config.areaId = areaId;
    validateRecommendedSkills(config.id, config.recommendedSkills);
    validateModuleConfig(config);

    if (await fs.pathExists(promptPath)) {
      config.systemPrompt = (await fs.readFile(promptPath, 'utf-8')).trim();
    }

    return config;
  } catch (err) {
    console.error(`[module-loader] Failed to load module at ${modulePath}:`, err);
    return null;
  }
}

async function loadArea(areaPath: string): Promise<LoadedArea | null> {
  const configPath = path.join(areaPath, 'area.json');
  const contextPath = path.join(areaPath, 'area-context.md');
  const modulesDir = path.join(areaPath, 'modules');

  if (!await fs.pathExists(configPath)) return null;

  try {
    const config: AreaConfig = await fs.readJson(configPath);

    const areaContext = await fs.pathExists(contextPath)
      ? (await fs.readFile(contextPath, 'utf-8')).trim()
      : '';

    const modules: ModuleConfig[] = [];

    if (await fs.pathExists(modulesDir)) {
      const entries = await fs.readdir(modulesDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const mod = await loadModule(path.join(modulesDir, entry.name), config.id);
        if (mod) modules.push(mod);
      }
    }

    // Sort modules alphabetically by label for consistent ordering
    modules.sort((a, b) => a.label.localeCompare(b.label));

    return { ...config, modules, areaContext };
  } catch (err) {
    console.error(`[module-loader] Failed to load area at ${areaPath}:`, err);
    return null;
  }
}

async function loadAll(): Promise<void> {
  _moduleConfigProblemCount = 0;
  if (!await fs.pathExists(AREAS_DIR)) {
    console.warn(`[module-loader] Areas directory not found: ${AREAS_DIR}`);
    _areas = [];
    _moduleIndex = new Map();
    return;
  }

  const entries = await fs.readdir(AREAS_DIR, { withFileTypes: true });
  const areas: LoadedArea[] = [];
  const index = new Map<string, ModuleConfig>();

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const area = await loadArea(path.join(AREAS_DIR, entry.name));
    if (!area) continue;
    areas.push(area);
    for (const mod of area.modules) {
      index.set(mod.id, mod);
    }
  }

  _areas = areas;
  _moduleIndex = index;

  const totalModules = areas.reduce((n, a) => n + a.modules.length, 0);
  // Counted every pass, so this stays accurate even when the per-module
  // warnings above were deduped away by a dev-watcher reload.
  const invalid = _moduleConfigProblemCount > 0
    ? `, ${_moduleConfigProblemCount} with module.json problem(s)`
    : '';
  console.log(`[module-loader] Loaded ${areas.length} area(s), ${totalModules} module(s)${invalid}`);
}

// ── Public API ────────────────────────────────────────────────

export async function getAreas(): Promise<LoadedArea[]> {
  if (!_areas) await loadAll();
  return _areas!;
}

export async function getArea(areaId: string): Promise<LoadedArea | undefined> {
  const areas = await getAreas();
  return areas.find((a) => a.id === areaId);
}

export async function getModule(moduleId: string): Promise<ModuleConfig | undefined> {
  if (!_moduleIndex) await loadAll();
  return _moduleIndex!.get(moduleId);
}

export async function getAllModules(): Promise<ModuleConfig[]> {
  const areas = await getAreas();
  return areas.flatMap((a) => a.modules);
}

/**
 * Get the system prompt for a module (from the loaded cache).
 * Falls back to the old server/prompts/ directory for backward compatibility.
 */
export async function getModuleSystemPrompt(moduleId: string): Promise<string | null> {
  const mod = await getModule(moduleId);
  if (mod?.systemPrompt) return mod.systemPrompt;

  // Backward compatibility: old flat prompts directory
  const legacyPath = path.join(__dirname, '..', 'prompts', `${moduleId}.md`);
  if (await fs.pathExists(legacyPath)) {
    return (await fs.readFile(legacyPath, 'utf-8')).trim();
  }

  return null;
}

/**
 * Get the area context prompt for a given area ID.
 * Returns empty string if not found.
 */
export async function getAreaContext(areaId: string): Promise<string> {
  const area = await getArea(areaId);
  return area?.areaContext ?? '';
}

/**
/**
 * Invalidate the cache so the next call reloads from disk.
 * Useful for development hot-reload.
 */
export function invalidateCache(): void {
  _areas = null;
  _moduleIndex = null;
}
