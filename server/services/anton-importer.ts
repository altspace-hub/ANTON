/**
 * anton-importer.ts
 *
 * .anton File Import System (module bundles)
 *
 * Purpose: Import validated module .anton files into the local database.
 * Security: Uses the dispatching validator, no code execution.
 *
 * Wave 6 (track G — a shared module arrives whole):
 *   • FIDELITY — `defaults.{…}` is flattened onto the top level; model,
 *     transparencyLevel, knowledgeSources and writingTone are applied along
 *     with the fields that already were; default-config.json and
 *     guided-inputs.json are validated with zod (known keys typed, unknown
 *     keys kept).
 *   • EMBEDDED SKILLS / PERSONAS — the texts travelling as skills/<id>.md and
 *     personas/<id>.md are verified against the manifest's sha256, then
 *     installed: an id whose local text is identical is reused; an id that
 *     exists here with DIFFERENT text is installed under
 *     `bundle:<moduleId>:<id>` so nothing local is clobbered; an unknown id is
 *     installed as-is. The module's config then references the installed
 *     ids. A referenced id with no embedded text and no local copy is a
 *     listed warning, not silence.
 *   • INJECTION GATE — findings BLOCK the import (the route answers 409)
 *     unless `acceptInjectionFindings` is set; accepted findings are recorded
 *     in the result and in the module's stored bundleProvenance.
 *   • FINGERPRINT — the bundle's checksum, per-file hashes and signer are
 *     stored with the module (custom_modules.config.bundleProvenance) so the
 *     UI can show "Module fingerprint: … · signed by …".
 *
 * Non-module bundle types pass STRUCTURAL validation but are not installable
 * here — they belong to their own import surfaces (knowledge packs, portals,
 * school, markets, …); the importer returns a friendly redirect error.
 */

import AdmZip from 'adm-zip';
import crypto from 'crypto';
import {
  validateAntonFile,
  type ValidationResult,
  type ValidationError,
  type ValidationWarning,
} from './anton-validator.js';
import type { DatabaseAdapter } from '../db/database.js';
import {
  flattenModuleConfig,
  validateModuleConfig,
  validateGuidedInputs,
  parseEmbeddedMarkdown,
  normaliseForCompare,
  sha256Hex,
  WRITING_TONES,
  type ModuleDefaultConfig,
} from './anton-module-config.js';
import {
  scanBundleForInjection,
  summariseInjectionFindings,
  type InjectionFinding,
} from './anton-injection-scan.js';
import {
  findSkill,
  findPersona,
  getInstalledSkill,
  getInstalledPersona,
  type EmbeddedSkill,
  type EmbeddedPersona,
} from './anton-bundle-embeds.js';
import { registerInstalledSkill } from './skills-manager.js';
import { registerInstalledPersona } from './prompt-builder.js';
import type { BundleProvenanceRecord } from './anton-bundler.js';

// ── Types ──────────────────────────────────────────────────────

export type InstalledDependencyAction = 'reused' | 'installed' | 'namespaced' | 'missing';

/** What happened to one skill / persona the bundle referenced. */
export interface InstalledDependency {
  /** The id as the bundle referenced it. */
  bundleId: string;
  /** The id the installed module now references (same, or `bundle:<moduleId>:<id>`). */
  installedId: string;
  action: InstalledDependencyAction;
  /** Why (for 'namespaced' and 'missing'). */
  note?: string;
}

/** The bundle-side identity, readable BEFORE anything is installed. */
export interface BundleFingerprint {
  /** `sha256:<hex>` from manifest.security.checksum, or null for checksum-less legacy bundles. */
  checksum: string | null;
  promptSha256: string;
  guidedInputsSha256: string;
  configSha256: string;
  signed: boolean;
  signatureValid: boolean;
  signerPubkey: string | null;
  signerName: string | null;
  signedAt: string | null;
  /** Display name for the UI: signer name, else first 16 hex of the pubkey, else null. */
  signedBy: string | null;
  /** TOFU: this instance has seen the signer before. */
  known: boolean;
}

