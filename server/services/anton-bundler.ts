/**
 * anton-bundler.ts
 *
 * .anton File Export System
 *
 * Purpose: Bundle custom modules into .anton files (ZIP archives) for sharing.
 * Security: Only JSON and Markdown files, no code execution.
 *
 * .anton file structure:
 * ├── manifest.json          - Module metadata
 * ├── system-prompt.md       - Main system prompt
 * ├── guided-inputs.json     - Input field definitions
 * ├── default-config.json    - Default module configuration
 * └── CHANGELOG.md           - Version history (optional)
 */

import AdmZip from 'adm-zip';
import crypto from 'crypto';
import type { Database } from 'better-sqlite3';

// ── Types ──────────────────────────────────────────────────────

/** All bundle types in the .anton format registry */
export type AntonBundleType =
  | 'module'
  | 'skill'
  | 'persona'
  | 'workflow'
  | 'skill-pack'
  | 'coding-blueprint'
  | 'coding-review-profile'
  | 'script-lite-template'
  | 'script-medium-template'
  | 'instruction-builder-project'
  | 'compliance-ruleset'
  | 'radar-config'
  | 'quality-baseline'
  | 'brand-template'
  | 'output-chain'
  | 'review-panel'
  | 'project-template'
  | 'audience-profile';

/** Registry entry — describes a bundle type without needing full handler objects */
interface BundleTypeEntry {
  label: string;
  description: string;
  contentsKey: string;          // key in the `contents` count object
  primaryContentDir: string;    // subdirectory under contents/ (e.g. 'modules')
}

export const BUNDLE_TYPE_REGISTRY: Record<AntonBundleType, BundleTypeEntry> = {
  'module':                       { label: 'Expert Module',             description: 'Custom expert module with system prompt and config', contentsKey: 'modules',              primaryContentDir: 'modules' },
  'skill':                        { label: 'Skill',                     description: 'Reusable prompt fragment',                          contentsKey: 'skills',               primaryContentDir: 'skills' },
  'persona':                      { label: 'Persona',                   description: 'Expert persona definition',                         contentsKey: 'personas',             primaryContentDir: 'personas' },
  'workflow':                     { label: 'Workflow',                   description: 'Multi-step workflow template',                      contentsKey: 'workflows',            primaryContentDir: 'workflows' },
  'skill-pack':                   { label: 'Skill Pack',                 description: 'Curated bundle of modules and workflows',           contentsKey: 'skill_packs',          primaryContentDir: 'skill-packs' },
  'coding-blueprint':             { label: 'Coding Blueprint',           description: 'Full software project template',                    contentsKey: 'coding_blueprints',    primaryContentDir: 'coding-blueprints' },
  'coding-review-profile':        { label: 'Code Review Profile',        description: 'Code review lens configuration',                    contentsKey: 'coding_review_profiles', primaryContentDir: 'coding-review-profiles' },
  'script-lite-template':         { label: 'Script Lite Template',       description: 'Data analysis script template',                     contentsKey: 'script_lite_templates', primaryContentDir: 'script-lite-templates' },
  'script-medium-template':       { label: 'Script Medium Template',     description: 'Multi-file application template',                   contentsKey: 'script_medium_templates', primaryContentDir: 'script-medium-templates' },
  'instruction-builder-project':  { label: 'Instruction Builder Project', description: 'AI tool instruction set project',                  contentsKey: 'instruction_builder_projects', primaryContentDir: 'instruction-builder-projects' },
  'compliance-ruleset':           { label: 'Compliance Ruleset',         description: 'Custom compliance rule configuration',              contentsKey: 'compliance_rulesets',  primaryContentDir: 'compliance-rulesets' },
  'radar-config':                 { label: 'Radar Configuration',        description: 'Regulatory radar source configuration',             contentsKey: 'radar_configs',        primaryContentDir: 'radar-configs' },
  'quality-baseline':             { label: 'Quality Baseline',           description: 'Quality thresholds per module/area',                contentsKey: 'quality_baselines',    primaryContentDir: 'quality-baselines' },
  'brand-template':               { label: 'Brand Template',             description: 'Export styling and branding configuration',         contentsKey: 'brand_templates',      primaryContentDir: 'brand-templates' },
  'output-chain':                 { label: 'Output Chain',               description: 'Sequential module chain for document production',   contentsKey: 'output_chains',        primaryContentDir: 'output-chains' },
  'review-panel':                 { label: 'Review Panel',               description: 'Expert review perspective configuration',           contentsKey: 'review_panels',        primaryContentDir: 'review-panels' },
  'project-template':             { label: 'Project Template',           description: 'Complete project setup with all components',        contentsKey: 'project_templates',    primaryContentDir: 'project-templates' },
  'audience-profile':             { label: 'Audience Profile',           description: 'Stakeholder communication adaptation profile',      contentsKey: 'audience_profiles',    primaryContentDir: 'audience-profiles' },
};

interface ModuleExportData {
  id: string;
  name: string;
  description: string;
  icon?: string;
  color?: string;
  systemPrompt: string;
  guidedInputs?: any[];
  defaultConfig?: any;
  author?: string;
  version?: string;
  tags?: string[];
  category?: string;
  createdAt?: string;
  updatedAt?: string;
}

/** Spec-compliant manifest for any .anton bundle */
interface SpecManifest {
  format_version: '1.0.0';
  bundle_type: AntonBundleType;
  package: {
    id: string;
    name: string;
    version: string;
    author: { name: string; organization: string; email: string; url: string };
    license: string;
    created_at: string;
    updated_at: string;
    tags: string[];
    target_areas: string[];
    target_roles: string[];
    min_platform_version: string;
    languages: string[];
    description: string;
  };
  contents: Record<string, number>;
  compatibility: { llm_providers: string[] };
}

