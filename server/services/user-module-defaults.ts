/**
 * user-module-defaults.ts — the profile drives the defaults (Wave 6 track H,
 * 2026-09-17).
 *
 * Two things a module page needs when it opens:
 *
 *   1. What this person ran the module with last time — output formats,
 *      thinking level, creativity and the guided-form values — so the second
 *      run starts where the first one ended instead of at the catalogue
 *      defaults. `recordModuleUse` upserts one row per (user, module) in
 *      `user_module_defaults` (migration 277); `getModuleDefaults` reads it.
 *
 *   2. What the profile already knows — jurisdiction, working language,
 *      organisation — so the guided form's "Jurisdiction" / "Language" /
 *      "Organisation name" fields start filled instead of asking again on
 *      every run. `suggestGuidedPrefill` is a pure function over the profile
 *      row, the org-context row and the module's guided fields.
 *
 * The stored guided inputs are hygiene-checked: values are capped, and any
 * field whose id or label looks like a credential or a personal identifier is
 * dropped before it reaches the table.
 */
import type { DatabaseAdapter } from '../db/database.js';

// ── Levels the table accepts ────────────────────────────────────────────────

export const THINKING_LEVELS = ['quick', 'think', 'think_hard', 'investigate', 'plan_first', 'deep_investigate'] as const;
export const CREATIVITY_LEVELS = ['strict', 'balanced', 'creative'] as const;

export type ThinkingLevel = typeof THINKING_LEVELS[number];
export type CreativityLevel = typeof CREATIVITY_LEVELS[number];

export function isThinkingLevel(value: unknown): value is ThinkingLevel {
  return typeof value === 'string' && (THINKING_LEVELS as readonly string[]).includes(value);
}

export function isCreativityLevel(value: unknown): value is CreativityLevel {
  return typeof value === 'string' && (CREATIVITY_LEVELS as readonly string[]).includes(value);
}

// ── Guided-input hygiene ────────────────────────────────────────────────────

/** A guided field whose id or label matches this is never stored. */
export const SENSITIVE_FIELD_RE = /password|secret|token|iban|ssn|personnummer/i;
/** Each stored string value is cut here. */
export const GUIDED_VALUE_MAX_CHARS = 200;
const GUIDED_MAX_FIELDS = 60;
const GUIDED_MAX_LIST_ITEMS = 25;
const FORMAT_ID_RE = /^[a-z0-9][a-z0-9_-]{0,79}$/i;
const MAX_FORMATS = 20;

/** The value shapes a guided field can hold (see DynamicModule). */
export type GuidedValue = string | number | boolean | string[];

/** The part of a module's guided field the hygiene check needs. */
export interface GuidedFieldRef {
  id: string;
  label?: string;
  type?: string;
  options?: Array<{ value: string; label: string }>;
}

function cap(value: string): string {
  return value.length > GUIDED_VALUE_MAX_CHARS ? value.slice(0, GUIDED_VALUE_MAX_CHARS) : value;
}

/**
 * Keep only the guided values worth remembering: strings (capped), numbers,
 * booleans and short string lists; drop anything under a sensitive id/label.
 * `fields` supplies labels — the ids alone are checked when it is absent.
 */
export function sanitiseGuidedInputs(input: unknown, fields?: ReadonlyArray<GuidedFieldRef>): Record<string, GuidedValue> {
  const out: Record<string, GuidedValue> = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return out;
  const labelById = new Map<string, string>();
  for (const f of fields ?? []) if (f.label) labelById.set(f.id, f.label);

  let kept = 0;
  for (const [id, raw] of Object.entries(input as Record<string, unknown>)) {
    if (kept >= GUIDED_MAX_FIELDS) break;
    if (!id || id.length > 120) continue;
    if (SENSITIVE_FIELD_RE.test(id) || SENSITIVE_FIELD_RE.test(labelById.get(id) ?? '')) continue;

    let value: GuidedValue | undefined;
    if (typeof raw === 'string') value = cap(raw);
    else if (typeof raw === 'number' && Number.isFinite(raw)) value = raw;
    else if (typeof raw === 'boolean') value = raw;
    else if (Array.isArray(raw)) {
      value = raw.filter((v): v is string => typeof v === 'string').slice(0, GUIDED_MAX_LIST_ITEMS).map(cap);
    }
    if (value === undefined) continue;
    out[id] = value;
    kept++;
  }
  return out;
}

