/**
 * anton-validator.ts
 *
 * .anton File Validation — one dispatching validator for the whole format
 * (Wave 2.1 of CORE_EXPERIENCE_REVIEW_2026-06).
 *
 * The validator reads `bundle_type` from the manifest and dispatches:
 *   • `module`            → full 5-step deep validation (unchanged behaviour):
 *                           1. ZIP integrity   2. Schema + checksum
 *                           3. Content sanitization   4. Injection scan
 *                           5. Dependency resolution
 *   • other registered    → generic STRUCTURAL pass: ZIP integrity, manifest
 *     types                 envelope checks (version-tolerant), forbidden-
 *                           extension scan (type-aware), <script>-strip scan
 *                           over Markdown, declared-contents presence via the
 *                           BUNDLE_TYPE_REGISTRY. Where a dedicated domain
 *                           validator exists (portal, knowledge packs, …) the
 *                           result carries a note pointing at that surface.
 *   • unknown types       → friendly error naming the type.
 *
 * READ-OLD/WRITE-NEW: every dialect ever shipped keeps importing —
 *   - legacy flat module manifests (formatVersion '1.0', antonExport.ts era)
 *     are upgraded via compatibility mapping;
 *   - legacy hybrid module manifests (version '1.0.0' + meta, no bundle_type)
 *     are treated as modules;
 *   - ad-hoc per-feature manifests (coding types, school, hardware camelCase
 *     `bundleType`) dispatch on whichever type field they carry.
 *
 * Security-first design: No code execution, air-gapped validation.
 */

import AdmZip from 'adm-zip';
import crypto from 'crypto';
import type { DatabaseAdapter } from '../db/database.js';
import { BUNDLE_TYPE_REGISTRY, type GovernanceMetadata } from './anton-bundler.js';
import {
  verifyManifestSignature,
  recordAndCheckSigner,
  type BundleProvenance,
} from './anton-bundle-signing.js';

// ── Types ──────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  /** Resolved bundle type the validator dispatched on (Wave 2.1) */
  bundle_type?: string;
  /** 'full' = deep module validation; 'structural' = generic per-type pass */
  validated_depth?: 'full' | 'structural';
  /** KP-03 trust metadata found on the manifest (Wave 2.6) */
  governance?: GovernanceMetadata;
  /**
   * Ed25519 provenance (Wave 2.4). Always present once the manifest parses:
   * `{ signed: false }` for unsigned bundles (which import exactly as before),
   * verified + TOFU-checked when a signature block exists. An INVALID
   * signature is a critical error — the bundle may have been modified.
   * For SIGNED bundles, `payload_attested` reports whether the signature
   * covers the payload transitively via a verified content checksum (F1).
   */
  provenance?: BundleProvenance;
  /**
   * F1 — content-checksum verdict over the payload files:
   *   'verified'     manifest security.checksum recomputed and matched
   *   'mismatch'     recomputed and DIFFERENT → critical error (tamper)
   *   'absent'       no checksum declared (older bundles — import as before)
   *   'unverifiable' checksum declared but this ANTON has no recipe for it
   */
  checksum_state?: 'verified' | 'mismatch' | 'absent' | 'unverifiable';
  /** Human-readable notes, e.g. where deep validation for this type lives */
  notes?: string[];
  errors: ValidationError[];
  warnings: ValidationWarning[];
  manifest?: any;
  files?: Map<string, string>;
}

export interface ValidationError {
  step: number;
  severity: 'critical' | 'high';
  message: string;
  details?: string;
}

export interface ValidationWarning {
  step: number;
  severity: 'high' | 'medium' | 'low';
  message: string;
  details?: string;
}

/** The pinned format version this ANTON writes. 1.x minors are tolerated. */
const PINNED_FORMAT_VERSION = '1.0.0';

/**
 * Types whose payload legitimately contains source files (the scripts ARE the
 * content, transported as data — ANTON never executes them). For these, code
 * file extensions are a warning instead of an error. Binaries stay forbidden
 * for every type.
 */
const SOURCE_BEARING_TYPES = new Set<string>([
  'script-lite-template',
  'script-medium-template',
  'coding-blueprint',
  // ANTON Studio project blueprint ships the build's final code under code/.
  'coding-studio-project',
  'instruction-builder-project',
  'hardware-project',
  'hardware-template',
  'portal',
  'evidence-pack', // ships its own offline verifier.cjs by design
]);

/** Always-forbidden (binary / shell) extensions, for every bundle type. */
const BINARY_FORBIDDEN_EXTENSIONS = ['.exe', '.dll', '.so', '.dylib', '.bat', '.cmd', '.ps1', '.sh'];

/** Code extensions — forbidden for most types, warned for source-bearing ones. */
const CODE_EXTENSIONS = ['.js', '.ts', '.jsx', '.tsx', '.py', '.rb', '.php', '.pl'];

/**
 * Types with their own dedicated deep validator/import surface. The generic
 * structural pass notes where the real check happens.
 */
const DOMAIN_VALIDATED_TYPES: Record<string, string> = {
  'portal': 'POST /api/portals/import (zip safety, manifest shape, capability-descriptor signature)',
  'regulatory-knowledge-pack': 'POST /api/knowledge-packs/import (entity/relationship schema, KP-03 governance)',
  'evidence-pack': 'the bundle\'s own offline verifiers (verifier.html / verifier.cjs — Ed25519 manifest signature)',
  'career-profile': 'the Jobs profile import (strict zod schema + contact-hash binding)',
  'market-index': 'POST /api/exchange/import-bundle/market-index',
  'market-thesis': 'POST /api/exchange/import-bundle/market-thesis',
  'market-atom-collection': 'POST /api/exchange/import-bundle/market-atom-collection',
  'market-strategy-pack': 'POST /api/exchange/import-bundle/market-strategy-pack',
  'market-investigation': 'POST /api/exchange/import-bundle/market-investigation',
  'market-data-source-config': 'POST /api/exchange/import-bundle/market-data-source-config',
  'market-intelligence-model': 'POST /api/exchange/import-bundle/market-intelligence-model',
  'lesson-plan': 'POST /api/school/import-bundle',
  'study-pack': 'POST /api/school/import-bundle',
  'assessment-bank': 'POST /api/school/import-bundle',
  'module-run': 'POST /api/exchange/import-run (read-only run viewer — creates a session in My Work; reproduce via the Rerun pipeline)',
};