export interface ModuleBundleInspection {
  fingerprint: BundleFingerprint;
  injectionFindings: InjectionFinding[];
  embedded: {
    skills: Array<{ id: string; name: string; version?: string }>;
    personas: Array<{ id: string; name: string }>;
  };
  /** Ids the EXPORTER could not resolve (manifest.unresolved). */
  unresolved: { skills: string[]; personas: string[] };
  /** Embedded-file integrity problems — each one refuses the import. */
  errors: ValidationError[];
  warnings: ValidationWarning[];
  embeddedSkills: EmbeddedSkill[];
  embeddedPersonas: EmbeddedPersona[];
}

export interface ImportResult {
  success: boolean;
  moduleId?: string;
  /** True when {keepId: true} was honored (original id was free) — Wave 2.8 */
  keptOriginalId?: boolean;
  validation: ValidationResult;
  /** Set when the import was refused for a reason the caller can override. */
  blocked?: 'injection';
  /** Every injection finding the scan produced (blocking or accepted). */
  injectionFindings?: InjectionFinding[];
  /** The findings the importer explicitly accepted (recorded with the module). */
  acceptedInjectionFindings?: InjectionFinding[];
  installedSkills?: InstalledDependency[];
  installedPersonas?: InstalledDependency[];
  /** Fidelity / dependency warnings the importer itself raised. */
  importWarnings?: string[];
  fingerprint?: BundleFingerprint;
}

export interface ImportOptions {
  /**
   * Keep the module's original id when it does not collide with an existing
   * custom module (Wave 2.8). Default false: generate custom-XXXXXXXX.
   */
  keepId?: boolean;
  /**
   * Wave 6: proceed although the injection scan found patterns. The
   * findings are recorded in the result and in the stored module.
   */
  acceptInjectionFindings?: boolean;
}

/** ids must look like module ids before we agree to keep them */
const SAFE_MODULE_ID = /^[a-z0-9][a-z0-9_-]{2,63}$/i;

/** Embedded entries must live under these folders, as .md, with no traversal. */
const SAFE_EMBEDDED_FILE = /^(skills|personas)\/[a-zA-Z0-9_-][a-zA-Z0-9_.-]*\.md$/;

// ── Inspection (read-only; the validate route and the importer share it) ────

function manifestString(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function buildFingerprint(
  manifest: Record<string, unknown>,
  validation: ValidationResult,
  files: Map<string, string>,
): BundleFingerprint {
  const security = (manifest.security && typeof manifest.security === 'object')
    ? (manifest.security as Record<string, unknown>)
    : {};
  const prov = validation.provenance;
  const signed = prov?.signed === true;
  const valid = signed && prov?.valid === true;
  const signerPubkey = valid ? (prov?.signer_pubkey ?? null) : null;
  const signerName = valid ? (prov?.signer_name ?? null) : null;
  return {
    checksum: manifestString(security.checksum),
    promptSha256: manifestString(security.prompt_sha256) ?? sha256Hex(files.get('system-prompt.md') ?? ''),
    guidedInputsSha256: manifestString(security.guided_inputs_sha256) ?? sha256Hex(files.get('guided-inputs.json') ?? '[]'),
    configSha256: manifestString(security.config_sha256) ?? sha256Hex(files.get('default-config.json') ?? '{}'),
    signed,
    signatureValid: valid,
    signerPubkey,
    signerName,
    signedAt: valid ? (prov?.signed_at ?? null) : null,
    signedBy: valid ? (signerName ?? (signerPubkey ? signerPubkey.slice(0, 16) : null)) : null,
    known: prov?.known === true,
  };
}

interface EmbeddedListEntry { id: string; file: string; sha256: string; name?: string; version?: string }

function readEmbeddedList(manifest: Record<string, unknown>, kind: 'skills' | 'personas'): EmbeddedListEntry[] {
  const embedded = manifest.embedded;
  if (!embedded || typeof embedded !== 'object') return [];
  const list = (embedded as Record<string, unknown>)[kind];
  if (!Array.isArray(list)) return [];
  const out: EmbeddedListEntry[] = [];
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue;
    const e = raw as Record<string, unknown>;
    if (typeof e.id !== 'string' || typeof e.file !== 'string' || typeof e.sha256 !== 'string') continue;
    out.push({
      id: e.id,
      file: e.file,
      sha256: e.sha256.toLowerCase(),
      name: typeof e.name === 'string' ? e.name : undefined,
      version: typeof e.version === 'string' ? e.version : undefined,
    });
  }
  return out;
}