function normaliseFormats(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  for (const f of input) {
    if (typeof f !== 'string' || !FORMAT_ID_RE.test(f)) continue;
    seen.add(f);
    if (seen.size >= MAX_FORMATS) break;
  }
  return [...seen];
}

// ── Last-used defaults ──────────────────────────────────────────────────────

export interface RecordModuleUseInput {
  userId: string;
  moduleId: string;
  outputFormats: unknown;
  thinking: unknown;
  creativity: unknown;
  guidedInputs: unknown;
  /** The module's guided fields, so labels join ids in the sensitive check. */
  guidedFields?: ReadonlyArray<GuidedFieldRef>;
}

export interface ModuleDefaults {
  outputFormats: string[];
  thinking: ThinkingLevel | null;
  creativity: CreativityLevel | null;
  guidedInputs: Record<string, GuidedValue>;
  usedCount: number;
}

/**
 * Upsert what this person just ran the module with. The counter climbs on
 * every call; an unrecognised thinking / creativity value keeps the last
 * known one rather than blanking it.
 */
export async function recordModuleUse(db: DatabaseAdapter, input: RecordModuleUseInput): Promise<void> {
  const outputFormats = normaliseFormats(input.outputFormats);
  const thinking = isThinkingLevel(input.thinking) ? input.thinking : null;
  const creativity = isCreativityLevel(input.creativity) ? input.creativity : null;
  const guided = sanitiseGuidedInputs(input.guidedInputs, input.guidedFields);

  await db.run(
    `INSERT INTO user_module_defaults
       (user_id, module_id, output_formats, thinking, creativity, guided_inputs, used_count, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, NOW())
     ON CONFLICT (user_id, module_id) DO UPDATE SET
       output_formats = EXCLUDED.output_formats,
       thinking       = COALESCE(EXCLUDED.thinking, user_module_defaults.thinking),
       creativity     = COALESCE(EXCLUDED.creativity, user_module_defaults.creativity),
       guided_inputs  = EXCLUDED.guided_inputs,
       used_count     = user_module_defaults.used_count + 1,
       updated_at     = NOW()`,
    input.userId,
    input.moduleId,
    JSON.stringify(outputFormats),
    thinking,
    creativity,
    JSON.stringify(guided),
  );
}

interface DefaultsRow {
  output_formats: string | null;
  thinking: string | null;
  creativity: string | null;
  guided_inputs: string | null;
  used_count: number | string | null;
}

function parseJson(text: string | null): unknown {
  if (!text) return undefined;
  try { return JSON.parse(text); } catch { return undefined; }
}

/** The row for (user, module), parsed and re-validated; null when there is none. */
export async function getModuleDefaults(db: DatabaseAdapter, userId: string, moduleId: string): Promise<ModuleDefaults | null> {
  const row = await db.get<DefaultsRow>(
    `SELECT output_formats, thinking, creativity, guided_inputs, used_count
       FROM user_module_defaults
      WHERE user_id = ? AND module_id = ?`,
    userId,
    moduleId,
  );
  if (!row) return null;
  return {
    outputFormats: normaliseFormats(parseJson(row.output_formats)),
    thinking: isThinkingLevel(row.thinking) ? row.thinking : null,
    creativity: isCreativityLevel(row.creativity) ? row.creativity : null,
    guidedInputs: sanitiseGuidedInputs(parseJson(row.guided_inputs)),
    usedCount: Number(row.used_count) || 0,
  };
}

// ── Profile-driven prefill ──────────────────────────────────────────────────

/** The user_profiles columns the prefill reads. */
export interface PrefillProfile {
  jurisdiction?: string | null;
  output_language?: string | null;
  organisation?: string | null;
  company?: string | null;
}

/** The org_context columns the prefill reads (the fallback behind the profile). */
export interface PrefillOrgContext {
  jurisdiction?: string | null;
  org_name?: string | null;
  preferred_language?: string | null;
}

export type PrefillValue = string | string[];

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English', sv: 'Swedish', fi: 'Finnish', da: 'Danish', no: 'Norwegian', nb: 'Norwegian',
  de: 'German', fr: 'French', es: 'Spanish', pl: 'Polish', it: 'Italian', pt: 'Portuguese',
  nl: 'Dutch', cs: 'Czech', ro: 'Romanian', zh: 'Chinese', ja: 'Japanese', ko: 'Korean',
  th: 'Thai', vi: 'Vietnamese', id: 'Indonesian', ms: 'Malay', tl: 'Tagalog', ar: 'Arabic',
  he: 'Hebrew', tr: 'Turkish', fa: 'Persian', 'pt-BR': 'Brazilian Portuguese',
  'es-MX': 'Mexican Spanish', 'fr-CA': 'Canadian French', 'en-US': 'American English',
};

