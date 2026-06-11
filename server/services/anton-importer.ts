/**
 * anton-importer.ts
 *
 * .anton File Import System (module bundles)
 *
 * Purpose: Import validated module .anton files into the local database.
 * Security: Uses the dispatching validator, no code execution.
 *
 * Non-module bundle types pass STRUCTURAL validation but are not installable
 * here — they belong to their own import surfaces (knowledge packs, portals,
 * school, markets, …); the importer returns a friendly redirect error.
 */

import { validateAntonFile, type ValidationResult } from './anton-validator.js';
import type { DatabaseAdapter } from '../db/database.js';
import crypto from 'crypto';

// ── Types ──────────────────────────────────────────────────────

export interface ImportResult {
  success: boolean;
  moduleId?: string;
  /** True when {keepId: true} was honored (original id was free) — Wave 2.8 */
  keptOriginalId?: boolean;
  validation: ValidationResult;
}

export interface ImportOptions {
  /**
   * Keep the module's original id when it does not collide with an existing
   * custom module (Wave 2.8). Default false: generate custom-XXXXXXXX.
   */
  keepId?: boolean;
}

/** ids must look like module ids before we agree to keep them */
const SAFE_MODULE_ID = /^[a-z0-9][a-z0-9_-]{2,63}$/i;

// ── Import Module from .anton File ─────────────────────────────

export async function importAntonFile(
  buffer: Buffer,
  db: DatabaseAdapter,
  _userId?: string,
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

  const systemPrompt = files.get('system-prompt.md') || '';
  const guidedInputsRaw = files.get('guided-inputs.json') || '[]';
  const defaultConfigRaw = files.get('default-config.json') || '{}';

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

  // Parse default-config.json — this IS the config blob (personas, outputFormats, skills, model, etc.)
  // Merge in metadata fields so they survive a re-export
  const parsedDefaultConfig = JSON.parse(defaultConfigRaw) as Record<string, unknown>;
  const configBlob = JSON.stringify({
    ...parsedDefaultConfig,
    author: parsedDefaultConfig.author || manifest.meta.author || 'Unknown',
    version: parsedDefaultConfig.version || manifest.meta.version || '1.0.0',
    tags: Array.isArray(parsedDefaultConfig.tags) ? parsedDefaultConfig.tags : (manifest.meta.tags || []),
    guidedInputs: JSON.parse(guidedInputsRaw),
    // custom_modules has no color column — color rides in the config blob
    // so it survives a re-export (buildModuleAntonArchive reads it back).
    ...(color ? { color } : {}),
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
      `[anton-importer] Successfully imported module "${manifest.meta.name}" (${moduleId}${keptOriginalId ? ', original id kept' : ''})`
    );

    return {
      success: true,
      moduleId,
      keptOriginalId,
      validation,
    };
  } catch (error) {
    console.error('[anton-importer] Database insert failed:', error);

    throw new Error(
      `Failed to import module: ${error instanceof Error ? error.message : 'Unknown database error'}`
    );
  }
}