// ── Main Validation Function (dispatching) ─────────────────────

export async function validateAntonFile(
  buffer: Buffer,
  db: DatabaseAdapter
): Promise<ValidationResult> {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // ── Open the ZIP + read the manifest (common to every type) ─────────────
  let zip: AdmZip;
  let entries: AdmZip.IZipEntry[];
  try {
    zip = new AdmZip(buffer);
    entries = zip.getEntries();
  } catch (error) {
    errors.push({
      step: 1,
      severity: 'critical',
      message: 'Invalid ZIP file',
      details: error instanceof Error ? error.message : 'Could not read ZIP archive',
    });
    return { valid: false, errors, warnings };
  }

  if (entries.length === 0) {
    errors.push({ step: 1, severity: 'critical', message: 'Empty ZIP archive' });
    return { valid: false, errors, warnings };
  }

  const manifestEntry = zip.getEntry('manifest.json');
  if (!manifestEntry) {
    errors.push({ step: 1, severity: 'critical', message: 'Missing manifest.json file' });
    return { valid: false, errors, warnings };
  }

  let manifest: any;
  try {
    manifest = JSON.parse(manifestEntry.getData().toString('utf-8'));
  } catch (error) {
    errors.push({
      step: 2,
      severity: 'critical',
      message: 'Failed to parse manifest.json',
      details: error instanceof Error ? error.message : 'Invalid JSON',
    });
    return { valid: false, errors, warnings };
  }

  // ── Resolve the bundle type (accepting all shipped dialects) ────────────
  // Legacy flat dialect (pre-v0.7.5 built-in module exports) is module-only.
  const isLegacyFlat =
    manifest.formatVersion === '1.0' && !manifest.format_version && !manifest.meta;
  if (isLegacyFlat && manifest.type !== 'module') {
    errors.push({
      step: 2,
      severity: 'critical',
      message: 'This bundle was exported by an older ANTON version and cannot be imported here',
      details: `Legacy flat-dialect bundle of type "${manifest.type ?? 'unknown'}" — re-export it from the current ANTON version.`,
    });
    return { valid: false, errors, warnings, manifest };
  }

  const bundleType = resolveBundleType(manifest, isLegacyFlat, entries);
  if (!bundleType) {
    errors.push({
      step: 2,
      severity: 'critical',
      message: 'Could not determine the bundle type from manifest.json',
      details: 'The manifest declares neither bundle_type nor any recognised legacy type field.',
    });
    return { valid: false, errors, warnings, manifest };
  }

  if (!(bundleType in BUNDLE_TYPE_REGISTRY)) {
    errors.push({
      step: 2,
      severity: 'critical',
      message: `Unknown bundle type "${bundleType}"`,
      details: `This ANTON version does not recognise "${bundleType}". It may come from a newer ANTON — update this instance, or check the type spelling against docs/anton-format/README.md.`,
    });
    return { valid: false, errors, warnings, manifest, bundle_type: bundleType };
  }

  const governance = extractGovernance(manifest, bundleType);
  if (governance) {
    warnings.push({
      step: 2,
      severity: 'low',
      message: `Governance: ${formatGovernanceLine(governance)}`,
      details: 'Trust metadata declared by the bundle author (not independently verified).',
    });
  }

  // ── Ed25519 provenance (Wave 2.4) ────────────────────────────────────────
  // Checked on the ORIGINAL parsed manifest (signing covers it as written;
  // legacy-dialect upgrades happen later and never carry signatures anyway).
  // Unsigned bundles get `{ signed: false }` and validate exactly as before.
  const provenance = await checkProvenance(manifest, db, errors, warnings);

  // ── Dispatch ─────────────────────────────────────────────────────────────
  const result =
    bundleType === 'module'
      ? await validateModuleDeep(zip, entries, manifest, isLegacyFlat, db, errors, warnings)
      : validateStructural(entries, manifest, bundleType, errors, warnings);

  result.bundle_type = bundleType;
  if (governance) result.governance = governance;

  // ── F1: bind the signature verdict to payload attestation, honestly ──────
  // A signature only ever covers manifest.json. The payload is attested
  // transitively ONLY when the manifest carries a content checksum that was
  // actually recomputed and matched. Signed-but-checksum-less bundles keep
  // importing (READ-OLD), but the user is told exactly what the signature
  // does and does not prove.
  if (provenance.signed) {
    provenance.payload_attested = provenance.valid && result.checksum_state === 'verified';
    if (provenance.valid && result.checksum_state !== 'verified' && result.checksum_state !== 'mismatch') {
      warnings.push({
        step: 2,
        severity: 'medium',
        message: 'Signature covers the manifest only — payload integrity is NOT attested',
        details: 'The signed manifest carries no verifiable content checksum over the payload files, so the signature proves who exported the manifest — not that the payload files are unmodified. Ask the author to re-export from a current ANTON, which embeds a payload checksum the signature then covers.',
      });
    }
  }

  result.provenance = provenance;
  return result;
}

// ── Ed25519 provenance check (Wave 2.4) ────────────────────────

/**
 * Verify the optional manifest signature block and run TOFU bookkeeping.
 * A present-but-INVALID signature is a critical error (the manifest was
 * modified after signing — block import). Absence of a signature is never
 * an error: unsigned bundles keep importing forever.
 */
