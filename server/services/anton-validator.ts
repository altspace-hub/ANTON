/**
 * anton-validator.ts
 *
 * .anton File Security Validation (5-Step Process)
 *
 * Purpose: Validate .anton files before import.
 * Security-first design: No code execution, air-gapped validation.
 *
 * 5-Step Validation:
 * 1. ZIP Integrity Check - Verify ZIP structure, no executables
 * 2. Schema Validation - manifest.json matches v1.0 schema
 * 3. Content Sanitization - Strip dangerous patterns from Markdown
 * 4. Injection Scan - Flag suspicious prompt injection patterns
 * 5. Dependency Resolution - Check for missing skills/personas
 */

import AdmZip from 'adm-zip';
import crypto from 'crypto';
import type { DatabaseAdapter } from '../db/database.js';

// ── Types ──────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
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

// ── Main Validation Function ───────────────────────────────────

export async function validateAntonFile(
  buffer: Buffer,
  db: DatabaseAdapter
):Promise<ValidationResult> {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  let manifest: any = null;
  const files = new Map<string, string>();

  try {
    // STEP 1: ZIP Integrity Check
    const step1 = await validateZipIntegrity(buffer);
    errors.push(...step1.errors);
    warnings.push(...step1.warnings);

    if (step1.errors.length > 0) {
      return { valid: false, errors, warnings };
    }

    // STEP 2: Schema Validation
    const zip = new AdmZip(buffer);
    const step2 = await validateSchema(zip);
    errors.push(...step2.errors);
    warnings.push(...step2.warnings);
    manifest = step2.manifest;

    if (step2.errors.length > 0) {
      return { valid: false, errors, warnings, manifest };
    }

    // STEP 3: Content Sanitization
    const step3 = await sanitizeContent(zip);
    errors.push(...step3.errors);
    warnings.push(...step3.warnings);

    for (const [filename, content] of step3.files.entries()) {
      files.set(filename, content);
    }

    // STEP 4: Injection Scan
    const systemPrompt = files.get('system-prompt.md') || '';
    const step4 = await scanForInjection(systemPrompt);
    errors.push(...step4.errors);
    warnings.push(...step4.warnings);

    // STEP 5: Dependency Resolution
    const step5 = await resolveDependencies(manifest, db);
    warnings.push(...step5.warnings); // Dependencies are warnings, not errors

    // Final verdict
    const valid = errors.length === 0;

    return { valid, errors, warnings, manifest, files };
  } catch (error) {
    errors.push({
      step: 0,
      severity: 'critical',
      message: 'Validation failed with unexpected error',
      details: error instanceof Error ? error.message : 'Unknown error',
    });

    return { valid: false, errors, warnings };
  }
}

// ── STEP 1: ZIP Integrity Check ────────────────────────────────

async function validateZipIntegrity(buffer: Buffer): Promise<{
  errors: ValidationError[];
  warnings: ValidationWarning[];
}> {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  try {
    const zip = new AdmZip(buffer);
    const entries = zip.getEntries();

    if (entries.length === 0) {
      errors.push({
        step: 1,
        severity: 'critical',
        message: 'Empty ZIP archive',
      });
      return { errors, warnings };
    }

    // Check for dangerous file types
    const ALLOWED_EXTENSIONS = ['.json', '.md'];
    const FORBIDDEN_EXTENSIONS = [
      '.exe',
      '.sh',
      '.bat',
      '.cmd',
      '.js',
      '.ts',
      '.jsx',
      '.tsx',
      '.py',
      '.rb',
      '.php',
      '.pl',
      '.ps1',
      '.dll',
      '.so',
      '.dylib',
    ];

    for (const entry of entries) {
      const filename = entry.entryName.toLowerCase();

      // Check forbidden extensions
      for (const ext of FORBIDDEN_EXTENSIONS) {
        if (filename.endsWith(ext)) {
          errors.push({
            step: 1,
            severity: 'critical',
            message: `Forbidden file type detected: ${entry.entryName}`,
            details: `Executable files are not allowed in .anton packages for security reasons.`,
          });
        }
      }

      // Warn on non-standard extensions
      const hasAllowedExt = ALLOWED_EXTENSIONS.some((ext) => filename.endsWith(ext));
      if (!hasAllowedExt && !entry.isDirectory) {
        warnings.push({
          step: 1,
          severity: 'low',
          message: `Unexpected file type: ${entry.entryName}`,
          details: `Only .json and .md files are expected.`,
        });
      }
    }

    // Check for required files
    const hasManifest = entries.some((e) => e.entryName === 'manifest.json');
    const hasSystemPrompt = entries.some((e) => e.entryName === 'system-prompt.md');

    if (!hasManifest) {
      errors.push({
        step: 1,
        severity: 'critical',
        message: 'Missing manifest.json file',
      });
    }

    if (!hasSystemPrompt) {
      errors.push({
        step: 1,
        severity: 'critical',
        message: 'Missing system-prompt.md file',
      });
    }
  } catch (error) {
    errors.push({
      step: 1,
      severity: 'critical',
      message: 'Invalid ZIP file',
      details: error instanceof Error ? error.message : 'Could not read ZIP archive',
    });
  }

  return { errors, warnings };
}

// ── STEP 2: Schema Validation ──────────────────────────────────

async function validateSchema(zip: AdmZip): Promise<{
  errors: ValidationError[];
  warnings: ValidationWarning[];
  manifest: any;
}> {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  let manifest: any = null;

  try {
    const manifestEntry = zip.getEntry('manifest.json');

    if (!manifestEntry) {
      errors.push({
        step: 2,
        severity: 'critical',
        message: 'manifest.json not found',
      });
      return { errors, warnings, manifest };
    }

    const manifestContent = manifestEntry.getData().toString('utf-8');
    manifest = JSON.parse(manifestContent);

    // Validate required fields
    if (!manifest.version || manifest.version !== '1.0.0') {
      errors.push({
        step: 2,
        severity: 'critical',
        message: 'Invalid or unsupported manifest version',
        details: `Expected version 1.0.0, got ${manifest.version || 'undefined'}`,
      });
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
          errors.push({
            step: 2,
            severity: 'high',
            message: 'Checksum mismatch',
            details: 'File contents do not match the declared checksum. File may be corrupted or tampered.',
          });
        }
      }
    }
  } catch (error) {
    errors.push({
      step: 2,
      severity: 'critical',
      message: 'Failed to parse manifest.json',
      details: error instanceof Error ? error.message : 'Invalid JSON',
    });
  }

  return { errors, warnings, manifest };
}

// ── STEP 3: Content Sanitization ───────────────────────────────

async function sanitizeContent(zip: AdmZip): Promise<{
  errors: ValidationError[];
  warnings: ValidationWarning[];
  files: Map<string, string>;
}> {
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
  }

  return { errors, warnings, files };
}

// ── STEP 4: Injection Scan ─────────────────────────────────────

async function scanForInjection(systemPrompt: string): Promise<{
  errors: ValidationError[];
  warnings: ValidationWarning[];
}> {
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
):Promise<{ warnings: ValidationWarning[] }> {
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