type PrefillKind = 'jurisdiction' | 'language' | 'organisation';

/** A field about somebody else's jurisdiction / language / organisation is never prefilled. */
const EXCLUDE_RE = /target|respondent|counterpart|sending|receiving|screening|source|destination|client|customer|third[_ -]?party|beneficiar|issuer|vendor|supplier/i;

/** Which profile fact, if any, a guided field asks for — decided from its id and label. */
export function classifyPrefillField(field: { id: string; label?: string }): PrefillKind | null {
  const id = field.id.trim().toLowerCase();
  const label = (field.label ?? '').trim().toLowerCase();
  if (EXCLUDE_RE.test(id) || EXCLUDE_RE.test(label)) return null;

  if (
    /^(primary_|home_|operating_)?jurisdictions?$/.test(id)
    || id === 'country'
    || /^(primary |home |operating )?jurisdictions?(\s*\(s\))?$/.test(label)
    || label === 'country'
  ) return 'jurisdiction';

  if (
    /^(output_|working_|preferred_)?language$/.test(id)
    || /^(output |working |preferred )?language$/.test(label)
  ) return 'language';

  if (
    /^(organisation|organization|company)(_name)?$/.test(id)
    || /^(entity|firm|institution|client_organisation)_name$/.test(id)
    || /^(organisation|organization|company)( name)?$/.test(label)
    || /^(entity|firm|institution) name$/.test(label)
  ) return 'organisation';

  return null;
}

function firstNonEmpty(...values: Array<string | null | undefined>): string {
  for (const v of values) {
    const t = (v ?? '').trim();
    if (t) return t;
  }
  return '';
}

function normaliseText(value: string): string {
  return value.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** The option a candidate names — by value, by label, or as whole words inside the label. */
function matchOption(options: ReadonlyArray<{ value: string; label: string }>, candidates: string[]): string | null {
  const wanted = candidates.map(normaliseText).filter(Boolean);
  for (const cand of wanted) {
    for (const opt of options) {
      if (normaliseText(opt.value) === cand || normaliseText(opt.label) === cand) return opt.value;
    }
  }
  for (const cand of wanted) {
    for (const opt of options) {
      if (` ${normaliseText(opt.label)} `.includes(` ${cand} `)) return opt.value;
    }
  }
  return null;
}

/**
 * Values the module's guided form should start with, keyed by field id.
 * Profile beats org context for every fact. A select / chips field is only
 * filled when one of its options actually names the value; a free-text field
 * gets the value itself. Fields of any other type are left alone.
 */
export function suggestGuidedPrefill(
  profile: PrefillProfile | null | undefined,
  orgContext: PrefillOrgContext | null | undefined,
  fields: ReadonlyArray<GuidedFieldRef>,
): Record<string, PrefillValue> {
  const jurisdiction = firstNonEmpty(profile?.jurisdiction, orgContext?.jurisdiction);
  const langCode = firstNonEmpty(profile?.output_language, orgContext?.preferred_language);
  const langName = langCode ? (LANGUAGE_NAMES[langCode] ?? langCode) : '';
  const organisation = firstNonEmpty(profile?.organisation, profile?.company, orgContext?.org_name);

  const candidatesFor: Record<PrefillKind, string[]> = {
    jurisdiction: jurisdiction ? [jurisdiction] : [],
    language: langCode ? [langName, langCode] : [],
    organisation: organisation ? [organisation] : [],
  };

  const out: Record<string, PrefillValue> = {};
  for (const field of fields) {
    const kind = classifyPrefillField(field);
    if (!kind) continue;
    const candidates = candidatesFor[kind];
    if (candidates.length === 0) continue;

    const type = field.type ?? 'text';
    if (type === 'text' || type === 'textarea') {
      out[field.id] = candidates[0];
    } else if (type === 'select' || type === 'multi-select' || type === 'chips') {
      const value = matchOption(field.options ?? [], candidates);
      if (value === null) continue;
      out[field.id] = type === 'select' ? value : [value];
    }
  }
  return out;
}
