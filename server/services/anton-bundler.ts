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

interface AntonManifest {
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

// ── Bundle Module to .anton File ───────────────────────────────

export async function bundleModuleToAnton(
  db: Database,
  moduleId: string,
  userId: string
): Promise<Buffer> {
  // Fetch module from database
  const module = db
    .prepare(
      `SELECT id, name, description, icon, color, system_prompt, guided_inputs,
              default_config, author, version, tags, category, created_at, updated_at
       FROM custom_modules
       WHERE id = ? AND user_id = ?`
    )
    .get(moduleId, userId) as any;

  if (!module) {
    throw new Error('Module not found or access denied');
  }

  const exportData: ModuleExportData = {
    id: module.id,
    name: module.name,
    description: module.description || '',
    icon: module.icon,
    color: module.color,
    systemPrompt: module.system_prompt || '',
    guidedInputs: module.guided_inputs ? JSON.parse(module.guided_inputs) : [],
    defaultConfig: module.default_config ? JSON.parse(module.default_config) : {},
    author: module.author || 'Unknown',
    version: module.version || '1.0.0',
    tags: module.tags ? JSON.parse(module.tags) : [],
    category: module.category || 'custom',
    createdAt: module.created_at,
    updatedAt: module.updated_at,
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

  // Build final manifest
  const manifest: AntonManifest = {
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