function readUnresolved(manifest: Record<string, unknown>, kind: 'skills' | 'personas'): string[] {
  const unresolved = manifest.unresolved;
  if (!unresolved || typeof unresolved !== 'object') return [];
  const list = (unresolved as Record<string, unknown>)[kind];
  return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [];
}

/**
 * Everything the import needs to know about a MODULE bundle without
 * installing anything: fingerprint, embedded texts (integrity-checked against
 * the manifest), unresolved ids, and the injection scan over every text the
 * bundle can put in front of the model.
 */
export function inspectModuleBundle(buffer: Buffer, validation: ValidationResult): ModuleBundleInspection {
  const manifest = (validation.manifest ?? {}) as Record<string, unknown>;
  const files = validation.files ?? new Map<string, string>();
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  const embeddedSkills: EmbeddedSkill[] = [];
  const embeddedPersonas: EmbeddedPersona[] = [];

  let zip: AdmZip | null = null;
  try {
    zip = new AdmZip(buffer);
  } catch {
    zip = null; // the validator already refused an unreadable archive
  }

  const scanInput: Record<string, string | undefined> = {
    'system-prompt.md': files.get('system-prompt.md'),
    'guided-inputs.json': files.get('guided-inputs.json'),
    'default-config.json': files.get('default-config.json'),
  };

  const listed = new Set<string>();
  for (const kind of ['skills', 'personas'] as const) {
    for (const entry of readEmbeddedList(manifest, kind)) {
      listed.add(entry.file);
      if (!SAFE_EMBEDDED_FILE.test(entry.file) || !entry.file.startsWith(`${kind}/`)) {
        errors.push({
          step: 2,
          severity: 'critical',
          message: `Unsafe embedded file path: ${entry.file}`,
          details: `Embedded ${kind} must be ${kind}/<id>.md.`,
        });
        continue;
      }
      const zipEntry = zip?.getEntry(entry.file) ?? null;
      if (!zipEntry) {
        errors.push({
          step: 2,
          severity: 'critical',
          message: `Embedded file missing: ${entry.file}`,
          details: 'The manifest lists this file but the archive does not contain it — the bundle is incomplete or was modified after export.',
        });
        continue;
      }
      const bytes = zipEntry.getData();
      const actual = sha256Hex(bytes);
      if (actual !== entry.sha256) {
        errors.push({
          step: 2,
          severity: 'critical',
          message: `Embedded file checksum mismatch: ${entry.file}`,
          details: 'The file does not match the sha256 the manifest declares for it. It was modified after export — do not trust it; ask the author to re-export.',
        });
        continue;
      }
      const text = bytes.toString('utf-8');
      const { header, prompt } = parseEmbeddedMarkdown(text);
      if (header.id && header.id !== entry.id) {
        errors.push({
          step: 2,
          severity: 'critical',
          message: `Embedded file id mismatch: ${entry.file}`,
          details: `The file declares id "${header.id}" but the manifest lists it as "${entry.id}".`,
        });
        continue;
      }
      if (!prompt.trim()) {
        warnings.push({ step: 3, severity: 'medium', message: `Embedded ${kind.slice(0, -1)} "${entry.id}" carries no text — it will not be installed` });
        continue;
      }
      scanInput[entry.file] = prompt;
      if (kind === 'skills') {
        let tags: string[] | undefined;
        if (header.tags) {
          try {
            const parsed: unknown = JSON.parse(header.tags);
            tags = Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === 'string') : undefined;
          } catch { tags = undefined; }
        }
        embeddedSkills.push({
          id: entry.id,
          name: header.name || entry.name || entry.id,
          description: header.description ?? '',
          version: header.version || entry.version || '1.0.0',
          author: header.author || undefined,
          category: header.category || undefined,
          tags,
          prompt,
          source: 'installed',
        });
      } else {
        embeddedPersonas.push({
          id: entry.id,
          name: header.name || entry.name || entry.id,
          description: header.description ?? '',
          category: header.category || undefined,
          prompt,
          source: 'installed',
        });
      }
    }
  }

  // Files under skills/ or personas/ that the manifest does not list are
  // covered by no hash — they are ignored, and the user is told.
  if (zip) {
    for (const e of zip.getEntries()) {
      if (e.isDirectory) continue;
      if (!/^(skills|personas)\//.test(e.entryName)) continue;
      if (listed.has(e.entryName)) continue;
      warnings.push({
        step: 2,
        severity: 'medium',
        message: `Unlisted embedded file ignored: ${e.entryName}`,
        details: 'It is not listed in manifest.embedded, so no checksum covers it. It was not installed.',
      });
    }
  }

  return {
    fingerprint: buildFingerprint(manifest, validation, files),
    injectionFindings: scanBundleForInjection(scanInput),
    embedded: {
      skills: embeddedSkills.map((s) => ({ id: s.id, name: s.name, version: s.version })),
      personas: embeddedPersonas.map((p) => ({ id: p.id, name: p.name })),
    },
    unresolved: { skills: readUnresolved(manifest, 'skills'), personas: readUnresolved(manifest, 'personas') },
    errors,
    warnings,
    embeddedSkills,
    embeddedPersonas,
  };
}

