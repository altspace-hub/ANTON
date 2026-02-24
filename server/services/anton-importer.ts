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
  userId: string
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
  const guidedInputs = files.get('guided-inputs.json') || '[]';
  const defaultConfig = files.get('default-config.json') || '{}';

  // Generate new ID (don't use manifest ID to avoid conflicts)
  const moduleId = uuidv4();

  // Insert into database
  try {
    db.prepare(
      `INSERT INTO custom_modules (
        id, user_id, name, description, icon, color,
        system_prompt, guided_inputs, default_config,
        author, version, tags, category,
        is_community_shared, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      moduleId,
      userId,
      manifest.meta.name,
      manifest.meta.description || '',
      '📦', // Default icon for imported modules
      '#2DD4A8', // Default color
      systemPrompt,
      guidedInputs,
      defaultConfig,
      manifest.meta.author || 'Unknown',
      manifest.meta.version || '1.0.0',
      JSON.stringify(manifest.meta.tags || []),
      manifest.meta.category || 'imported',
      0, // Not community-shared by default
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