/** Legacy manifest kept for backward compat with anton-importer.ts */
interface AntonManifest extends SpecManifest {
  // Legacy fields read by anton-importer.ts and anton-validator.ts
  version: '1.0.0';
  meta: {
    id: string;
    name: string;
    version: string;
    author: string;
    created: string;
    updated: string;
    license: string;
    tags: string[];
    category: string;
    description: string;
  };
  dependencies: {
    requiredSkills: string[];
    requiredPersonas: string[];
    minAntonVersion: string;
  };
  security: {
    checksum: string;
    signedBy?: string;
  };
  content: {
    systemPromptFile: 'system-prompt.md';
    guidedInputsFile: 'guided-inputs.json';
    defaultConfigFile: 'default-config.json';
  };
}

// ── Spec Manifest Builder ───────────────────────────────────────

/**
 * Build the spec-compliant portion of an .anton manifest.
 * Used by all new bundle type functions.
 */
function buildSpecManifest(params: {
  bundleType: AntonBundleType;
  id: string;
  name: string;
  description?: string;
  version?: string;
  author?: string;
  organization?: string;
  tags?: string[];
  contentsCount?: Record<string, number>;
  createdAt?: string;
  updatedAt?: string;
}): SpecManifest {
  const now = new Date().toISOString();
  const registry = BUNDLE_TYPE_REGISTRY[params.bundleType];
  const contents: Record<string, number> = {
    modules: 0, skills: 0, personas: 0, workflows: 0,
    compliance_rulesets: 0, radar_configs: 0, quality_baselines: 0,
    review_panels: 0, audience_profiles: 0, output_chains: 0, brand_templates: 0,
    ...params.contentsCount,
    [registry.contentsKey]: (params.contentsCount?.[registry.contentsKey] ?? 1),
  };
  return {
    format_version: '1.0.0',
    bundle_type: params.bundleType,
    package: {
      id: `com.openexpert.${params.bundleType}.${params.id}`,
      name: params.name,
      version: params.version || '1.0.0',
      author: {
        name: params.author || 'Unknown',
        organization: params.organization || '',
        email: '',
        url: '',
      },
      license: 'Proprietary',
      created_at: params.createdAt || now,
      updated_at: params.updatedAt || now,
      tags: params.tags || [],
      target_areas: [],
      target_roles: [],
      min_platform_version: '2.0.0',
      languages: ['en'],
      description: params.description || '',
    },
    contents,
    compatibility: { llm_providers: ['anthropic'] },
  };
}

// ── Bundle Module to .anton File ───────────────────────────────

export async function bundleModuleToAnton(
  db: Database,
  moduleId: string
): Promise<Buffer> {
  // Fetch module from database using actual custom_modules schema
  const module = db
    .prepare(
      `SELECT id, name, short_name, description, icon, area,
              system_prompt, config, created_at, updated_at
       FROM custom_modules
       WHERE id = ?`
    )
    .get(moduleId) as Record<string, unknown> | undefined;

  if (!module) {
    throw new Error('Module not found');
  }

  // Parse config blob (stores model defaults, tags, etc.)
  const configBlob: Record<string, unknown> =
    module.config && typeof module.config === 'string'
      ? (JSON.parse(module.config) as Record<string, unknown>)
      : {};

  // The config blob IS the default config (personas, output formats, skills, model settings, etc.)
  // Extract any extra fields that have their own top-level keys, use the rest as defaultConfig
  const exportData: ModuleExportData = {
    id: module.id as string,
    name: module.name as string,
    description: (module.description as string) || '',
    icon: (module.icon as string) || '📦',
    color: '#2DD4A8',
    systemPrompt: (module.system_prompt as string) || '',
    guidedInputs: (configBlob.guidedInputs as unknown[]) || [],
    // The full config blob (personas, outputFormats, skills, model, thinking, etc.) goes into defaultConfig
    defaultConfig: configBlob,
    author: (configBlob.author as string) || 'Unknown',
    version: (configBlob.version as string) || '1.0.0',
    tags: Array.isArray(configBlob.tags) ? (configBlob.tags as string[]) : [],
    category: (module.area as string) || 'custom',
    createdAt: module.created_at as string,
    updatedAt: module.updated_at as string,
  };

  // Create ZIP archive
  const zip = new AdmZip();

  // 1. Add system-prompt.md
  const systemPromptContent = exportData.systemPrompt;
  zip.addFile('system-prompt.md', Buffer.from(systemPromptContent, 'utf-8'));

  // 2. Add guided-inputs.json
  const guidedInputsContent = JSON.stringify(exportData.guidedInputs || [], null, 2);
  zip.addFile('guided-inputs.json', Buffer.from(guidedInputsContent, 'utf-8'));

  // 3. Add default-config.json
  const defaultConfigContent = JSON.stringify(exportData.defaultConfig || {}, null, 2);
  zip.addFile('default-config.json', Buffer.from(defaultConfigContent, 'utf-8'));

  // 4. Create manifest.json
  const manifestContent = JSON.stringify(
    {
      checksum: '', // Will be calculated after all files added
      systemPromptFile: 'system-prompt.md',
      guidedInputsFile: 'guided-inputs.json',
      defaultConfigFile: 'default-config.json',
    },
    null,
    2
  );

  // Calculate checksum of all content
  const contentHash = crypto.createHash('sha256');
  contentHash.update(systemPromptContent);
  contentHash.update(guidedInputsContent);
  contentHash.update(defaultConfigContent);
  const checksum = contentHash.digest('hex');

  // Build final manifest — spec-compliant fields + legacy fields for backward compat with importer
  const specPart = buildSpecManifest({
    bundleType: 'module',
    id: exportData.id,
    name: exportData.name,
    description: exportData.description,
    version: exportData.version,
    author: exportData.author,
    tags: exportData.tags,
    contentsCount: { modules: 1 },
    createdAt: exportData.createdAt,
    updatedAt: exportData.updatedAt,
  });
  const manifest: AntonManifest = {
    ...specPart,
    // Legacy fields: validator checks manifest.version, importer reads manifest.meta.*
    version: '1.0.0',
    meta: {
      id: exportData.id,
      name: exportData.name,
      version: exportData.version || '1.0.0',
      author: exportData.author || 'Unknown',
      created: exportData.createdAt || new Date().toISOString(),
      updated: exportData.updatedAt || new Date().toISOString(),
      license: 'Proprietary',
      tags: exportData.tags || [],
      category: exportData.category || 'custom',
      description: exportData.description || '',
    },
    dependencies: {
      requiredSkills: extractSkillDependencies(exportData.systemPrompt),
      requiredPersonas: extractPersonaDependencies(exportData.systemPrompt),
      minAntonVersion: '1.0.0',
    },
    security: {
      checksum: `sha256:${checksum}`,
    },
    content: {
      systemPromptFile: 'system-prompt.md',
      guidedInputsFile: 'guided-inputs.json',
      defaultConfigFile: 'default-config.json',
    },
  };

  zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8'));

  // 5. Add CHANGELOG.md (optional)
  const changelog = generateChangelog(exportData);
  zip.addFile('CHANGELOG.md', Buffer.from(changelog, 'utf-8'));

  // Generate ZIP buffer
  const buffer = zip.toBuffer();

  console.log(
    `[anton-bundler] Created .anton file for module "${exportData.name}" (${buffer.length} bytes)`
  );

  return buffer;
}

