/**
 * anton-importer.ts
 *
 * .anton File Import System
 *
 * Purpose: Import validated .anton files into the local database.
 * Security: Uses 5-step validator, no code execution.
 */

import { validateAntonFile, type ValidationResult } from './anton-validator.js';
import type { Database } from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';

// ── Types ──────────────────────────────────────────────────────

export interface ImportResult {
  success: boolean;
  moduleId?: string;
  validation: ValidationResult;
}

// ── Import Module from .anton File ─────────────────────────────

export async function importAntonFile(
  buffer: Buffer,
  db: Database,
  _userId?: string
): Promise<ImportResult> {
  // Step 1-5: Validate the .anton file
  const validation = await validateAntonFile(buffer, db);

  if (!validation.valid) {
    return {
      success: false,
      validation,
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

  // Generate new ID (don't use manifest ID to avoid conflicts)
  const moduleId = uuidv4();

  // Parse default-config.json — this IS the config blob (personas, outputFormats, skills, model, etc.)
  // Merge in metadata fields so they survive a re-export
  const parsedDefaultConfig = JSON.parse(defaultConfigRaw) as Record<string, unknown>;
  const configBlob = JSON.stringify({
    ...parsedDefaultConfig,
    author: parsedDefaultConfig.author || manifest.meta.author || 'Unknown',
    version: parsedDefaultConfig.version || manifest.meta.version || '1.0.0',
    tags: Array.isArray(parsedDefaultConfig.tags) ? parsedDefaultConfig.tags : (manifest.meta.tags || []),
    guidedInputs: JSON.parse(guidedInputsRaw),
  });

  // Insert using actual custom_modules schema
  try {
    db.prepare(
      `INSERT INTO custom_modules (
        id, name, short_name, description, icon, area,
        system_prompt, config,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      moduleId,
      manifest.meta.name,
      manifest.meta.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30),
      manifest.meta.description || '',
      '📦', // Default icon for imported modules
      manifest.meta.category || 'imported',
      systemPrompt,
      configBlob,
      new Date().toISOString(),
      new Date().toISOString()
    );

    console.log(
      `[anton-importer] Successfully imported module "${manifest.meta.name}" (${moduleId})`
    );

    return {
      success: true,
      moduleId,
      validation,
    };
  } catch (error) {
    console.error('[anton-importer] Database insert failed:', error);

    throw new Error(
      `Failed to import module: ${error instanceof Error ? error.message : 'Unknown database error'}`
    );
  }
}
