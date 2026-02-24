import JSZip from 'jszip';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname, normalize } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AREAS_DIR = join(__dirname, '..', 'areas');
const MAX_FILES = 50;

const ALLOWED_TYPES = ['module', 'skill', 'workflow', 'persona', 'area-pack', 'prompt-template'];

const INJECTION_PATTERNS = [
  /ignore\s+previous\s+instructions/i,
  /forget\s+(your|all)/i,
  /override\s+(system|instructions)/i,
  /exfiltrate/i,
  /\[INST\]/i,
  /<\|system\|>/i,
];

export interface ImportResult {
  success: boolean;
  moduleId?: string;
  warnings: string[];
  missingDeps: string[];
  errors: string[];
}

/**
 * Validate an .anton file without installing it.
 * Runs all 5 validation steps and returns results.
 */
export async function validateAntonFile(fileBuffer: Buffer): Promise<ImportResult> {
  const warnings: string[] = [];
  const errors: string[] = [];
  const missingDeps: string[] = [];

  // Step 1: ZIP structure check
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(fileBuffer);
  } catch {
    return { success: false, warnings, missingDeps, errors: ['Invalid zip archive'] };
  }

  const files = Object.keys(zip.files);
  if (files.length > MAX_FILES) {
    errors.push(`Too many files: ${files.length} (max ${MAX_FILES})`);
  }

  // Path traversal check
  for (const name of files) {
    const normalized = normalize(name);
    if (normalized.includes('..') || normalized.startsWith('/') || normalized.startsWith('\\')) {
      errors.push(`Unsafe file path detected: ${name}`);
    }
  }

  if (errors.length > 0) return { success: false, warnings, missingDeps, errors };

  // Step 2: Manifest validation
  const manifestFile = zip.file('manifest.json');
  if (!manifestFile) {
    return { success: false, warnings, missingDeps, errors: ['Missing manifest.json'] };
  }

  let manifest: Record<string, unknown>;
  try {
    manifest = JSON.parse(await manifestFile.async('string'));
  } catch {
    return { success: false, warnings, missingDeps, errors: ['Invalid manifest.json: not valid JSON'] };
  }

  const required = ['formatVersion', 'type', 'id', 'name'];
  for (const field of required) {
    if (!manifest[field]) errors.push(`Missing required field in manifest: ${field}`);
  }
  if (manifest.formatVersion !== '1.0') errors.push(`Unsupported format version: ${manifest.formatVersion}`);
  if (manifest.type && !ALLOWED_TYPES.includes(manifest.type as string))
    errors.push(`Unknown type: ${manifest.type}`);

  if (errors.length > 0) return { success: false, warnings, missingDeps, errors };

  // Step 3: Content validation
  const disallowedExtensions = ['.exe', '.sh', '.bat', '.py', '.js', '.ts'];
  for (const name of files) {
    const lastDot = name.lastIndexOf('.');
    if (lastDot >= 0) {
      const ext = name.substring(lastDot);
      if (disallowedExtensions.includes(ext)) {
        errors.push(`Disallowed file type: ${name}`);
      }
    }
  }

  if (errors.length > 0) return { success: false, warnings, missingDeps, errors };

  // Step 4: Prompt injection scan
  const promptFile = zip.file('system-prompt.md');
  if (promptFile) {
    const promptContent = await promptFile.async('string');
    for (const pattern of INJECTION_PATTERNS) {
      if (pattern.test(promptContent)) {
        warnings.push(
          'Potential prompt injection pattern detected in system-prompt.md. Review carefully before using.',
        );
        break;
      }
    }
  }

  // Step 5: Dependency check
  const deps = ((manifest.dependencies as Record<string, unknown>)?.skills as string[]) || [];
  for (const dep of deps) {
    missingDeps.push(dep);
    warnings.push(`Dependency declared: skill "${dep}" — verify it is installed`);
  }

  const moduleId = manifest.id as string;
  return { success: errors.length === 0, moduleId, warnings, missingDeps, errors };
}

/**
 * Import and install an .anton file.
 * Runs validation first, then writes files to disk.
 */
export async function importAntonFile(fileBuffer: Buffer): Promise<ImportResult> {
  // Run validation first
  const validation = await validateAntonFile(fileBuffer);
  if (!validation.success) return validation;

  // Re-parse zip for installation (validation already confirmed it's valid)
  const zip = await JSZip.loadAsync(fileBuffer);
  const manifest = JSON.parse(await zip.file('manifest.json')!.async('string')) as Record<string, unknown>;

  const moduleId = manifest.id as string;
  const area = (manifest.area as string) || 'custom';

  const moduleDir = join(AREAS_DIR, area, 'modules', moduleId);
  try {
    mkdirSync(moduleDir, { recursive: true });

    const configFile = zip.file('config.json');
    if (configFile) {
      writeFileSync(join(moduleDir, 'module.json'), await configFile.async('string'));
    }

    const promptFile = zip.file('system-prompt.md');
    if (promptFile) {
      writeFileSync(join(moduleDir, 'system-prompt.md'), await promptFile.async('string'));
    }
  } catch (e) {
    return {
      success: false,
      moduleId,
      warnings: validation.warnings,
      missingDeps: validation.missingDeps,
      errors: [`Failed to install module: ${e instanceof Error ? e.message : String(e)}`],
    };
  }

  return { success: true, moduleId, warnings: validation.warnings, missingDeps: validation.missingDeps, errors: [] };
}