// ── Coding Area Bundle Exports ──────────────────────────────────

/**
 * Bundle a code review profile as a .anton file.
 * Contains the review configuration (lenses, explanation level, security mode).
 */
export async function bundleCodingReviewProfile(
  db: Database,
  sessionId: string
): Promise<Buffer> {
  const session = db
    .prepare('SELECT * FROM code_review_sessions WHERE id = ?')
    .get(sessionId) as any;

  if (!session) {
    throw new Error('Code review session not found');
  }

  const reviewLenses = safeJsonParse(session.review_lenses, []);
  const fileHashes = safeJsonParse(session.file_hashes, {});
  const findingsSummary = safeJsonParse(session.findings_summary, {});
  const tokensConsumed = safeJsonParse(session.tokens_consumed, { input: 0, output: 0, cost_usd: 0 });

  const zip = new AdmZip();

  // manifest.json
  const manifest = {
    bundle_type: 'coding-review-profile' as AntonBundleType,
    type: 'coding-review-profile',
    version: '1.0.0',
    created: session.created_at || new Date().toISOString(),
    review_lenses: reviewLenses,
    explanation_level: session.explanation_level || 'medium',
    security_mode: session.security_mode || null,
    source_type: session.source_type,
    is_diff_review: !!session.is_diff_review,
  };
  zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8'));

  // config.json — full review configuration
  const config = {
    source_type: session.source_type,
    source_path: session.source_path,
    source_url: session.source_url,
    explanation_level: session.explanation_level,
    review_lenses: reviewLenses,
    security_mode: session.security_mode,
    file_hashes: fileHashes,
    findings_summary: findingsSummary,
    tokens_consumed: tokensConsumed,
    previous_session_id: session.previous_session_id,
  };
  zip.addFile('config.json', Buffer.from(JSON.stringify(config, null, 2), 'utf-8'));

  // README.md
  const readme = `# Code Review Profile

## Overview
This .anton file contains a code review profile exported from the FCP Workbench Coding area.

## Configuration
- **Source type:** ${session.source_type}
- **Explanation level:** ${session.explanation_level || 'medium'}
- **Review lenses:** ${reviewLenses.join(', ') || 'default'}
- **Security mode:** ${session.security_mode || 'none'}

## Files
- \`manifest.json\` — Profile metadata and type identifier
- \`config.json\` — Full review configuration including findings summary
- \`README.md\` — This file

## Usage
Import this profile into the FCP Workbench to reuse the same review configuration
for future code reviews. The profile preserves your selected lenses, explanation depth,
and security framework settings.

---
**Exported via ANTON**
`;
  zip.addFile('README.md', Buffer.from(readme, 'utf-8'));

  const buffer = zip.toBuffer();
  console.log(`[anton-bundler] Created review profile bundle for session "${sessionId}" (${buffer.length} bytes)`);
  return buffer;
}

/**
 * Bundle a Script Lite template as a .anton file.
 * Contains a generated Python script with requirements.
 */