async function checkProvenance(
  manifest: any,
  db: DatabaseAdapter,
  errors: ValidationError[],
  warnings: ValidationWarning[]
): Promise<BundleProvenance> {
  const verdict = verifyManifestSignature(manifest as Record<string, unknown>);

  if (!verdict.signed) {
    return { signed: false, valid: false, known: false };
  }

  const block = verdict.block!;

  if (!verdict.valid) {
    errors.push({
      step: 2,
      severity: 'critical',
      message: 'Signature INVALID — bundle may have been modified after signing',
      details: `The Ed25519 signature does not match the manifest contents (claimed signer: ${block.signer_name ?? block.signer_pubkey.slice(0, 16) + '…'}). Do not trust this bundle; ask the author to re-export it.`,
    });
    return {
      signed: true,
      valid: false,
      signer_pubkey: block.signer_pubkey,
      signer_name: block.signer_name,
      signed_at: block.signed_at,
      known: false,
    };
  }

  // Valid signature → TOFU: have we seen this signer before?
  const tofu = await recordAndCheckSigner(db, block.signer_pubkey, block.signer_name);
  if (tofu.known && tofu.firstSeenName && block.signer_name && tofu.firstSeenName !== block.signer_name) {
    warnings.push({
      step: 2,
      severity: 'medium',
      message: `Signer name changed: this key was first seen as "${tofu.firstSeenName}", now claims "${block.signer_name}"`,
      details: 'The signature itself is valid — the same key signed both — but the displayed name differs from first sight.',
    });
  }
  warnings.push({
    step: 2,
    severity: 'low',
    message: `Signed by ${block.signer_name ?? 'unnamed signer'} (${tofu.known ? 'known signer — seen before on this instance' : 'first time seeing this signer'})`,
    details: 'A valid signature proves the manifest is untouched since signing by this key. The payload files are covered only when the manifest carries a content checksum that this validator verified (see payload attestation). It does not vouch for content quality or real-world identity.',
  });

  return {
    signed: true,
    valid: true,
    signer_pubkey: block.signer_pubkey,
    signer_name: block.signer_name,
    signed_at: block.signed_at,
    known: tofu.known,
    ...(tofu.firstSeenName && tofu.firstSeenName !== block.signer_name ? { first_seen_name: tofu.firstSeenName } : {}),
  };
}

/** Map every shipped manifest dialect to its bundle type. */
function resolveBundleType(
  manifest: any,
  isLegacyFlat: boolean,
  entries: AdmZip.IZipEntry[]
): string | undefined {
  if (isLegacyFlat) return 'module';
  if (typeof manifest.bundle_type === 'string') return manifest.bundle_type;
  // Hardware + portal dialects use camelCase bundleType
  if (typeof manifest.bundleType === 'string') return manifest.bundleType;
  // Legacy hybrid module manifests (version '1.0.0' + meta, before bundle_type existed)
  if (manifest.meta && (manifest.meta.id || manifest.meta.name)) return 'module';
  // Evidence packs carry a signed domain manifest without a type field
  if (typeof manifest.packId === 'string' && typeof manifest.manifestHash === 'string') {
    return 'evidence-pack';
  }
  // Module-shaped zip without any type marker → treat as module (deep checks decide)
  if (entries.some((e) => e.entryName === 'system-prompt.md')) return 'module';
  return undefined;
}

// ── Module deep validation (the original 5-step pipeline) ──────

async function validateModuleDeep(
  zip: AdmZip,
  entries: AdmZip.IZipEntry[],
  parsedManifest: any,
  isLegacyFlat: boolean,
  db: DatabaseAdapter,
  errors: ValidationError[],
  warnings: ValidationWarning[]
): Promise<ValidationResult> {
  let manifest: any = parsedManifest;
  const files = new Map<string, string>();

  try {
    // STEP 1: ZIP Integrity Check
    const step1 = validateZipIntegrity(entries, 'module');
    errors.push(...step1.errors);
    warnings.push(...step1.warnings);

    if (step1.errors.length > 0) {
      return { valid: false, validated_depth: 'full', errors, warnings, manifest };
    }

    // STEP 2: Schema Validation
    const step2 = validateModuleSchema(zip, parsedManifest, isLegacyFlat);
    errors.push(...step2.errors);
    warnings.push(...step2.warnings);
    manifest = step2.manifest;
    const checksumState = step2.checksumState;

    if (step2.errors.length > 0) {
      return { valid: false, validated_depth: 'full', checksum_state: checksumState, errors, warnings, manifest };
    }

    // STEP 3: Content Sanitization
    const step3 = sanitizeContent(zip);
    errors.push(...step3.errors);
    warnings.push(...step3.warnings);

    for (const [filename, content] of step3.files.entries()) {
      files.set(filename, content);
    }

    // STEP 4: Injection Scan
    const systemPrompt = files.get('system-prompt.md') || '';
    const step4 = scanForInjection(systemPrompt);
    errors.push(...step4.errors);
    warnings.push(...step4.warnings);

    // STEP 5: Dependency Resolution
    const step5 = await resolveDependencies(manifest, db);
    warnings.push(...step5.warnings); // Dependencies are warnings, not errors

    // Final verdict
    const valid = errors.length === 0;

    return { valid, validated_depth: 'full', checksum_state: checksumState, errors, warnings, manifest, files };
  } catch (error) {
    errors.push({
      step: 0,
      severity: 'critical',
      message: 'Validation failed with unexpected error',
      details: error instanceof Error ? error.message : 'Unknown error',
    });

    return { valid: false, validated_depth: 'full', errors, warnings, manifest };
  }
}

// ── Generic structural validation (every non-module registered type) ───────

