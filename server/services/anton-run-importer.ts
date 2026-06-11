/**
 * anton-run-importer.ts — import a `module-run` .anton bundle as a READ-ONLY
 * RUN VIEWER session (CORE_EXPERIENCE_REVIEW 2026-06, Wave 2.2).
 *
 * What import does:
 *   1. Validates the bundle (dispatching validator — structural pass for
 *      module-run, plus the Ed25519 provenance check; an INVALID signature
 *      blocks import there).
 *   2. Verifies the manifest's content checksum against the payload files —
 *      a mismatch blocks import (the run record was modified after export).
 *   3. Creates a NEW session in the importer's My Work with the run's input +
 *      output as messages, the per-message `config_snapshot` preserved
 *      VERBATIM, and a provenance note on the session recording origin +
 *      signature status.
 *   4. Re-pins the run artifact (composed prompt + source manifest) on the new
 *      assistant message when the bundle carries it — so "How ANTON Thought"
 *      and the rerun source-drift report work on the imported run.
 *
 * REPRODUCE path (verified by tests/services/anton-run-bundles.test.ts):
 * because the imported run is a normal session message with config_snapshot,
 * the EXISTING POST /api/rerun endpoint rehydrates it through the live
 * pipeline — no run-specific rerun code. Honest limits, surfaced in
 * `reproducible.notes`:
 *   - source CONTENTS don't travel (hashes only) — reruns report them as
 *     "removed" until the recipient re-provides the files/folders;
 *   - if the referenced module is not installed locally the session falls
 *     back to module_id 'imported-run' — the snapshot still replays, but the
 *     module's own prompt layer may differ from the original instance.
 */

import AdmZip from 'adm-zip';
import crypto from 'crypto';
import type { DatabaseAdapter } from '../db/database.js';
import { validateAntonFile, type ValidationResult } from './anton-validator.js';
import { resolveModuleRef } from './anton-bundler.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface RunImportResult {
  success: boolean;
  /** The NEW session created in the importer's My Work. */
  sessionId?: string;
  userMessageId?: string;
  assistantMessageId?: string;
  /** Whether the run's module exists on THIS instance (custom or built-in). */
  moduleExists: boolean;
  /** module_id the new session was filed under ('imported-run' on fallback). */
  localModuleId?: string;
  reproducible: {
    /** The existing /api/rerun endpoint can replay this run here. */
    locally: boolean;
    /** Set when the referenced module is not installed on this instance. */
    missingModule?: string;
    /** Honest fidelity notes (missing sources, missing module, no snapshot). */
    notes: string[];
  };
  /** Hash-declared sources whose content did not travel with the bundle. */
  sourcesNotIncluded: Array<{ name: string; type: string; sha256?: string }>;
  validation: ValidationResult;
}