// ── Skill / persona installation ───────────────────────────────

function sameText(a: string, b: string): boolean {
  return normaliseForCompare(a) === normaliseForCompare(b);
}

function namespacedId(bundleModuleId: string, id: string): string {
  return `bundle:${bundleModuleId}:${id}`;
}

/**
 * The shared install rule for one embedded skill or persona:
 *
 *   1. an ACTIVE local copy (built-in, disk pack or installed row) with the
 *      same text          → reuse the id, write nothing;
 *   2. no active local copy → install under the bundle's own id (an ARCHIVED
 *      row with that id is revived with the bundle's text — archived means
 *      deleted, nothing references it);
 *   3. a local copy with DIFFERENT text → never clobber it: install under
 *      `bundle:<moduleId>:<id>`; if THAT id already holds yet another text
 *      (a different version of the same bundle), install under
 *      `bundle:<moduleId>:<id>@<sha8>` rather than change what an earlier
 *      import's module already runs with.
 */
interface InstallOps<T extends { id: string; prompt: string }> {
  findLocal: (id: string) => Promise<{ prompt: string; source: string } | undefined>;
  findInstalled: (id: string) => Promise<{ prompt: string } | undefined>;
  upsert: (id: string, item: T) => Promise<void>;
  kind: 'Skill' | 'Persona';
}

async function installEmbedded<T extends { id: string; prompt: string }>(
  bundleModuleId: string,
  items: T[],
  ops: InstallOps<T>,
): Promise<{ map: Map<string, string>; records: InstalledDependency[] }> {
  const map = new Map<string, string>();
  const records: InstalledDependency[] = [];

  for (const item of items) {
    const local = await ops.findLocal(item.id);
    if (local && sameText(local.prompt, item.prompt)) {
      map.set(item.id, item.id);
      records.push({ bundleId: item.id, installedId: item.id, action: 'reused' });
      continue;
    }
    if (!local) {
      await ops.upsert(item.id, item);
      map.set(item.id, item.id);
      records.push({ bundleId: item.id, installedId: item.id, action: 'installed' });
      continue;
    }

    let nsId = namespacedId(bundleModuleId, item.id);
    let existing = await ops.findInstalled(nsId);
    if (existing && !sameText(existing.prompt, item.prompt)) {
      nsId = `${nsId}@${sha256Hex(normaliseForCompare(item.prompt)).slice(0, 8)}`;
      existing = await ops.findInstalled(nsId);
    }
    if (existing && sameText(existing.prompt, item.prompt)) {
      map.set(item.id, nsId);
      records.push({
        bundleId: item.id,
        installedId: nsId,
        action: 'reused',
        note: `${ops.kind} "${item.id}" exists here with different text; this bundle's version was already installed as "${nsId}"`,
      });
      continue;
    }
    await ops.upsert(nsId, item);
    map.set(item.id, nsId);
    records.push({
      bundleId: item.id,
      installedId: nsId,
      action: 'namespaced',
      note: `${ops.kind} "${item.id}" exists here (${local.source}) with different text — the bundle's version was installed as "${nsId}" and the module references that`,
    });
  }
  return { map, records };
}