function validateStructural(
  entries: AdmZip.IZipEntry[],
  manifest: any,
  bundleType: string,
  errors: ValidationError[],
  warnings: ValidationWarning[]
): ValidationResult {
  const notes: string[] = [];

  // 1. ZIP safety scan (type-aware forbidden extensions)
  const step1 = validateZipIntegrity(entries, bundleType);
  errors.push(...step1.errors);
  warnings.push(...step1.warnings);

  // 2. Format-version tolerance (Wave 2.1.3) — accept 1.x with a warning.
  checkFormatVersionTolerance(manifest, errors, warnings);

  // 2b. Content checksum (F1) — verify `security.checksum` over the payload
  //     files when declared. Mismatch is a CRITICAL error (tamper). Absence
  //     is a low-severity note only: every checksum-less bundle ever shipped
  //     keeps importing (READ-OLD is sacred).
  const checksumState = verifyDeclaredChecksum(entries, manifest, bundleType, errors, warnings, notes);

  // 3. <script>-strip scan over Markdown payloads (no mutation — report only)
  for (const entry of entries) {
    if (entry.isDirectory || !entry.entryName.toLowerCase().endsWith('.md')) continue;
    try {
      const content = entry.getData().toString('utf-8');
      if (content.includes('<script')) {
        warnings.push({
          step: 3,
          severity: 'high',
          message: `<script> tag found in ${entry.entryName}`,
          details: 'Markdown content should not contain script tags; they will be stripped or ignored at import.',
        });
      }
    } catch {
      /* unreadable entry already flagged by ZIP scan */
    }
  }

  // 4. Embedded JSON payloads must at least parse
  for (const entry of entries) {
    if (entry.isDirectory || !entry.entryName.toLowerCase().endsWith('.json')) continue;
    if (entry.entryName === 'manifest.json') continue; // already parsed
    try {
      JSON.parse(entry.getData().toString('utf-8'));
    } catch {
      warnings.push({
        step: 3,
        severity: 'medium',
        message: `Invalid JSON in ${entry.entryName}`,
        details: 'The file is not parseable JSON; the type-specific importer will likely reject it.',
      });
    }
  }

  // 5. Declared-contents presence via the registry (only for bundles that use
  //    the contents/ layout — root-layout dialects are skipped, not failed).
  const registry = BUNDLE_TYPE_REGISTRY[bundleType as keyof typeof BUNDLE_TYPE_REGISTRY];
  const hasContentsDir = entries.some((e) => e.entryName.startsWith('contents/'));
  if (hasContentsDir && registry.primaryContentDir) {
    const declared = manifest?.contents?.[registry.contentsKey];
    if (typeof declared === 'number' && declared >= 1) {
      const present = entries.some(
        (e) => e.entryName.startsWith(`contents/${registry.primaryContentDir}/`) && !e.isDirectory
      );
      if (!present) {
        errors.push({
          step: 2,
          severity: 'high',
          message: `Declared contents missing: ${registry.contentsKey}`,
          details: `manifest.contents.${registry.contentsKey} = ${declared} but contents/${registry.primaryContentDir}/ is missing or empty.`,
        });
      }
    }
  }

  // 6. Note where deep validation for this type lives
  if (DOMAIN_VALIDATED_TYPES[bundleType]) {
    notes.push(
      `Structural check only — deep ${registry.label} validation happens at ${DOMAIN_VALIDATED_TYPES[bundleType]}.`
    );
  } else {
    notes.push(
      `Structural check only — "${bundleType}" has no module-style deep validator; contents are applied by its own surface.`
    );
  }

  return {
    valid: errors.length === 0,
    validated_depth: 'structural',
    checksum_state: checksumState,
    notes,
    errors,
    warnings,
    manifest,
  };
}

// ── Content-checksum verification (F1) ─────────────────────────

type ChecksumState = NonNullable<ValidationResult['checksum_state']>;

function findEntry(entries: AdmZip.IZipEntry[], name: string): AdmZip.IZipEntry | undefined {
  return entries.find((e) => e.entryName === name && !e.isDirectory);
}

function readEntryText(entries: AdmZip.IZipEntry[], name: string): string | null {
  const entry = findEntry(entries, name);
  if (!entry) return null;
  try {
    return entry.getData().toString('utf-8');
  } catch {
    return null;
  }
}

/**
 * Verify `manifest.security.checksum` against the payload files.
 *
 * Two checksum conventions exist in the wild — both are verified:
 *
 *  1. SELF-DESCRIBING (write-new, attachPayloadChecksum in anton-bundler):
 *     `security.checksum_files` lists the covered entry names in hashed
 *     order; the checksum is sha256 over their concatenated bytes.
 *  2. LEGACY FIXED RECIPES (module-run / gap-assessment /
 *     legal-research-session bundles shipped before checksum_files existed):
 *     the exact per-type file order their bundlers hash — kept bit-for-bit
 *     in sync with anton-bundler.ts (and anton-run-importer.ts for
 *     module-run, which re-verifies at import).
 *
 * Verdicts: match → 'verified' note; mismatch → CRITICAL error (tamper);
 * no checksum → low-severity note, never an error (READ-OLD); declared but
 * no known recipe → 'unverifiable' warning (foreign/future writer).
 */