export async function bundleScriptLiteTemplate(
  db: Database,
  sessionId: string
): Promise<Buffer> {
  const session = db
    .prepare('SELECT * FROM sessions WHERE id = ?')
    .get(sessionId) as any;

  if (!session) {
    throw new Error('Session not found');
  }

  const zip = new AdmZip();

  // Try to extract script content from session messages
  let scriptContent = '# Generated script\n# No script content found in session\n';
  let requirements = '';
  let description = session.summary || 'Script Lite template';

  // Look for the latest assistant message containing Python code blocks
  const messages = db
    .prepare("SELECT content, role FROM messages WHERE session_id = ? ORDER BY created_at DESC")
    .all(sessionId) as Array<{ content: string; role: string }>;

  for (const msg of messages) {
    if (msg.role === 'assistant' && msg.content) {
      // Extract Python code blocks
      const pyMatch = msg.content.match(/```python\n([\s\S]*?)```/);
      if (pyMatch) {
        scriptContent = pyMatch[1];
      }
      // Extract requirements if mentioned
      const reqMatch = msg.content.match(/```(?:text|requirements\.txt)\n([\s\S]*?)```/);
      if (reqMatch) {
        requirements = reqMatch[1];
      }
      if (pyMatch) break; // Use the first assistant message with Python
    }
  }

  // manifest.json
  const manifest = {
    bundle_type: 'script-lite-template' as AntonBundleType,
    type: 'script-lite-template',
    version: '1.0.0',
    description,
    created: session.created_at || new Date().toISOString(),
    session_id: sessionId,
  };
  zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8'));

  // script.py
  zip.addFile('script.py', Buffer.from(scriptContent, 'utf-8'));

  // requirements.txt
  zip.addFile('requirements.txt', Buffer.from(requirements || '# No dependencies identified\n', 'utf-8'));

  // README.md
  const readme = `# Script Lite Template

## Description
${description}

## Files
- \`manifest.json\` — Template metadata
- \`script.py\` — The generated Python script
- \`requirements.txt\` — Python package dependencies

## Usage
1. Install dependencies: \`pip install -r requirements.txt\`
2. Run the script: \`python script.py\`

## Notes
This script was generated by the FCP Workbench Script Lite module.
Always review generated scripts before executing them in a production environment.

---
**Exported via ANTON**
`;
  zip.addFile('README.md', Buffer.from(readme, 'utf-8'));

  const buffer = zip.toBuffer();
  console.log(`[anton-bundler] Created script-lite bundle for session "${sessionId}" (${buffer.length} bytes)`);
  return buffer;
}

/**
 * Bundle a Script Medium template as a .anton file.
 * Contains generated source files for a multi-file application.
 */
