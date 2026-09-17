/**
 * anton-module-config.ts — the shape of a module bundle's default-config.json
 * and guided-inputs.json, and the pure helpers both the bundler (export) and
 * the importer (import) use so a module arrives whole (Wave 6, track G).
 *
 * Two dialects reach the importer:
 *   • CUSTOM modules store the run defaults at the TOP LEVEL of
 *     custom_modules.config (thinking, creativity, outputFormats, personas,
 *     skills, model, writingTone, transparencyLevel, knowledgeSources, …) —
 *     the shape ModulePage reads back.
 *   • BUILT-IN module.json files nest the run defaults under `defaults.{…}`
 *     and name the persona/skill lists `recommendedPersonas` /
 *     `recommendedSkills`. Before this file, an exported built-in re-imported
 *     as a custom module kept only its prompt and guided inputs because the
 *     importer stored `defaults` verbatim and the loader reads top-level keys.
 *
 * `flattenModuleConfig` normalises both onto the top-level shape. The zod
 * schemas are deliberately LOOSE: every known key is typed, every unknown
 * key is kept, so a newer ANTON's extra fields travel through an older one.
 *
 * No DB, no I/O — unit-testable without Postgres.
 */

import crypto from 'crypto';
import { z } from 'zod';

// ── Vocabulary (mirrors src/lib/types.ts — the client is the source) ────────

export const THINKING_LEVELS = ['quick', 'think', 'think_hard', 'investigate', 'plan_first', 'deep_investigate'] as const;
export const CREATIVITY_LEVELS = ['strict', 'balanced', 'creative'] as const;
export const WRITING_TONES = ['formal', 'professional', 'casual', 'conversational'] as const;

/**
 * The fields the import APPLIES to the installed module — the round-trip
 * contract. Every one of these must survive export → import unchanged;
 * tests/services/anton-module-roundtrip.test.ts pins each.
 */
export const APPLIED_CONFIG_KEYS = [
  'model',
  'thinking',
  'creativity',
  'outputFormats',
  'personas',
  'skills',
  'guidedInputs',
  'referenceOutput',
  'defaultKnowledgeLibraryIds',
  'transparencyLevel',
  'knowledgeSources',
  'writingTone',
] as const;
export type AppliedConfigKey = typeof APPLIED_CONFIG_KEYS[number];

// ── Schemas ─────────────────────────────────────────────────────────────────

/** One guided-input field. `id` is the only hard requirement; the rest is typed when present. */
export const GuidedInputSchema = z.object({
  id: z.string().min(1),
  type: z.string().optional(),
  label: z.string().optional(),
  description: z.string().optional(),
  placeholder: z.string().optional(),
  required: z.boolean().optional(),
  options: z.array(z.unknown()).optional(),
}).loose();

export const GuidedInputsSchema = z.array(GuidedInputSchema);
export type GuidedInputDef = z.infer<typeof GuidedInputSchema>;

/**
 * knowledgeSources travels in TWO shapes: the client's KnowledgeSourceConfig
 * (`{ modes: { claudeKnowledge, onlineReference, localFolder } }`) and the
 * built-in module.json flat map (`{ claudeKnowledge, localFolder }`). Both are
 * plain objects; the consumer (ModulePage) normalises. Typed here as an
 * object so an array or a string is refused.
 */
const KnowledgeSourcesSchema = z.record(z.string(), z.unknown());

export const ModuleDefaultConfigSchema = z.object({
  model: z.string().optional(),
  thinking: z.enum(THINKING_LEVELS).optional(),
  creativity: z.enum(CREATIVITY_LEVELS).optional(),
  outputFormats: z.array(z.string()).optional(),
  personas: z.array(z.string()).optional(),
  skills: z.array(z.string()).optional(),
  guidedInputs: GuidedInputsSchema.optional(),
  referenceOutput: z.string().optional(),
  defaultKnowledgeLibraryIds: z.array(z.string()).optional(),
  transparencyLevel: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional(),
  knowledgeSources: KnowledgeSourcesSchema.optional(),
  writingTone: z.enum(WRITING_TONES).optional(),
  // Metadata the importer merges from the manifest when absent
  author: z.string().optional(),
  version: z.string().optional(),
  tags: z.array(z.string()).optional(),
  color: z.string().optional(),
  // Built-in module.json fields that ride along untouched
  label: z.string().optional(),
  description: z.string().optional(),
  recommendedPersonas: z.array(z.string()).optional(),
  recommendedSkills: z.array(z.string()).optional(),
}).loose();

export type ModuleDefaultConfig = z.infer<typeof ModuleDefaultConfigSchema>;

// ── Flatten ─────────────────────────────────────────────────────────────────

/**
 * Lift a built-in style `defaults.{…}` block onto the top level and map the
 * `recommended*` lists onto the keys the custom-module loader reads.
 * An explicit top-level value always wins over a nested one; `defaults` is
 * removed once lifted. Custom-module configs (already flat) pass through.
 */
export function flattenModuleConfig(raw: Record<string, unknown>): Record<string, unknown> {
  const { defaults, ...rest } = raw;
  const out: Record<string, unknown> = { ...rest };

  if (defaults && typeof defaults === 'object' && !Array.isArray(defaults)) {
    for (const [key, value] of Object.entries(defaults as Record<string, unknown>)) {
      if (value === undefined || value === null) continue;
      if (out[key] === undefined || out[key] === null) out[key] = value;
    }
  } else if (defaults !== undefined) {
    out.defaults = defaults; // not an object — keep it, the schema will refuse it if typed
  }

  if (out.personas === undefined && Array.isArray(out.recommendedPersonas)) {
    out.personas = out.recommendedPersonas;
  }
  if (out.skills === undefined && Array.isArray(out.recommendedSkills)) {
    out.skills = out.recommendedSkills;
  }
  return out;
}