function verifyDeclaredChecksum(
  entries: AdmZip.IZipEntry[],
  manifest: any,
  bundleType: string,
  errors: ValidationError[],
  warnings: ValidationWarning[],
  notes: string[]
): ChecksumState {
  const declared = manifest?.security?.checksum;
  if (typeof declared !== 'string' || !declared.trim()) {
    warnings.push({
      step: 2,
      severity: 'low',
      message: 'No content checksum — payload integrity not attested',
      details: 'The manifest declares no security.checksum, so the payload files cannot be verified against it. Bundles exported by current ANTON versions carry one; older bundles import exactly as before.',
    });
    return 'absent';
  }
  const expected = declared.replace(/^sha256:/i, '').trim().toLowerCase();

  const declaredFiles = manifest?.security?.checksum_files;
  let actual: string | null = null;

  if (Array.isArray(declaredFiles) && declaredFiles.every((f: unknown) => typeof f === 'string')) {
    // Convention 1: self-describing file list, hashed in listed order.
    // The writer (attachPayloadChecksum) covers EVERY payload entry, so an
    // archive entry absent from the list means a file was smuggled in after
    // export (e.g. an earlier-sorting contents/*.json an importer would pick
    // up) — flag it, don't just hash around it.
    const covered = new Set(declaredFiles as string[]);
    const uncovered = entries
      .filter((e) => !e.isDirectory && e.entryName !== 'manifest.json' && !covered.has(e.entryName))
      .map((e) => e.entryName);
    if (uncovered.length > 0) {
      errors.push({
        step: 2,
        severity: 'critical',
        message: 'Checksum mismatch — payload files were modified after export',
        details: `Archive contains file(s) not covered by security.checksum_files: ${uncovered.slice(0, 5).join(', ')}${uncovered.length > 5 ? ` (+${uncovered.length - 5} more)` : ''}. They were added after the checksum was computed — the bundle may have been tampered with.`,
      });
      return 'mismatch';
    }
    const hash = crypto.createHash('sha256');
    for (const name of declaredFiles as string[]) {
      const entry = findEntry(entries, name);
      if (!entry) {
        errors.push({
          step: 2,
          severity: 'critical',
          message: 'Checksum mismatch — payload files were modified after export',
          details: `"${name}" is listed in security.checksum_files but missing from the archive. The bundle may be corrupted or tampered with — do not trust it; ask the author to re-export.`,
        });
        return 'mismatch';
      }
      try {
        hash.update(entry.getData());
      } catch {
        errors.push({
          step: 2,
          severity: 'critical',
          message: 'Checksum mismatch — payload files were modified after export',
          details: `"${name}" is listed in security.checksum_files but could not be read from the archive.`,
        });
        return 'mismatch';
      }
    }
    actual = hash.digest('hex');
  } else if (bundleType === 'module-run') {
    actual = computeModuleRunChecksum(entries);
  } else if (bundleType === 'gap-assessment') {
    actual = computeGapAssessmentChecksum(entries);
  } else if (bundleType === 'legal-research-session') {
    actual = computeLegalResearchChecksum(entries);
  }

  if (actual === null) {
    warnings.push({
      step: 2,
      severity: 'medium',
      message: 'Content checksum declared but not verifiable by this ANTON',
      details: `The manifest declares security.checksum without checksum_files, and this ANTON has no fixed recipe for "${bundleType}" bundles — payload integrity was NOT verified.`,
    });
    return 'unverifiable';
  }

  if (actual !== expected) {
    errors.push({
      step: 2,
      severity: 'critical',
      message: 'Checksum mismatch — payload files were modified after export',
      details: 'The payload files do not match the manifest\'s security.checksum. The bundle may be corrupted or tampered with — do not trust it; ask the author to re-export.',
    });
    return 'mismatch';
  }

  notes.push('Content checksum verified — the payload files match the manifest.');
  return 'verified';
}

/**
 * Legacy module-run recipe — the exact fixed order bundleModuleRunToAnton
 * hashes (and anton-run-importer re-verifies): run.json, config-snapshot.json,
 * input.md, output.md, composed-prompt.md ('' when absent),
 * source-manifest.json, structured-payload.json (only when present).
 */
function computeModuleRunChecksum(entries: AdmZip.IZipEntry[]): string | null {
  const runJson = readEntryText(entries, 'run.json');
  const outputMd = readEntryText(entries, 'output.md');
  if (runJson === null || outputMd === null) return null;
  const hash = crypto.createHash('sha256');
  hash.update(runJson);
  hash.update(readEntryText(entries, 'config-snapshot.json') ?? '');
  hash.update(readEntryText(entries, 'input.md') ?? '');
  hash.update(outputMd);
  hash.update(readEntryText(entries, 'composed-prompt.md') ?? '');
  hash.update(readEntryText(entries, 'source-manifest.json') ?? '');
  const structured = readEntryText(entries, 'structured-payload.json');
  if (structured) hash.update(structured);
  return hash.digest('hex');
}

/**
 * Legacy gap-assessment recipe (bundleGapAssessmentToAnton): assessment.json,
 * findings.json, evidence-manifest.json, iterations.json, the second-opinions
 * JSON ('[]' when the file was omitted because no opinions existed), then the
 * TEXT of every evidence/<docId>.md in archive order — the bundler hashes the
 * raw evidence text and prepends a 3-line HTML-comment header (+ blank line)
 * when writing the file, so the header is stripped before hashing.
 */
function computeGapAssessmentChecksum(entries: AdmZip.IZipEntry[]): string | null {
  const assessment = readEntryText(entries, 'assessment.json');
  const findings = readEntryText(entries, 'findings.json');
  const evidenceManifest = readEntryText(entries, 'evidence-manifest.json');
  const iterations = readEntryText(entries, 'iterations.json');
  if (assessment === null || findings === null || evidenceManifest === null || iterations === null) {
    return null;
  }
  const hash = crypto.createHash('sha256');
  hash.update(assessment);
  hash.update(findings);
  hash.update(evidenceManifest);
  hash.update(iterations);
  hash.update(readEntryText(entries, 'second-opinions.json') ?? '[]');
  for (const entry of entries) {
    if (entry.isDirectory) continue;
    if (!entry.entryName.startsWith('evidence/') || !entry.entryName.endsWith('.md')) continue;
    let content: string;
    try {
      content = entry.getData().toString('utf-8');
    } catch {
      return null;
    }
    hash.update(content.replace(/^(?:<!--[^\n]*-->\n){3}\n/, ''));
  }
  return hash.digest('hex');
}

/**
 * Legacy legal-research-session recipe (bundleLegalResearchSessionToAnton):
 * session.json, transcript.json, pinned-findings.json, citations.json.
 * (transcript.md and README.md were never covered.)
 */