async function installEmbeddedSkills(
  db: DatabaseAdapter,
  bundleModuleId: string,
  skills: EmbeddedSkill[],
  userId: string | undefined,
): Promise<{ map: Map<string, string>; records: InstalledDependency[] }> {
  const now = new Date().toISOString();
  return installEmbedded(bundleModuleId, skills, {
    kind: 'Skill',
    findLocal: (id) => findSkill(db, id),
    findInstalled: (id) => getInstalledSkill(db, id),
    upsert: async (id, skill) => {
      const author = skill.author ?? 'import';
      const category = skill.category ?? 'domain';
      const tags = JSON.stringify(skill.tags ?? []);
      await db.run(
        `INSERT INTO skills (id, name, description, version, author, category, prompt, tags, user_id, org_id, is_archived, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name, description = EXCLUDED.description, version = EXCLUDED.version,
           author = EXCLUDED.author, category = EXCLUDED.category, prompt = EXCLUDED.prompt,
           tags = EXCLUDED.tags, is_archived = 0
         WHERE skills.is_archived <> 0`,
        id, skill.name, skill.description, skill.version, author, category,
        skill.prompt, tags, userId ?? 'default', 'default', now,
      );
      // The composer resolves skills synchronously — make this one live now.
      registerInstalledSkill({
        id, name: skill.name, description: skill.description, version: skill.version,
        author, category, tags: skill.tags ?? [], prompt: skill.prompt,
      });
    },
  });
}

async function installEmbeddedPersonas(
  db: DatabaseAdapter,
  bundleModuleId: string,
  personas: EmbeddedPersona[],
  userId: string | undefined,
): Promise<{ map: Map<string, string>; records: InstalledDependency[] }> {
  const now = new Date().toISOString();
  return installEmbedded(bundleModuleId, personas, {
    kind: 'Persona',
    findLocal: (id) => findPersona(db, id),
    findInstalled: (id) => getInstalledPersona(db, id),
    upsert: async (id, persona) => {
      await db.run(
        `INSERT INTO personas (id, name, description, prompt, category, source, user_id, org_id, is_archived, created_at)
         VALUES (?, ?, ?, ?, ?, 'import', ?, ?, 0, ?)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name, description = EXCLUDED.description, prompt = EXCLUDED.prompt,
           category = EXCLUDED.category, source = 'import', is_archived = 0
         WHERE personas.is_archived <> 0`,
        id, persona.name, persona.description, persona.prompt, persona.category ?? null,
        userId ?? null, null, now,
      );
      // The composer resolves personas synchronously — make this one live now.
      registerInstalledPersona(id, persona.prompt);
    },
  });
}

// ── Import Module from .anton File ─────────────────────────────

function refused(validation: ValidationResult, errors: ValidationError[], warnings: ValidationWarning[] = []): ImportResult {
  return {
    success: false,
    validation: {
      ...validation,
      valid: false,
      errors: [...validation.errors, ...errors],
      warnings: [...validation.warnings, ...warnings],
    },
  };
}