interface RunBlock {
  session_id?: string;
  message_id?: string;
  session_title?: string | null;
  module?: { id?: string; kind?: string; name?: string; version?: string | null };
  model_id?: string | null;
  cost?: number | null;
  output_tokens?: number | null;
  created_at?: string | null;
  anton_version?: string;
  prompt?: {
    included?: boolean;
    sha256?: string | null;
    chars?: number | null;
    truncated?: boolean;
    layer_summary?: unknown;
  };
  input_included?: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function readEntry(zip: AdmZip, name: string): string | null {
  const entry = zip.getEntry(name);
  if (!entry) return null;
  try {
    return entry.getData().toString('utf-8');
  } catch {
    return null;
  }
}

function failWith(validation: ValidationResult, message: string, details?: string): RunImportResult {
  return {
    success: false,
    moduleExists: false,
    reproducible: { locally: false, notes: [] },
    sourcesNotIncluded: [],
    validation: {
      ...validation,
      valid: false,
      errors: [
        ...validation.errors,
        { step: 5, severity: 'high', message, details },
      ],
    },
  };
}

// ── Import ───────────────────────────────────────────────────────────────────

export async function importModuleRunBundle(
  buffer: Buffer,
  db: DatabaseAdapter,
  userId?: string | null,
): Promise<RunImportResult> {
  const validation = await validateAntonFile(buffer, db);
  if (!validation.valid) {
    return {
      success: false,
      moduleExists: false,
      reproducible: { locally: false, notes: [] },
      sourcesNotIncluded: [],
      validation,
    };
  }
  if (validation.bundle_type !== 'module-run') {
    return failWith(
      validation,
      `This is a "${validation.bundle_type}" bundle — the run importer only accepts module-run bundles`,
      validation.bundle_type === 'module'
        ? 'Import modules via POST /api/exchange/import.'
        : 'Import it at the surface that owns this bundle type.',
    );
  }

  const zip = new AdmZip(buffer);
  const runJson = readEntry(zip, 'run.json');
  const snapshotJson = readEntry(zip, 'config-snapshot.json');
  const inputMd = readEntry(zip, 'input.md');
  const outputMd = readEntry(zip, 'output.md');
  const composedPromptMd = readEntry(zip, 'composed-prompt.md');
  const sourceManifestJson = readEntry(zip, 'source-manifest.json');
  const structuredJson = readEntry(zip, 'structured-payload.json');

  if (!runJson || outputMd === null) {
    return failWith(validation, 'Bundle is missing run.json or output.md', 'Re-export the run from the source ANTON.');
  }

  let runRecord: { run?: RunBlock };
  try {
    runRecord = JSON.parse(runJson) as { run?: RunBlock };
  } catch {
    return failWith(validation, 'run.json is not valid JSON');
  }
  const run: RunBlock = runRecord.run ?? {};

  // ── Content checksum (same fixed order the bundler hashed) ────────────────
  const declaredChecksum = (validation.manifest?.security?.checksum as string | undefined)
    ?.replace('sha256:', '');
  if (declaredChecksum) {
    const hash = crypto.createHash('sha256');
    hash.update(runJson);
    hash.update(snapshotJson ?? '');
    hash.update(inputMd ?? '');
    hash.update(outputMd);
    hash.update(composedPromptMd ?? '');
    hash.update(sourceManifestJson ?? '');
    if (structuredJson) hash.update(structuredJson);
    if (hash.digest('hex') !== declaredChecksum) {
      return failWith(
        validation,
        'Checksum mismatch — the run payload does not match the manifest',
        'One or more payload files were modified after export. Ask the author to re-export the run.',
      );
    }
  }

  // ── Config snapshot (verbatim — the reproduce keystone) ───────────────────
  let snapshot: Record<string, unknown> | null = null;
  if (snapshotJson) {
    try {
      const parsed = JSON.parse(snapshotJson) as unknown;
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) && Object.keys(parsed).length > 0) {
        snapshot = parsed as Record<string, unknown>;
      }
    } catch { /* treated as absent below */ }
  }

  // ── Module resolution on THIS instance ────────────────────────────────────
  const bundleModuleId = typeof run.module?.id === 'string' && run.module.id ? run.module.id : '';
  const localRef = bundleModuleId ? await resolveModuleRef(db, bundleModuleId) : null;
  const moduleExists = !!localRef && localRef.kind !== 'unknown';
  const localModuleId = moduleExists ? bundleModuleId : 'imported-run';

  // ── Honest reproduce notes ─────────────────────────────────────────────────
  const notes: string[] = [];
  let sourcesNotIncluded: Array<{ name: string; type: string; sha256?: string }> = [];
  try {
    const manifestEntries = sourceManifestJson ? JSON.parse(sourceManifestJson) as unknown : [];
    if (Array.isArray(manifestEntries)) {
      sourcesNotIncluded = manifestEntries
        .filter((e): e is Record<string, unknown> => e !== null && typeof e === 'object')
        .filter((e) => e.contentHashed === true)
        .map((e) => ({
          name: String(e.name ?? 'unnamed source'),
          type: String(e.type ?? 'source'),
          ...(typeof e.sha256 === 'string' ? { sha256: e.sha256 } : {}),
        }));
    }
  } catch { /* unreadable manifest — no source notes */ }
  if (sourcesNotIncluded.length > 0) {
    notes.push(
      `${sourcesNotIncluded.length} knowledge source(s) are declared by hash but their content is not included in the bundle — a rerun will report them as "removed" until you re-provide the files/folders/URLs.`,
    );
  }
  if (!moduleExists && bundleModuleId) {
    notes.push(
      `Module "${bundleModuleId}" is not installed on this instance — the session was filed under 'imported-run'. The config snapshot still replays through /api/rerun, but the module's own prompt layer may differ. Import the module's .anton bundle for full fidelity.`,
    );
  }
  if (!snapshot) {
    notes.push('No config snapshot travelled with this run — it can be viewed but not faithfully rerun.');
  }
  if (inputMd === null || !run.input_included) {
    notes.push('The originating user input was not captured at export — rerun needs a user message and will not work on this import.');
  }

  const reproducible = {
    locally: !!snapshot && inputMd !== null && !!run.input_included,
    ...(bundleModuleId && !moduleExists ? { missingModule: bundleModuleId } : {}),
    notes,
  };

  // ── Provenance note (origin + signature status) ───────────────────────────
  const prov = validation.provenance;
  const signatureLine = prov?.signed
    ? `signed by ${prov.signer_name ?? 'unnamed signer'} (${(prov.signer_pubkey ?? '').slice(0, 16)}…, signature valid${prov.known ? ', known signer' : ', first sight'})`
    : 'unsigned';
  const provenanceNote =
    `Imported .anton module-run bundle on ${new Date().toISOString()}. ` +
    `Origin: session ${run.session_id ?? 'unknown'}, message ${run.message_id ?? 'unknown'}, ` +
    `exported by ${run.anton_version ?? 'unknown ANTON'} (run at ${run.created_at ?? 'unknown time'}). ` +
    `Provenance: ${signatureLine}. ` +
    `Read-only run record — source contents did not travel (hashes in the bundle's source manifest).`;

  // ── Persist: session + messages (+ best-effort run artifact) ──────────────
  const sessionId = crypto.randomUUID();
  const userMessageId = crypto.randomUUID();
  const assistantMessageId = crypto.randomUUID();
  const moduleName = run.module?.name ?? bundleModuleId ?? 'module run';
  const now = Date.now();

  const sessionConfig = {
    importedRun: {
      originalSessionId: run.session_id ?? null,
      originalMessageId: run.message_id ?? null,
      module: run.module ?? null,
      modelId: run.model_id ?? null,
      exportedBy: run.anton_version ?? null,
      runCreatedAt: run.created_at ?? null,
      signed: !!prov?.signed,
      signerName: prov?.signer_name ?? null,
      signerPubkey: prov?.signer_pubkey ?? null,
    },
  };

  try {
    await db.run(
      `INSERT INTO sessions (id, module_id, title, summary, config, note, user_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      sessionId,
      localModuleId,
      `Imported run — ${moduleName}`.slice(0, 200),
      run.session_title ? `Imported from "${run.session_title}"` : 'Imported module run',
      JSON.stringify(sessionConfig),
      provenanceNote,
      userId ?? null,
      new Date(now).toISOString(),
      new Date(now).toISOString(),
    );

    if (inputMd !== null && run.input_included) {
      await db.run(
        `INSERT INTO messages (id, session_id, role, content, created_at)
         VALUES (?, ?, 'user', ?, ?)`,
        userMessageId, sessionId, inputMd, new Date(now).toISOString(),
      );
    }
    await db.run(
      `INSERT INTO messages (id, session_id, role, content, token_count, cost, model_id, config_snapshot, created_at)
       VALUES (?, ?, 'assistant', ?, ?, ?, ?, ?, ?)`,
      assistantMessageId,
      sessionId,
      outputMd,
      typeof run.output_tokens === 'number' ? run.output_tokens : null,
      typeof run.cost === 'number' ? run.cost : null,
      typeof run.model_id === 'string' ? run.model_id : null,
      snapshot ? JSON.stringify(snapshot) : null,
      // 1s after the user message so "preceding user message" resolution
      // (rerun step 2) is unambiguous.
      new Date(now + 1000).toISOString(),
    );

    // Re-pin the run artifact so prompt inspection + source-drift work here.
    // Best-effort: prompt_sha256 is NOT NULL, so only insert when it travelled.
    const promptSha = run.prompt?.sha256;
    if (typeof promptSha === 'string' && promptSha) {
      try {
        await db.run(
          `INSERT INTO run_artifacts (id, message_id, session_id, composed_prompt, prompt_sha256, prompt_chars, truncated, layer_summary, source_manifest, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          crypto.randomUUID(),
          assistantMessageId,
          sessionId,
          composedPromptMd,
          promptSha,
          typeof run.prompt?.chars === 'number' ? run.prompt.chars : 0,
          !!run.prompt?.truncated,
          JSON.stringify(run.prompt?.layer_summary ?? []),
          sourceManifestJson ?? '[]',
          new Date(now + 1000).toISOString(),
        );
      } catch (artifactErr) {
        console.warn('[anton-run-importer] could not re-pin run artifact (non-fatal):', artifactErr);
      }
    }
  } catch (err) {
    console.error('[anton-run-importer] database insert failed:', err);
    throw new Error(
      `Failed to import run: ${err instanceof Error ? err.message : 'Unknown database error'}`,
    );
  }

  console.log(
    `[anton-run-importer] Imported module-run as session ${sessionId} (module ${localModuleId}${moduleExists ? '' : ' — original module not installed'})`,
  );

  return {
    success: true,
    sessionId,
    userMessageId: inputMd !== null && run.input_included ? userMessageId : undefined,
    assistantMessageId,
    moduleExists,
    localModuleId,
    reproducible,
    sourcesNotIncluded,
    validation,
  };
}