/**
 * Local bookkeeping the importer writes into custom_modules.config
 * (`bundleProvenance`) describes THIS instance's import — it never travels
 * in a re-export, whose manifest carries its own checksum and signature.
 */
export const LOCAL_BOOKKEEPING_KEYS = ['bundleProvenance'] as const;

export function stripLocalBookkeeping(config: Record<string, unknown>): Record<string, unknown> {
  const out = { ...config };
  for (const key of LOCAL_BOOKKEEPING_KEYS) delete out[key];
  return out;
}

// ── Validation ──────────────────────────────────────────────────────────────

export type ConfigValidation<T> =
  | { ok: true; value: T }
  | { ok: false; issues: string[] };

function formatIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.map(String).join('.') : '(root)';
    return `${path}: ${issue.message}`;
  });
}

/** Validate an already-flattened default config. Unknown keys are kept. */
export function validateModuleConfig(raw: unknown): ConfigValidation<ModuleDefaultConfig> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, issues: ['(root): default-config.json must be a JSON object'] };
  }
  const parsed = ModuleDefaultConfigSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, issues: formatIssues(parsed.error) };
  return { ok: true, value: parsed.data };
}

/** Validate guided-inputs.json. Unknown keys on each field are kept. */
export function validateGuidedInputs(raw: unknown): ConfigValidation<GuidedInputDef[]> {
  if (!Array.isArray(raw)) {
    return { ok: false, issues: ['(root): guided-inputs.json must be a JSON array'] };
  }
  const parsed = GuidedInputsSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, issues: formatIssues(parsed.error) };
  return { ok: true, value: parsed.data };
}

// ── Embedded skill / persona files ──────────────────────────────────────────
//
// A module bundle carries the TEXT of every skill and persona it references
// as `skills/<id>.md` and `personas/<id>.md`: a header block of
// `key: <JSON string>` lines between `---` fences, then the prompt text.
// JSON-encoded header values make the parse unambiguous whatever a
// description contains. The manifest lists each file with its sha256, so a
// signed manifest attests the embedded text transitively.

/**
 * Only characters that are safe inside a zip entry name on every OS (no ':' —
 * a namespaced id `bundle:<module>:<skill>` becomes `bundle_<module>_<skill>`;
 * the real id travels in the manifest and the file header). `taken` holds the
 * names already used in this bundle so two ids that fold to the same stem get
 * distinct files.
 */
export function embeddedFileName(kind: 'skills' | 'personas', id: string, taken?: Set<string>): string {
  const stem = id.replace(/[^a-zA-Z0-9_.-]/g, '_').replace(/^\.+|\.+$/g, '').slice(0, 120) || 'unnamed';
  let name = `${kind}/${stem}.md`;
  for (let n = 2; taken?.has(name); n++) name = `${kind}/${stem}-${n}.md`;
  taken?.add(name);
  return name;
}

export function renderEmbeddedMarkdown(header: Record<string, string | undefined>, prompt: string): string {
  const lines: string[] = ['---'];
  for (const [key, value] of Object.entries(header)) {
    if (typeof value !== 'string') continue;
    lines.push(`${key}: ${JSON.stringify(value)}`);
  }
  lines.push('---', '');
  return `${lines.join('\n')}${prompt}`;
}

export function parseEmbeddedMarkdown(text: string): { header: Record<string, string>; prompt: string } {
  const header: Record<string, string> = {};
  if (!text.startsWith('---\n')) return { header, prompt: text };
  const close = text.indexOf('\n---\n', 4);
  if (close < 0) return { header, prompt: text };
  for (const line of text.slice(4, close).split('\n')) {
    const m = /^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/.exec(line);
    if (!m) continue;
    try {
      const value: unknown = JSON.parse(m[2]);
      header[m[1]] = typeof value === 'string' ? value : m[2];
    } catch {
      header[m[1]] = m[2];
    }
  }
  // Skip the closing fence and the single blank line the renderer writes.
  let body = text.slice(close + 5);
  if (body.startsWith('\n')) body = body.slice(1);
  return { header, prompt: body };
}

/** Whitespace-insensitive text identity, for "same skill or a different one?". */
export function normaliseForCompare(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').replace(/\s+$/gm, '').trim();
}

// ── Hashes ──────────────────────────────────────────────────────────────────

export function sha256Hex(data: string | Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * The module bundle's `security.checksum` recipe: sha256 over the
 * concatenated bytes of system-prompt.md, guided-inputs.json and
 * default-config.json, in that order. anton-validator recomputes exactly
 * this on import — the recipe is pinned; extend the manifest, not the hash.
 */
export function computeModuleChecksum(
  systemPrompt: string | Buffer,
  guidedInputsJson: string | Buffer,
  defaultConfigJson: string | Buffer,
): string {
  const hash = crypto.createHash('sha256');
  hash.update(systemPrompt);
  hash.update(guidedInputsJson);
  hash.update(defaultConfigJson);
  return hash.digest('hex');
}

/** The serialisation the bundler writes for the two JSON payload files. */
export function serialiseBundleJson(value: unknown): string {
  return JSON.stringify(value ?? null, null, 2);
}