function computeLegalResearchChecksum(entries: AdmZip.IZipEntry[]): string | null {
  const parts = ['session.json', 'transcript.json', 'pinned-findings.json', 'citations.json'];
  const hash = crypto.createHash('sha256');
  for (const name of parts) {
    const text = readEntryText(entries, name);
    if (text === null) return null;
    hash.update(text);
  }
  return hash.digest('hex');
}

// ── Format-version tolerance (Wave 2.1.3) ──────────────────────

/**
 * Accept format_version 1.x minor variations with a warning instead of a hard
 * failure; only a different major (or garbage) is an error. Checks the spec
 * field first, then the legacy per-dialect spellings.
 */
function checkFormatVersionTolerance(
  manifest: any,
  errors: ValidationError[],
  warnings: ValidationWarning[]
): void {
  const declared =
    firstString(manifest?.format_version, manifest?.formatVersion, manifest?.bundleSchemaVersion, manifest?.bundleVersion);

  if (declared === undefined) {
    warnings.push({
      step: 2,
      severity: 'low',
      message: 'Manifest declares no format version',
      details: 'Older .anton dialect — accepted for compatibility. Re-export from the current ANTON to add format_version.',
    });
    return;
  }

  if (declared === PINNED_FORMAT_VERSION) return;

  if (/^1(\.\d+){0,2}$/.test(declared)) {
    warnings.push({
      step: 2,
      severity: 'low',
      message: `Format version ${declared} differs from this ANTON's ${PINNED_FORMAT_VERSION}`,
      details: 'Minor 1.x variations are accepted; unknown fields are ignored.',
    });
    return;
  }

  errors.push({
    step: 2,
    severity: 'critical',
    message: 'Unsupported .anton format version',
    details: `Expected a 1.x format version, got "${declared}". This bundle likely comes from an incompatible ANTON generation.`,
  });
}

function firstString(...values: unknown[]): string | undefined {
  for (const v of values) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
}

// ── Governance extraction (Wave 2.6) ───────────────────────────

/**
 * Read KP-03 trust metadata: the spec-envelope `governance` block, falling
 * back to the knowledge-pack dialect's root-level fields.
 */
function extractGovernance(manifest: any, bundleType: string): GovernanceMetadata | undefined {
  const source =
    manifest?.governance && typeof manifest.governance === 'object'
      ? manifest.governance
      : bundleType === 'regulatory-knowledge-pack'
        ? manifest
        : undefined;
  if (!source) return undefined;

  const out: GovernanceMetadata = {};
  if (typeof source.effective_date === 'string' && source.effective_date) out.effective_date = source.effective_date;
  if (typeof source.source_url === 'string' && source.source_url) out.source_url = source.source_url;
  if (typeof source.validated_by === 'string' && source.validated_by) out.validated_by = source.validated_by;
  if (typeof source.content_confirmed === 'boolean') out.content_confirmed = source.content_confirmed;
  return Object.keys(out).length > 0 ? out : undefined;
}

export function formatGovernanceLine(g: GovernanceMetadata): string {
  const parts: string[] = [];
  if (g.validated_by) parts.push(`validated by ${g.validated_by}`);
  if (g.source_url) parts.push(`source: ${g.source_url}`);
  if (g.effective_date) parts.push(`effective: ${g.effective_date}`);
  if (g.content_confirmed !== undefined) parts.push(g.content_confirmed ? 'content confirmed by author' : 'content NOT confirmed');
  return parts.join(' · ');
}

// ── STEP 1: ZIP Integrity Check (shared, type-aware) ───────────

function validateZipIntegrity(
  entries: AdmZip.IZipEntry[],
  bundleType: string
): {
  errors: ValidationError[];
  warnings: ValidationWarning[];
} {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  const sourceBearing = SOURCE_BEARING_TYPES.has(bundleType);
  const ALLOWED_EXTENSIONS = ['.json', '.md'];

  for (const entry of entries) {
    const filename = entry.entryName.toLowerCase();

    // Path traversal / absolute paths never allowed
    const segments = entry.entryName.split(/[\\/]/);
    if (segments.includes('..') || filename.startsWith('/') || /^[a-z]:/i.test(filename)) {
      errors.push({
        step: 1,
        severity: 'critical',
        message: `Unsafe path in archive: ${entry.entryName}`,
      });
      continue;
    }

    // Binaries / shell scripts: forbidden for every type
    for (const ext of BINARY_FORBIDDEN_EXTENSIONS) {
      if (filename.endsWith(ext)) {
        errors.push({
          step: 1,
          severity: 'critical',
          message: `Forbidden file type detected: ${entry.entryName}`,
          details: 'Executable files are not allowed in .anton packages for security reasons.',
        });
      }
    }

    // Code files: forbidden for module-style types, warned for source-bearing types
    for (const ext of CODE_EXTENSIONS) {
      if (filename.endsWith(ext)) {
        if (sourceBearing) {
          warnings.push({
            step: 1,
            severity: 'low',
            message: `Source file in bundle: ${entry.entryName}`,
            details: `Expected for ${bundleType} bundles. ANTON never executes bundle contents — review before running anything yourself.`,
          });
        } else {
          errors.push({
            step: 1,
            severity: 'critical',
            message: `Forbidden file type detected: ${entry.entryName}`,
            details: 'Executable files are not allowed in .anton packages for security reasons.',
          });
        }
      }
    }

    // Warn on non-standard extensions (module bundles only — other types
    // legitimately carry .html, .svg, .csv, etc.)
    if (bundleType === 'module') {
      const hasAllowedExt = ALLOWED_EXTENSIONS.some((ext) => filename.endsWith(ext));
      if (!hasAllowedExt && !entry.isDirectory) {
        warnings.push({
          step: 1,
          severity: 'low',
          message: `Unexpected file type: ${entry.entryName}`,
          details: 'Only .json and .md files are expected.',
        });
      }
    }
  }

  // Module bundles require the canonical files
  if (bundleType === 'module') {
    const hasManifest = entries.some((e) => e.entryName === 'manifest.json');
    const hasSystemPrompt = entries.some((e) => e.entryName === 'system-prompt.md');

    if (!hasManifest) {
      errors.push({ step: 1, severity: 'critical', message: 'Missing manifest.json file' });
    }
    if (!hasSystemPrompt) {
      errors.push({ step: 1, severity: 'critical', message: 'Missing system-prompt.md file' });
    }
  }

  return { errors, warnings };
}