export async function importAntonFile(
  buffer: Buffer,
  db: DatabaseAdapter,
  userId?: string,
  options: ImportOptions = {}
): Promise<ImportResult> {
  // Validate the .anton file (dispatching validator)
  const validation = await validateAntonFile(buffer, db);

  if (!validation.valid) {
    return {
      success: false,
      validation,
    };
  }

  // Only module bundles install here — other types validated structurally
  // must go to their own surface.
  if (validation.bundle_type && validation.bundle_type !== 'module') {
    const note = validation.notes?.[0];
    return {
      success: false,
      validation: {
        ...validation,
        valid: false,
        errors: [
          ...validation.errors,
          {
            step: 5,
            severity: 'high',
            message: `This is a "${validation.bundle_type}" bundle — the module importer cannot install it`,
            details: note ?? 'Import it at the surface that owns this bundle type.',
          },
        ],
      },
    };
  }

  // Extract data from validated files
  const { manifest, files } = validation;

  if (!manifest || !files) {
    throw new Error('Validation passed but no data returned (internal error)');
  }

  // ── Wave 6: embedded texts, integrity, fingerprint, injection scan ──────
  const inspection = inspectModuleBundle(buffer, validation);
  if (inspection.errors.length > 0) {
    return refused(validation, inspection.errors, inspection.warnings);
  }

  const systemPrompt = files.get('system-prompt.md') || '';
  const guidedInputsRaw = files.get('guided-inputs.json');
  const defaultConfigRaw = files.get('default-config.json') || '{}';

  // ── Wave 6: fidelity — flatten, then validate (typed known keys, unknown kept)
  let parsedDefaultConfig: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(defaultConfigRaw);
    parsedDefaultConfig = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    parsedDefaultConfig = {};
  }
  const flat = flattenModuleConfig(parsedDefaultConfig);
  // Legacy flat dialect carried the tone on the manifest, not in config.json.
  const toggleDefaults = (manifest.toggleDefaults && typeof manifest.toggleDefaults === 'object')
    ? (manifest.toggleDefaults as Record<string, unknown>)
    : null;
  if (flat.writingTone === undefined && toggleDefaults
    && typeof toggleDefaults.defaultWritingTone === 'string'
    && (WRITING_TONES as readonly string[]).includes(toggleDefaults.defaultWritingTone)) {
    flat.writingTone = toggleDefaults.defaultWritingTone;
  }
  const configCheck = validateModuleConfig(flat);
  if (!configCheck.ok) {
    return refused(validation, [{
      step: 3,
      severity: 'high',
      message: 'default-config.json failed schema validation',
      details: configCheck.issues.join('; '),
    }], inspection.warnings);
  }
  const cfg: ModuleDefaultConfig = configCheck.value;

  let guidedSource: unknown;
  if (guidedInputsRaw !== undefined) {
    try { guidedSource = JSON.parse(guidedInputsRaw); } catch { guidedSource = []; }
  } else {
    guidedSource = cfg.guidedInputs ?? [];
  }
  const guidedCheck = validateGuidedInputs(guidedSource);
  if (!guidedCheck.ok) {
    return refused(validation, [{
      step: 3,
      severity: 'high',
      message: 'guided-inputs.json failed schema validation',
      details: guidedCheck.issues.join('; '),
    }], inspection.warnings);
  }

  // ── Wave 6: the injection gate ──────────────────────────────────────────
  const injectionFindings = inspection.injectionFindings;
  if (injectionFindings.length > 0 && options.acceptInjectionFindings !== true) {
    console.warn(`[anton-importer] Import blocked — injection findings: ${summariseInjectionFindings(injectionFindings)}`);
    return {
      success: false,
      blocked: 'injection',
      injectionFindings,
      fingerprint: inspection.fingerprint,
      validation: { ...validation, warnings: [...validation.warnings, ...inspection.warnings] },
    };
  }
  const acceptedInjectionFindings = injectionFindings;

  // Wave 2.8: honor {keepId} when the original id is free; otherwise generate
  // a new ID using the module-builder format: custom-{8 hex chars}.
  let moduleId = `custom-${crypto.randomUUID().slice(0, 8)}`;
  let keptOriginalId = false;
  const originalId = typeof manifest.meta?.id === 'string' ? manifest.meta.id : '';
  if (options.keepId && SAFE_MODULE_ID.test(originalId)) {
    const collision = await db.get('SELECT id FROM custom_modules WHERE id = ?', originalId);
    if (!collision) {
      moduleId = originalId;
      keptOriginalId = true;
    }
  }

  // Wave 2.8: preserve icon/color through import (previously reset to 📦).
  const icon =
    typeof manifest.meta?.icon === 'string' && manifest.meta.icon.trim()
      ? manifest.meta.icon
      : '📦';
  const color =
    typeof manifest.meta?.color === 'string' && manifest.meta.color.trim()
      ? manifest.meta.color
      : undefined;

  // ── Wave 6: install the embedded skills / personas, then re-point the config
  const bundleModuleId = SAFE_MODULE_ID.test(originalId) ? originalId : (originalId || 'bundle').replace(/[^a-zA-Z0-9_-]/g, '_');
  const skillInstall = await installEmbeddedSkills(db, bundleModuleId, inspection.embeddedSkills, userId);
  const personaInstall = await installEmbeddedPersonas(db, bundleModuleId, inspection.embeddedPersonas, userId);

  const importWarnings: string[] = [];
  const referencedSkills = [...new Set([...(cfg.skills ?? []), ...inspection.unresolved.skills])];
  for (const id of referencedSkills) {
    if (skillInstall.map.has(id)) continue;
    if (await findSkill(db, id)) {
      skillInstall.records.push({ bundleId: id, installedId: id, action: 'reused', note: 'not embedded in the bundle; the local copy is used' });
      continue;
    }
    skillInstall.records.push({ bundleId: id, installedId: id, action: 'missing' });
    importWarnings.push(`Skill "${id}" is referenced by the module but neither embedded in the bundle nor installed here — the module will run without it.`);
  }
  const referencedPersonas = [...new Set([...(cfg.personas ?? []), ...inspection.unresolved.personas])];
  for (const id of referencedPersonas) {
    if (personaInstall.map.has(id)) continue;
    if (await findPersona(db, id)) {
      personaInstall.records.push({ bundleId: id, installedId: id, action: 'reused', note: 'not embedded in the bundle; the local copy is used' });
      continue;
    }
    personaInstall.records.push({ bundleId: id, installedId: id, action: 'missing' });
    importWarnings.push(`Persona "${id}" is referenced by the module but neither embedded in the bundle nor installed here — the module will run without it.`);
  }
  for (const w of inspection.warnings) importWarnings.push(w.message);

  const bundleProvenance: BundleProvenanceRecord = {
    checksum: inspection.fingerprint.checksum ?? '',
    promptSha256: inspection.fingerprint.promptSha256,
    guidedInputsSha256: inspection.fingerprint.guidedInputsSha256,
    configSha256: inspection.fingerprint.configSha256,
    signed: inspection.fingerprint.signed,
    signatureValid: inspection.fingerprint.signatureValid,
    signerPubkey: inspection.fingerprint.signerPubkey,
    signerName: inspection.fingerprint.signerName,
    signedAt: inspection.fingerprint.signedAt,
    bundleId: manifestString((manifest.package as Record<string, unknown> | undefined)?.id) ?? (originalId || null),
    bundleVersion: manifestString(manifest.meta?.version),
    importedAt: new Date().toISOString(),
    acceptedInjectionFindings: acceptedInjectionFindings.map((f) => ({
      file: f.file, patternId: f.patternId, label: f.label, excerpt: f.excerpt, line: f.line,
    })),
    installedSkills: skillInstall.records.map((r) => ({ bundleId: r.bundleId, installedId: r.installedId, action: r.action })),
    installedPersonas: personaInstall.records.map((r) => ({ bundleId: r.bundleId, installedId: r.installedId, action: r.action })),
  };

  // The config blob — flat, typed, every applied field carried, ids re-pointed
  // at what was installed, plus the bundle's provenance for the fingerprint.
  const configBlob = JSON.stringify({
    ...cfg,
    author: cfg.author || manifest.meta.author || 'Unknown',
    version: cfg.version || manifest.meta.version || '1.0.0',
    tags: Array.isArray(cfg.tags) ? cfg.tags : (manifest.meta.tags || []),
    guidedInputs: guidedCheck.value,
    // custom_modules has no color column — color rides in the config blob
    // so it survives a re-export (buildModuleAntonArchive reads it back).
    ...(color ? { color } : {}),
    ...(cfg.skills ? { skills: cfg.skills.map((id) => skillInstall.map.get(id) ?? id) } : {}),
    ...(cfg.personas ? { personas: cfg.personas.map((id) => personaInstall.map.get(id) ?? id) } : {}),
    bundleProvenance,
  });

  // Insert using actual custom_modules schema
  try {
    await db.run(
      `INSERT INTO custom_modules (
        id, name, short_name, description, icon, area,
        system_prompt, config,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ,
      moduleId,
      manifest.meta.name,
      manifest.meta.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30),
      manifest.meta.description || '',
      icon,
      manifest.meta.category || 'imported',
      systemPrompt,
      configBlob,
      new Date().toISOString(),
      new Date().toISOString()
    );

    console.log(
      `[anton-importer] Successfully imported module "${manifest.meta.name}" (${moduleId}${keptOriginalId ? ', original id kept' : ''}` +
      `; skills ${skillInstall.records.length}, personas ${personaInstall.records.length}` +
      `${acceptedInjectionFindings.length > 0 ? `; ${acceptedInjectionFindings.length} injection finding(s) accepted` : ''})`
    );

    return {
      success: true,
      moduleId,
      keptOriginalId,
      validation: { ...validation, warnings: [...validation.warnings, ...inspection.warnings] },
      injectionFindings,
      acceptedInjectionFindings,
      installedSkills: skillInstall.records,
      installedPersonas: personaInstall.records,
      importWarnings,
      fingerprint: inspection.fingerprint,
    };
  } catch (error) {
    console.error('[anton-importer] Database insert failed:', error);

    throw new Error(
      `Failed to import module: ${error instanceof Error ? error.message : 'Unknown database error'}`
    );
  }
}