export async function bundleScriptMediumTemplate(
  db: Database,
  sessionId: string
): Promise<Buffer> {
  const session = db
    .prepare('SELECT * FROM sessions WHERE id = ?')
    .get(sessionId) as any;

  if (!session) {
    throw new Error('Session not found');
  }

  const zip = new AdmZip();

  let description = session.summary || 'Script Medium template';
  let appType = 'unknown';
  let fileCount = 0;

  // Extract code files from assistant messages
  const messages = db
    .prepare("SELECT content, role FROM messages WHERE session_id = ? ORDER BY created_at ASC")
    .all(sessionId) as Array<{ content: string; role: string }>;

  const extractedFiles: Array<{ path: string; content: string }> = [];

  for (const msg of messages) {
    if (msg.role === 'assistant' && msg.content) {
      // Match code blocks with file path annotations: ```lang:path/to/file or ### File: path/to/file
      const fileBlockRegex = /(?:###?\s*(?:File|file):\s*`?([^\n`]+)`?\n)?```(\w+)?\n([\s\S]*?)```/g;
      let match;
      while ((match = fileBlockRegex.exec(msg.content)) !== null) {
        const filePath = match[1]?.trim();
        const lang = match[2] || '';
        const content = match[3];
        if (filePath && content) {
          extractedFiles.push({ path: filePath, content });
        }
      }

      // Detect app type from content
      if (msg.content.includes('Flask') || msg.content.includes('flask')) appType = 'flask';
      else if (msg.content.includes('FastAPI') || msg.content.includes('fastapi')) appType = 'fastapi';
      else if (msg.content.includes('Express') || msg.content.includes('express')) appType = 'express';
      else if (msg.content.includes('React') || msg.content.includes('react')) appType = 'react';
    }
  }

  fileCount = extractedFiles.length;

  // manifest.json
  const manifest = {
    bundle_type: 'script-medium-template' as AntonBundleType,
    type: 'script-medium-template',
    version: '1.0.0',
    description,
    app_type: appType,
    file_count: fileCount,
    created: session.created_at || new Date().toISOString(),
    session_id: sessionId,
  };
  zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8'));

  // Add extracted source files under src/
  if (extractedFiles.length > 0) {
    for (const file of extractedFiles) {
      const safePath = file.path.replace(/\.\./g, '').replace(/^\//, '');
      zip.addFile(`src/${safePath}`, Buffer.from(file.content, 'utf-8'));
    }
  } else {
    zip.addFile('src/.gitkeep', Buffer.from('', 'utf-8'));
  }

  // README.md
  const readme = `# Script Medium Template

## Description
${description}

## Application Type
${appType}

## Files
- \`manifest.json\` — Template metadata
- \`src/\` — Generated source files (${fileCount} files)
- \`README.md\` — This file

## Usage
Review the generated files in the \`src/\` directory. Follow any setup instructions
provided in the original session for running and deploying this application.

## Notes
This template was generated by the FCP Workbench Script Medium module.
Always review generated code before deploying to production.

---
**Exported via ANTON**
`;
  zip.addFile('README.md', Buffer.from(readme, 'utf-8'));

  const buffer = zip.toBuffer();
  console.log(`[anton-bundler] Created script-medium bundle for session "${sessionId}" (${buffer.length} bytes)`);
  return buffer;
}

/**
 * Bundle a Coding Large project blueprint as a .anton file.
 * Contains the full project documentation: discovery, architecture, baseline,
 * releases, tasks, tech debt, and reviews.
 */
export async function bundleCodingLargeBlueprint(
  db: Database,
  projectId: string
): Promise<Buffer> {
  const project = db
    .prepare('SELECT * FROM coding_projects WHERE id = ?')
    .get(projectId) as any;

  if (!project) {
    throw new Error('Coding project not found');
  }

  const zip = new AdmZip();

  // Fetch related data
  const releases = db
    .prepare('SELECT * FROM coding_releases WHERE coding_project_id = ? ORDER BY release_number ASC')
    .all(projectId) as any[];

  const tasks = db
    .prepare('SELECT * FROM coding_tasks WHERE coding_project_id = ? ORDER BY sort_order ASC')
    .all(projectId) as any[];

  const techDebt = db
    .prepare('SELECT * FROM coding_tech_debt WHERE coding_project_id = ? ORDER BY created_at ASC')
    .all(projectId) as any[];

  const reviews = db
    .prepare('SELECT * FROM coding_reviews WHERE coding_project_id = ? ORDER BY created_at ASC')
    .all(projectId) as any[];

  // manifest.json
  const manifest = {
    bundle_type: 'coding-blueprint' as AntonBundleType,
    type: 'coding-large-blueprint',
    version: '1.0.0',
    project_id: project.id,
    project_name: project.name,
    tier: project.tier,
    status: project.status,
    current_phase: project.current_phase,
    created: project.created_at,
    updated: project.updated_at,
    release_count: releases.length,
    task_count: tasks.length,
    tech_debt_count: techDebt.length,
    review_count: reviews.length,
  };
  zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8'));

  // discovery.md
  const discoveryContent = project.discovery_summary || '# Discovery\n\nNo discovery summary available yet.';
  zip.addFile('discovery.md', Buffer.from(discoveryContent, 'utf-8'));

  // architecture.md
  const architectureContent = project.architecture_summary || '# Architecture\n\nNo architecture summary available yet.';
  zip.addFile('architecture.md', Buffer.from(architectureContent, 'utf-8'));

  // baseline.md
  const baselineContent = project.baseline_summary || '# Baseline\n\nNo baseline assessment available yet.';
  zip.addFile('baseline.md', Buffer.from(baselineContent, 'utf-8'));

  // releases.json — release configs with their tasks
  const releasesWithTasks = releases.map((r: any) => {
    const releaseTasks = tasks.filter((t: any) => t.coding_release_id === r.id);
    return {
      ...r,
      acceptance_criteria: safeJsonParse(r.acceptance_criteria, []),
      test_plan: safeJsonParse(r.test_plan, {}),
      complexity_estimate: safeJsonParse(r.complexity_estimate, {}),
      complexity_actual: safeJsonParse(r.complexity_actual, {}),
      review_required_personas: safeJsonParse(r.review_required_personas, []),
      tasks: releaseTasks.map((t: any) => ({
        ...t,
        acceptance_criteria: safeJsonParse(t.acceptance_criteria, []),
        depends_on: safeJsonParse(t.depends_on, []),
        blocks: safeJsonParse(t.blocks, []),
        file_manifest: safeJsonParse(t.file_manifest, {}),
        progress_log: safeJsonParse(t.progress_log, []),
        tokens_consumed: safeJsonParse(t.tokens_consumed, { input: 0, output: 0, cost_usd: 0 }),
      })),
    };
  });
  zip.addFile('releases.json', Buffer.from(JSON.stringify(releasesWithTasks, null, 2), 'utf-8'));

  // tech-debt.json
  zip.addFile('tech-debt.json', Buffer.from(JSON.stringify(techDebt, null, 2), 'utf-8'));

  // reviews.json
  const parsedReviews = reviews.map((r: any) => ({
    ...r,
    severity_summary: safeJsonParse(r.severity_summary, {}),
    tokens_consumed: safeJsonParse(r.tokens_consumed, { input: 0, output: 0, cost_usd: 0 }),
  }));
  zip.addFile('reviews.json', Buffer.from(JSON.stringify(parsedReviews, null, 2), 'utf-8'));

  // README.md
  const techStack = safeJsonParse(project.tech_stack, []);
  const costEstimate = safeJsonParse(project.cost_estimate, {});
  const readme = `# ${project.name} — Project Blueprint

## Overview
${project.description || 'No description available.'}

## Project Details
- **Tier:** ${project.tier}
- **Status:** ${project.status}
- **Current Phase:** ${project.current_phase}
- **Directory:** ${project.directory_path || 'Not set'}
- **Tech Stack:** ${Array.isArray(techStack) ? techStack.join(', ') || 'Not identified' : 'Not identified'}

## Blueprint Contents
- \`manifest.json\` — Project metadata and statistics
- \`discovery.md\` — Discovery phase findings and project goals
- \`architecture.md\` — Architecture decisions and system design
- \`baseline.md\` — Codebase baseline assessment
- \`releases.json\` — Release configurations with tasks (${releases.length} releases, ${tasks.length} tasks)
- \`tech-debt.json\` — Technical debt register (${techDebt.length} items)
- \`reviews.json\` — Review records (${reviews.length} reviews)

## Usage
This blueprint captures the complete state of a Coding Large project.
Import it into the FCP Workbench to restore the project configuration,
or use the documentation files as reference for manual implementation.

### Releases
${releases.map((r: any) => `- **Release ${r.release_number}:** ${r.name} (${r.status})`).join('\n') || 'No releases planned yet.'}

### Tech Debt Summary
- Open items: ${techDebt.filter((td: any) => td.status === 'open').length}
- In progress: ${techDebt.filter((td: any) => td.status === 'in_progress').length}
- Resolved: ${techDebt.filter((td: any) => td.status === 'resolved').length}

---
**Exported via ANTON**
`;
  zip.addFile('README.md', Buffer.from(readme, 'utf-8'));

  const buffer = zip.toBuffer();
  console.log(`[anton-bundler] Created coding-large blueprint for project "${project.name}" (${buffer.length} bytes)`);
  return buffer;
}

/**
 * Bundle an Instruction Builder project as a .anton file.
 * Contains the full project documentation: vision, discovery, architecture,
 * expert reviews, and generated instruction files.
 */
export async function bundleInstructionBuilderProject(
  db: Database,
  projectId: string
): Promise<Buffer> {
  const project = db
    .prepare('SELECT * FROM instruction_builder_projects WHERE id = ?')
    .get(projectId) as any;

  if (!project) {
    throw new Error('Instruction Builder project not found');
  }

  const zip = new AdmZip();

  // Fetch instruction files
  const instructionFiles = db
    .prepare('SELECT * FROM instruction_files WHERE instruction_builder_project_id = ? ORDER BY file_type ASC, filename ASC')
    .all(projectId) as any[];

  // Fetch tool profile
  const toolProfile = project.tool_profile_id
    ? db.prepare('SELECT * FROM tool_profiles WHERE id = ?').get(project.tool_profile_id)
    : db.prepare('SELECT * FROM tool_profiles WHERE tool_name = ? AND is_default = 1').get(project.target_tool);

  // Fetch reviews
  const reviews = db
    .prepare('SELECT * FROM coding_reviews WHERE coding_project_id = ? ORDER BY created_at ASC')
    .all(project.coding_project_id || project.id) as any[];

  // manifest.json
  const manifest = {
    bundle_type: 'instruction-builder-project' as AntonBundleType,
    type: 'instruction-builder-project',
    version: '1.0.0',
    project_id: project.id,
    project_name: project.name,
    target_tool: project.target_tool,
    status: project.status,
    review_cycle_count: project.review_cycle_count,
    created: project.created_at,
    updated: project.updated_at,
    instruction_file_count: instructionFiles.length,
    review_count: reviews.length,
  };
  zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8'));

  // VISION_AND_GOALS.md
  const visionGoals = safeJsonParse(project.vision_goals, {});
  const visionContent = `# Vision & Goals\n\n${JSON.stringify(visionGoals, null, 2)}`;
  zip.addFile('VISION_AND_GOALS.md', Buffer.from(visionContent, 'utf-8'));

  // DISCOVERY_NOTES.md
  const discoveryNotes = safeJsonParse(project.discovery_notes, {});
  const discoveryContent = `# Discovery Notes\n\n${JSON.stringify(discoveryNotes, null, 2)}`;
  zip.addFile('DISCOVERY_NOTES.md', Buffer.from(discoveryContent, 'utf-8'));

  // ARCHITECTURE_PROPOSAL.md
  const archContent = project.architecture_proposal || '# Architecture Proposal\n\nNo architecture proposal generated yet.';
  zip.addFile('ARCHITECTURE_PROPOSAL.md', Buffer.from(archContent, 'utf-8'));

  // expert-reviews/
  for (const review of reviews) {
    const reviewContent = `# ${review.reviewer_persona_id} Review\n\n**Type:** ${review.review_type}\n**Verdict:** ${review.verdict}\n\n${review.findings || 'No findings recorded.'}`;
    const safeName = (review.reviewer_persona_id || 'unknown').replace(/[^a-zA-Z0-9-_]/g, '_');
    zip.addFile(`expert-reviews/${safeName}.md`, Buffer.from(reviewContent, 'utf-8'));
  }

  // exports/{tool-name}/
  for (const file of instructionFiles) {
    zip.addFile(`exports/${project.target_tool}/${file.filename}`, Buffer.from(file.content, 'utf-8'));
  }

  // tool-profile.json
  if (toolProfile) {
    zip.addFile('tool-profile.json', Buffer.from(JSON.stringify(toolProfile, null, 2), 'utf-8'));
  }

  // README.md
  const readme = `# ${project.name} — Instruction Builder Export

## Overview
${project.description || 'No description available.'}

## Target Tool: ${project.target_tool}

## Contents
- \`manifest.json\` — Project metadata
- \`VISION_AND_GOALS.md\` — Project vision and goals
- \`DISCOVERY_NOTES.md\` — Discovery session findings
- \`ARCHITECTURE_PROPOSAL.md\` — Architecture proposal
- \`expert-reviews/\` — Expert panel review records (${reviews.length} reviews)
- \`exports/${project.target_tool}/\` — Generated instruction files (${instructionFiles.length} files)
- \`tool-profile.json\` — Tool profile configuration

---
**Exported via ANTON**
`;
  zip.addFile('README.md', Buffer.from(readme, 'utf-8'));

  const buffer = zip.toBuffer();
  console.log(`[anton-bundler] Created instruction-builder bundle for project "${project.name}" (${buffer.length} bytes)`);
  return buffer;
}

// ── NEW BUNDLE TYPES ─────────────────────────────────────────────────────────

/**
 * Bundle compliance rules from the compliance_rules table as a .anton file.
 * Optionally filter by category.
 */
export async function bundleComplianceRuleset(
  db: Database,
  options: {
    name?: string;
    description?: string;
    categories?: string[];
    author?: string;
  } = {}
): Promise<Buffer> {
  const whereClause = options.categories && options.categories.length > 0
    ? `WHERE category IN (${options.categories.map(() => '?').join(',')}) AND active = 1`
    : 'WHERE active = 1';
  const params = options.categories && options.categories.length > 0 ? options.categories : [];

  const rules = db.prepare(
    `SELECT id, rule_code, title, description, category, severity, regulatory_source, rule_logic, auto_remediate, remediation_steps
     FROM compliance_rules ${whereClause} ORDER BY category, severity DESC`
  ).all(...params) as any[];

  const rulesetId = `compliance-ruleset-${Date.now()}`;
  const rulesetName = options.name || 'Compliance Ruleset';

  const specManifest = buildSpecManifest({
    bundleType: 'compliance-ruleset',
    id: rulesetId,
    name: rulesetName,
    description: options.description || `${rules.length} compliance rules`,
    author: options.author,
    contentsCount: { compliance_rulesets: 1 },
  });

  const rulesetPayload = {
    bundle_type: 'compliance-ruleset',
    ruleset: {
      id: rulesetId,
      name: rulesetName,
      description: options.description || '',
      rules: rules.map((r) => ({
        rule_id: r.rule_code,
        name: r.title,
        description: r.description || '',
        category: r.category,
        severity: r.severity,
        regulatory_source: r.regulatory_source || '',
        rule_logic: safeJsonParse(r.rule_logic, {}),
        action: 'warn',
        auto_remediate: !!r.auto_remediate,
        remediation_steps: r.remediation_steps || '',
      })),
    },
  };

  const zip = new AdmZip();
  zip.addFile('manifest.json', Buffer.from(JSON.stringify(specManifest, null, 2), 'utf-8'));
  zip.addFile(
    `contents/compliance-rulesets/${rulesetId}.json`,
    Buffer.from(JSON.stringify(rulesetPayload, null, 2), 'utf-8')
  );
  zip.addFile(
    'README.md',
    Buffer.from(
      `# ${rulesetName}\n\n${options.description || ''}\n\n## Rules (${rules.length})\n\n` +
      rules.map((r) => `- **${r.rule_code}** (${r.severity}): ${r.title}`).join('\n') +
      '\n\n---\n**Exported via ANTON**\n',
      'utf-8'
    )
  );

  const buffer = zip.toBuffer();
  console.log(`[anton-bundler] Created compliance-ruleset bundle "${rulesetName}" (${rules.length} rules, ${buffer.length} bytes)`);
  return buffer;
}

/**
 * Bundle a review panel configuration as a .anton file.
 * A review panel is a named set of expert reviewer perspectives.
 */
export async function bundleReviewPanel(params: {
  name: string;
  description?: string;
  applicableAreas?: number[];
  reviewers: Array<{
    id: string;
    name: string;
    icon?: string;
    prompt: string;
    focusAreas?: string[];
  }>;
  panelSettings?: {
    minReviewersForApproval?: number;
    requireAllClear?: boolean;
    autoRunOnThinkingLevel?: string[];
  };
  author?: string;
}): Promise<Buffer> {
  const panelId = `review-panel-${params.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`;

  const specManifest = buildSpecManifest({
    bundleType: 'review-panel',
    id: panelId,
    name: params.name,
    description: params.description,
    author: params.author,
    contentsCount: { review_panels: 1 },
  });

  const panelPayload = {
    bundle_type: 'review-panel',
    panel: {
      id: panelId,
      name: params.name,
      description: params.description || '',
      applicable_areas: params.applicableAreas || [],
      reviewers: params.reviewers.map((r) => ({
        id: r.id,
        name: r.name,
        icon: r.icon || '🔍',
        prompt: r.prompt,
        focus_areas: r.focusAreas || [],
      })),
      panel_settings: {
        min_reviewers_for_approval: params.panelSettings?.minReviewersForApproval ?? 2,
        require_all_clear: params.panelSettings?.requireAllClear ?? false,
        auto_run_on_thinking_level: params.panelSettings?.autoRunOnThinkingLevel ?? ['investigate'],
      },
    },
  };

  const zip = new AdmZip();
  zip.addFile('manifest.json', Buffer.from(JSON.stringify(specManifest, null, 2), 'utf-8'));
  zip.addFile(
    `contents/review-panels/${panelId}.json`,
    Buffer.from(JSON.stringify(panelPayload, null, 2), 'utf-8')
  );
  zip.addFile(
    'README.md',
    Buffer.from(
      `# ${params.name}\n\n${params.description || ''}\n\n## Reviewers (${params.reviewers.length})\n\n` +
      params.reviewers.map((r) => `- ${r.icon || '🔍'} **${r.name}**: ${r.focusAreas?.join(', ') || ''}`).join('\n') +
      '\n\n---\n**Exported via ANTON**\n',
      'utf-8'
    )
  );

  const buffer = zip.toBuffer();
  console.log(`[anton-bundler] Created review-panel bundle "${params.name}" (${params.reviewers.length} reviewers, ${buffer.length} bytes)`);
  return buffer;
}

/**
 * Bundle quality baselines from the quality_baselines table as a .anton file.
 * Optionally filter by specific module IDs.
 */
export async function bundleQualityBaseline(
  db: Database,
  options: {
    name?: string;
    description?: string;
    moduleIds?: string[];
    author?: string;
  } = {}
): Promise<Buffer> {
  const whereClause = options.moduleIds && options.moduleIds.length > 0
    ? `WHERE module_id IN (${options.moduleIds.map(() => '?').join(',')})`
    : '';
  const params = options.moduleIds && options.moduleIds.length > 0 ? options.moduleIds : [];

  const baselines = db.prepare(
    `SELECT module_id, baseline_score, sample_size, established_at, updated_at
     FROM quality_baselines ${whereClause} ORDER BY module_id`
  ).all(...params) as any[];

  const baselineId = `quality-baseline-${Date.now()}`;
  const baselineName = options.name || 'Quality Baselines';

  const specManifest = buildSpecManifest({
    bundleType: 'quality-baseline',
    id: baselineId,
    name: baselineName,
    description: options.description || `Quality baselines for ${baselines.length} modules`,
    author: options.author,
    contentsCount: { quality_baselines: 1 },
  });

  const baselinePayload = {
    bundle_type: 'quality-baseline',
    baseline: {
      id: baselineId,
      name: baselineName,
      description: options.description || '',
      baselines: baselines.map((b) => ({
        module_id: b.module_id,
        baseline_score: b.baseline_score,
        sample_size: b.sample_size,
        established_at: b.established_at,
        updated_at: b.updated_at,
        enforcement: 'warn',
      })),
      grade_labels: {
        '9.0+': 'Exceptional — ready for regulatory submission',
        '8.0-8.9': 'Strong — client-ready',
        '7.0-7.9': 'Acceptable — internal use or with review',
        '6.0-6.9': 'Below standard — requires rework',
        '<6.0': 'Insufficient — do not distribute',
      },
    },
  };

  const zip = new AdmZip();
  zip.addFile('manifest.json', Buffer.from(JSON.stringify(specManifest, null, 2), 'utf-8'));
  zip.addFile(
    `contents/quality-baselines/${baselineId}.json`,
    Buffer.from(JSON.stringify(baselinePayload, null, 2), 'utf-8')
  );
  zip.addFile(
    'README.md',
    Buffer.from(
      `# ${baselineName}\n\n${options.description || ''}\n\n## Baselines (${baselines.length} modules)\n\n` +
      baselines.map((b) => `- **${b.module_id}**: ${b.baseline_score.toFixed(1)}/10 (n=${b.sample_size})`).join('\n') +
      '\n\n---\n**Exported via ANTON**\n',
      'utf-8'
    )
  );

  const buffer = zip.toBuffer();
  console.log(`[anton-bundler] Created quality-baseline bundle "${baselineName}" (${baselines.length} modules, ${buffer.length} bytes)`);
  return buffer;
}

/**
 * Bundle an audience profile as a .anton file.
 * An audience profile defines how to adapt output for a specific stakeholder type.
 */
export async function bundleAudienceProfile(params: {
  id?: string;
  name: string;
  description?: string;
  tone?: string;
  maxLength?: string;
  languagePreferences?: { avoid?: string[]; prefer?: string[] };
  emphasis?: string[];
  structure?: string[];
  systemPrompt: string;
  author?: string;
}): Promise<Buffer> {
  const profileId = params.id || `audience-profile-${params.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`;

  const specManifest = buildSpecManifest({
    bundleType: 'audience-profile',
    id: profileId,
    name: params.name,
    description: params.description,
    author: params.author,
    contentsCount: { audience_profiles: 1 },
  });

  const profilePayload = {
    bundle_type: 'audience-profile',
    audience: {
      id: profileId,
      name: params.name,
      description: params.description || '',
      tone: params.tone || 'professional',
      max_length: params.maxLength || 'No limit',
      language_preferences: {
        avoid: params.languagePreferences?.avoid || [],
        prefer: params.languagePreferences?.prefer || [],
      },
      emphasis: params.emphasis || [],
      structure: params.structure || [],
      system_prompt: params.systemPrompt,
    },
  };

  const zip = new AdmZip();
  zip.addFile('manifest.json', Buffer.from(JSON.stringify(specManifest, null, 2), 'utf-8'));
  zip.addFile(
    `contents/audience-profiles/${profileId}.json`,
    Buffer.from(JSON.stringify(profilePayload, null, 2), 'utf-8')
  );
  zip.addFile(
    'README.md',
    Buffer.from(
      `# ${params.name}\n\n${params.description || ''}\n\n## Tone\n${params.tone || 'professional'}\n\n## System Prompt\n${params.systemPrompt}\n\n---\n**Exported via ANTON**\n`,
      'utf-8'
    )
  );

  const buffer = zip.toBuffer();
  console.log(`[anton-bundler] Created audience-profile bundle "${params.name}" (${buffer.length} bytes)`);
  return buffer;
}

// ── Utility ──────────────────────────────────────────────────────

function safeJsonParse(value: string | null | undefined, fallback: any): any {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

// ── Dependency Extraction (Basic Heuristics) ───────────────────

function extractSkillDependencies(systemPrompt: string): string[] {
  // Look for skill references in prompt (basic keyword matching)
  const skills: string[] = [];
  const skillKeywords = [
    'citation-verification',
    'regulatory-comparison',
    'data-validation',
    'quality-scoring',
  ];

  for (const skill of skillKeywords) {
    if (systemPrompt.toLowerCase().includes(skill)) {
      skills.push(skill);
    }
  }

  return skills;
}

function extractPersonaDependencies(systemPrompt: string): string[] {
  // Look for persona references
  const personas: string[] = [];
  const personaKeywords = [
    'data-protection-officer',
    'compliance-analyst',
    'legal-counsel',
    'risk-manager',
  ];

  for (const persona of personaKeywords) {
    if (systemPrompt.toLowerCase().includes(persona)) {
      personas.push(persona);
    }
  }

  return personas;
}

// ── Changelog Generation ───────────────────────────────────────

function generateChangelog(module: ModuleExportData): string {
  const version = module.version || '1.0.0';
  const date = module.updatedAt ? new Date(module.updatedAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];

  return `# Changelog

## [${version}] - ${date}

### Module Information
- **Name:** ${module.name}
- **Author:** ${module.author || 'Unknown'}
- **Category:** ${module.category || 'Custom'}
- **Description:** ${module.description || 'No description provided'}

### Features
- Custom system prompt with guided inputs
- ${module.guidedInputs?.length || 0} input fields
- Default configuration included

### Tags
${module.tags?.map(tag => `- ${tag}`).join('\n') || '- No tags'}

---

**Exported via openEXPERT .anton Exchange System**
`;
}