// ── STEP 2: Module Schema Validation ───────────────────────────

function validateModuleSchema(
  zip: AdmZip,
  parsedManifest: any,
  isLegacyFlat: boolean
): {
  errors: ValidationError[];
  warnings: ValidationWarning[];
  manifest: any;
  /** F1: checksum verdict for ValidationResult.checksum_state */
  checksumState: ChecksumState;
} {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  let manifest: any = parsedManifest;
  let checksumState: ChecksumState = 'absent';

  // ── Legacy flat dialect (pre-v0.7.5 built-in module exports) ──────────
  // Old built-in exports (antonExport.ts, since removed) wrote a flat
  // manifest: { formatVersion: '1.0', type, id, name, … } with config.json
  // instead of guided-inputs.json/default-config.json and no checksum.
  // Accept these by mapping flat → hybrid so old user exports still import.
  if (isLegacyFlat) {
    if (!manifest.id || !manifest.name) {
      errors.push({
        step: 2,
        severity: 'critical',
        message: 'Missing required metadata fields',
        details: 'Legacy manifest must declare id and name',
      });
      return { errors, warnings, manifest, checksumState };
    }
    warnings.push({
      step: 2,
      severity: 'low',
      message: 'Legacy .anton dialect detected (exported by an older ANTON version)',
      details: 'Imported via compatibility mapping. This dialect carries no integrity checksum — re-export the module from the current ANTON version to include one.',
    });
    manifest = upgradeLegacyFlatManifest(manifest);
    // Mapped manifest is well-formed by construction; skip the hybrid
    // checks below (there is no checksum to verify in this dialect).
    return { errors, warnings, manifest, checksumState };
  }

  // Validate required fields — 1.x minor versions are tolerated (Wave 2.1.3),
  // only a missing/foreign-major version fails.
  if (!manifest.version) {
    errors.push({
      step: 2,
      severity: 'critical',
      message: 'Invalid or unsupported manifest version',
      details: `Expected version ${PINNED_FORMAT_VERSION}, got undefined`,
    });
  } else if (manifest.version !== PINNED_FORMAT_VERSION) {
    if (/^1(\.\d+){0,2}$/.test(String(manifest.version))) {
      warnings.push({
        step: 2,
        severity: 'low',
        message: `Manifest version ${manifest.version} differs from this ANTON's ${PINNED_FORMAT_VERSION}`,
        details: 'Minor 1.x variations are accepted; unknown fields are ignored.',
      });
    } else {
      errors.push({
        step: 2,
        severity: 'critical',
        message: 'Invalid or unsupported manifest version',
        details: `Expected a 1.x version, got ${manifest.version}`,
      });
    }
  }

  if (!manifest.meta || !manifest.meta.id || !manifest.meta.name) {
    errors.push({
      step: 2,
      severity: 'critical',
      message: 'Missing required metadata fields',
      details: 'manifest.meta.id and manifest.meta.name are required',
    });
  }

  if (!manifest.security || !manifest.security.checksum) {
    errors.push({
      step: 2,
      severity: 'high',
      message: 'Missing security checksum',
      details: 'Cannot verify file integrity without checksum',
    });
  }

  // Verify checksum
  if (manifest.security?.checksum) {
    const expectedChecksum = manifest.security.checksum.replace('sha256:', '');

    // Recalculate checksum from files
    const systemPromptEntry = zip.getEntry('system-prompt.md');
    const guidedInputsEntry = zip.getEntry('guided-inputs.json');
    const defaultConfigEntry = zip.getEntry('default-config.json');

    if (systemPromptEntry && guidedInputsEntry && defaultConfigEntry) {
      const hash = crypto.createHash('sha256');
      hash.update(systemPromptEntry.getData());
      hash.update(guidedInputsEntry.getData());
      hash.update(defaultConfigEntry.getData());
      const actualChecksum = hash.digest('hex');

      if (actualChecksum !== expectedChecksum) {
        checksumState = 'mismatch';
        errors.push({
          step: 2,
          severity: 'high',
          message: 'Checksum mismatch',
          details: 'File contents do not match the declared checksum. File may be corrupted or tampered.',
        });
      } else {
        checksumState = 'verified';
      }
    } else {
      checksumState = 'unverifiable';
    }
  }

  return { errors, warnings, manifest, checksumState };
}

/**
 * Map a legacy flat-dialect manifest (formatVersion '1.0', flat fields,
 * author as { name, org }) onto the hybrid shape the importer reads
 * (version '1.0.0' + meta.* + dependencies.*). The original flat fields are
 * preserved alongside for transparency.
 */
function upgradeLegacyFlatManifest(flat: any): any {
  const flatAuthor =
    typeof flat.author === 'object' && flat.author !== null
      ? (flat.author as Record<string, unknown>)
      : {};
  const now = new Date().toISOString();
  return {
    ...flat,
    version: '1.0.0',
    meta: {
      id: String(flat.id),
      name: String(flat.name),
      version: typeof flat.version === 'string' ? flat.version : '1.0.0',
      author: typeof flatAuthor.name === 'string' && flatAuthor.name ? flatAuthor.name : 'Unknown',
      created: typeof flat.created === 'string' ? flat.created : now,
      updated: typeof flat.updated === 'string' ? flat.updated : now,
      license: typeof flat.license === 'string' ? flat.license : 'Proprietary',
      tags: Array.isArray(flat.tags) ? flat.tags : [],
      category: typeof flat.area === 'string' && flat.area ? flat.area : 'imported',
      description: typeof flat.description === 'string' ? flat.description : '',
      // Wave 2.8 fidelity: carry icon/color over when the old export had them
      ...(typeof flat.icon === 'string' && flat.icon ? { icon: flat.icon } : {}),
      ...(typeof flat.color === 'string' && flat.color ? { color: flat.color } : {}),
    },
    dependencies: {
      requiredSkills: Array.isArray(flat.dependencies?.skills) ? flat.dependencies.skills : [],
      requiredPersonas: [],
      minAntonVersion: '1.0.0',
    },
    content: {
      systemPromptFile: 'system-prompt.md',
      guidedInputsFile: 'guided-inputs.json',
      defaultConfigFile: 'default-config.json',
    },
  };
}

// ── STEP 3: Content Sanitization ───────────────────────────────

function sanitizeContent(zip: AdmZip): {
  errors: ValidationError[];
  warnings: ValidationWarning[];
  files: Map<string, string>;
} {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  const files = new Map<string, string>();

  // Read system-prompt.md
  const systemPromptEntry = zip.getEntry('system-prompt.md');
  if (systemPromptEntry) {
    let content = systemPromptEntry.getData().toString('utf-8');

    // Sanitize: Remove <script> tags (should never be in Markdown, but be safe)
    if (content.includes('<script')) {
      content = content.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
      warnings.push({
        step: 3,
        severity: 'high',
        message: 'Removed <script> tags from system prompt',
      });
    }

    // Check for HTML event handlers
    if (/<[^>]+(onclick|onerror|onload|onmouseover)=/i.test(content)) {
      warnings.push({
        step: 3,
        severity: 'medium',
        message: 'HTML event handlers detected in system prompt',
        details: 'Event handlers like onclick are not executable but may indicate malicious intent',
      });
    }

    files.set('system-prompt.md', content);
  }

  // Read guided-inputs.json
  const guidedInputsEntry = zip.getEntry('guided-inputs.json');
  if (guidedInputsEntry) {
    try {
      const content = guidedInputsEntry.getData().toString('utf-8');
      JSON.parse(content); // Validate JSON
      files.set('guided-inputs.json', content);
    } catch {
      errors.push({
        step: 3,
        severity: 'high',
        message: 'Invalid JSON in guided-inputs.json',
      });
    }
  }

  // Read default-config.json
  const defaultConfigEntry = zip.getEntry('default-config.json');
  if (defaultConfigEntry) {
    try {
      const content = defaultConfigEntry.getData().toString('utf-8');
      JSON.parse(content); // Validate JSON
      files.set('default-config.json', content);
    } catch {
      errors.push({
        step: 3,
        severity: 'high',
        message: 'Invalid JSON in default-config.json',
      });
    }
  } else {
    // Legacy flat dialect stores the module config in config.json —
    // map it to default-config.json so the importer persists it.
    const legacyConfigEntry = zip.getEntry('config.json');
    if (legacyConfigEntry) {
      try {
        const content = legacyConfigEntry.getData().toString('utf-8');
        JSON.parse(content); // Validate JSON
        files.set('default-config.json', content);
      } catch {
        errors.push({
          step: 3,
          severity: 'high',
          message: 'Invalid JSON in config.json (legacy bundle)',
        });
      }
    }
  }

  return { errors, warnings, files };
}

// ── STEP 4: Injection Scan ─────────────────────────────────────

function scanForInjection(systemPrompt: string): {
  errors: ValidationError[];
  warnings: ValidationWarning[];
} {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Common prompt injection patterns
  const INJECTION_PATTERNS = [
    /ignore (previous|all|the above) instructions?/i,
    /disregard (previous|all) (instructions?|prompts?|rules?)/i,
    /forget (everything|all|previous)/i,
    /new (instruction|directive|task|goal):/i,
    /you are now/i,
    /system:\s*you/i,
    /\[SYSTEM\]/i,
    /sudo mode/i,
  ];

  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(systemPrompt)) {
      warnings.push({
        step: 4,
        severity: 'high',
        message: 'Potential prompt injection pattern detected',
        details: `Pattern: ${pattern.source}`,
      });
    }
  }

  // Excessive repetition (DDoS-style prompt injection)
  const lines = systemPrompt.split('\n');
  const uniqueLines = new Set(lines);
  if (lines.length > 100 && uniqueLines.size < lines.length * 0.3) {
    warnings.push({
      step: 4,
      severity: 'medium',
      message: 'Excessive repetition detected in system prompt',
      details: 'May indicate an attempt to overwhelm the model',
    });
  }

  return { errors, warnings };
}

// ── STEP 5: Dependency Resolution ──────────────────────────────

async function resolveDependencies(
  manifest: any,
  db: DatabaseAdapter
): Promise<{ warnings: ValidationWarning[] }> {
  const warnings: ValidationWarning[] = [];

  if (!manifest?.dependencies) {
    return { warnings };
  }

  const { requiredSkills, requiredPersonas } = manifest.dependencies;

  // Check for missing skills
  if (requiredSkills && requiredSkills.length > 0) {
    for (const skillId of requiredSkills) {
      const exists = await db.get('SELECT id FROM skills WHERE id = ?', skillId);

      if (!exists) {
        warnings.push({
          step: 5,
          severity: 'medium',
          message: `Required skill not found: ${skillId}`,
          details: 'Module will work but may produce suboptimal results without this skill',
        });
      }
    }
  }

  // Check for missing personas
  if (requiredPersonas && requiredPersonas.length > 0) {
    for (const personaId of requiredPersonas) {
      const exists = await db.get('SELECT id FROM personas WHERE id = ?', personaId);

      if (!exists) {
        warnings.push({
          step: 5,
          severity: 'low',
          message: `Required persona not found: ${personaId}`,
          details: 'Consider creating this persona for best results',
        });
      }
    }
  }

  return { warnings };
}
