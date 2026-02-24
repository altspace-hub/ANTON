import { Router } from 'express';
import type Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import { callSync } from '../services/claude-client.js';
import { ingestLocalProject } from '../services/project-ingestor.js';

const DIMENSIONS = [
  { name: 'feature-completeness', persona: 'Product Manager', reviewType: 'product' },
  { name: 'architecture', persona: 'Software Architect', reviewType: 'architecture' },
  { name: 'domain-compliance', persona: 'Domain Specialist', reviewType: 'compliance' },
  { name: 'tech-health', persona: 'Software Engineer', reviewType: 'technical' },
  { name: 'security', persona: 'Security Analyst', reviewType: 'security' },
  { name: 'goal-drift', persona: 'Project Manager', reviewType: 'goal_alignment' },
] as const;

export function createAlignmentReviewerRoutes(db: Database.Database): Router {
  const router = Router();

  // GET /api/coding/alignment-reviews — list all reviews
  router.get('/coding/alignment-reviews', (req, res) => {
    try {
      const reviews = db.prepare('SELECT * FROM alignment_reviews ORDER BY created_at DESC').all();
      res.json(reviews);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // POST /api/coding/alignment-reviews — create new review
  router.post('/coding/alignment-reviews', (req, res) => {
    try {
      const { project_name, instruction_builder_project_id, target_tool } = req.body;
      if (!project_name) {
        res.status(400).json({ error: 'project_name is required' });
        return;
      }

      const id = randomUUID();
      db.prepare(
        `INSERT INTO alignment_reviews (id, project_name, instruction_builder_project_id, target_tool)
         VALUES (?, ?, ?, ?)`
      ).run(id, project_name, instruction_builder_project_id || null, target_tool || null);

      const review = db.prepare('SELECT * FROM alignment_reviews WHERE id = ?').get(id);
      res.json(review);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // GET /api/coding/alignment-reviews/:id — get review details
  router.get('/coding/alignment-reviews/:id', (req, res) => {
    try {
      const review = db.prepare('SELECT * FROM alignment_reviews WHERE id = ?').get(req.params.id) as any;
      if (!review) {
        res.status(404).json({ error: 'Review not found' });
        return;
      }

      const dimensions = db.prepare(
        'SELECT * FROM alignment_dimensions WHERE alignment_review_id = ?'
      ).all(req.params.id);

      const steering = db.prepare(
        'SELECT * FROM steering_instructions WHERE alignment_review_id = ?'
      ).all(req.params.id);

      res.json({
        ...review,
        dimensions,
        steering_instructions: steering,
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // POST /api/coding/alignment-reviews/:id/ingest — ingest project
  router.post('/coding/alignment-reviews/:id/ingest', async (req, res) => {
    try {
      const review = db.prepare('SELECT * FROM alignment_reviews WHERE id = ?').get(req.params.id) as any;
      if (!review) {
        res.status(404).json({ error: 'Review not found' });
        return;
      }

      const { source_type, path: dirPath } = req.body;

      if (source_type === 'local-directory' && dirPath) {
        const projectState = await ingestLocalProject(dirPath);

        db.prepare(
          "UPDATE alignment_reviews SET project_state_summary = ?, status = 'ingesting', updated_at = datetime('now') WHERE id = ?"
        ).run(JSON.stringify(projectState), req.params.id);

        res.json({ projectState });
      } else {
        res.status(400).json({ error: 'Unsupported source_type. Currently supports: local-directory' });
      }
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // POST /api/coding/alignment-reviews/:id/goals — set goals reference
  router.post('/coding/alignment-reviews/:id/goals', async (req, res) => {
    try {
      const review = db.prepare('SELECT * FROM alignment_reviews WHERE id = ?').get(req.params.id) as any;
      if (!review) {
        res.status(404).json({ error: 'Review not found' });
        return;
      }

      const { goals, instruction_builder_project_id } = req.body;

      let goalsRef: any;

      if (instruction_builder_project_id) {
        // Load goals from IB project
        const ibProject = db.prepare('SELECT * FROM instruction_builder_projects WHERE id = ?').get(instruction_builder_project_id) as any;
        if (!ibProject) {
          res.status(404).json({ error: 'Instruction Builder project not found' });
          return;
        }
        goalsRef = {
          source: 'instruction-builder',
          vision_goals: safeJsonParse(ibProject.vision_goals, {}),
          architecture: ibProject.architecture_proposal || '',
          discovery_notes: safeJsonParse(ibProject.discovery_notes, {}),
        };

        db.prepare("UPDATE alignment_reviews SET instruction_builder_project_id = ?, updated_at = datetime('now') WHERE id = ?")
          .run(instruction_builder_project_id, req.params.id);
      } else if (goals) {
        goalsRef = { source: 'manual', goals };
      } else {
        res.status(400).json({ error: 'Either goals or instruction_builder_project_id is required' });
        return;
      }

      db.prepare(
        "UPDATE alignment_reviews SET goals_reference = ?, status = 'goals-set', updated_at = datetime('now') WHERE id = ?"
      ).run(JSON.stringify(goalsRef), req.params.id);

      res.json({ goals_reference: goalsRef });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // POST /api/coding/alignment-reviews/:id/analyse — run alignment analysis
  router.post('/coding/alignment-reviews/:id/analyse', async (req, res) => {
    try {
      const review = db.prepare('SELECT * FROM alignment_reviews WHERE id = ?').get(req.params.id) as any;
      if (!review) {
        res.status(404).json({ error: 'Review not found' });
        return;
      }

      const projectState = safeJsonParse(review.project_state_summary, null);
      const goalsRef = safeJsonParse(review.goals_reference, null);

      if (!projectState || !goalsRef) {
        res.status(400).json({ error: 'Both project ingestion and goals must be set before analysis' });
        return;
      }

      // Update status
      db.prepare("UPDATE alignment_reviews SET status = 'analysing', updated_at = datetime('now') WHERE id = ?")
        .run(req.params.id);

      // Analyse each dimension
      const dimensionResults: any[] = [];

      for (const dim of DIMENSIONS) {
        const result = await callSync({
          model: 'claude-sonnet-4-5-20250929',
          thinking: 'think',
          system: buildDimensionAnalysisPrompt(dim.name, dim.persona),
          messages: [{
            role: 'user',
            content: `# Alignment Analysis: ${dim.name}

## Project State
${JSON.stringify(projectState, null, 2).substring(0, 10000)}

## Goals Reference
${JSON.stringify(goalsRef, null, 2).substring(0, 10000)}

Assess the alignment of this project against its stated goals for the "${dim.name}" dimension. Provide your assessment as a JSON block.`,
          }],
        });

        // Parse the assessment
        let status: 'green' | 'amber' | 'red' = 'amber';
        const statusMatch = result.text.match(/"status"\s*:\s*"(green|amber|red)"/);
        if (statusMatch) status = statusMatch[1] as 'green' | 'amber' | 'red';

        const dimId = randomUUID();
        db.prepare(
          `INSERT INTO alignment_dimensions (id, alignment_review_id, dimension_name, status, findings, recommendations, reviewer_persona)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).run(dimId, req.params.id, dim.name, status, result.text, null, dim.persona);

        dimensionResults.push({
          id: dimId,
          dimension: dim.name,
          status,
          persona: dim.persona,
          findings: result.text,
        });
      }

      // Generate executive summary
      const greenCount = dimensionResults.filter(d => d.status === 'green').length;
      const redCount = dimensionResults.filter(d => d.status === 'red').length;
      const overallStatus = redCount >= 2 ? 'off-track' : greenCount >= 4 ? 'on-track' : 'partially-aligned';

      // Build alignment report
      const alignmentReport = {
        overall_status: overallStatus,
        dimensions: dimensionResults,
        summary: `${greenCount} dimensions on-track, ${dimensionResults.filter(d => d.status === 'amber').length} need attention, ${redCount} off-track`,
        analysed_at: new Date().toISOString(),
      };

      db.prepare(
        "UPDATE alignment_reviews SET alignment_report = ?, overall_status = ?, status = 'reviewed', updated_at = datetime('now') WHERE id = ?"
      ).run(JSON.stringify(alignmentReport), overallStatus, req.params.id);

      res.json(alignmentReport);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // POST /api/coding/alignment-reviews/:id/generate-steering — generate steering instructions
  router.post('/coding/alignment-reviews/:id/generate-steering', async (req, res) => {
    try {
      const review = db.prepare('SELECT * FROM alignment_reviews WHERE id = ?').get(req.params.id) as any;
      if (!review) {
        res.status(404).json({ error: 'Review not found' });
        return;
      }

      const targetTool = req.body.target_tool || review.target_tool || 'claude-code';
      const alignmentReport = safeJsonParse(review.alignment_report, null);

      if (!alignmentReport) {
        res.status(400).json({ error: 'Alignment analysis must be completed first' });
        return;
      }

      // Load tool profile
      const profile = db.prepare(
        'SELECT * FROM tool_profiles WHERE tool_name = ? AND is_default = 1'
      ).get(targetTool) as any;

      if (!profile) {
        res.status(400).json({ error: `No default tool profile found for ${targetTool}` });
        return;
      }

      // Get dimensions that need attention (amber or red)
      const dimensions = db.prepare(
        "SELECT * FROM alignment_dimensions WHERE alignment_review_id = ? AND status != 'green'"
      ).all(req.params.id) as any[];

      // Determine instruction types needed
      const instructionTypes: Array<{ type: string; filename: string }> = [];
      const hasRed = dimensions.some(d => d.status === 'red');
      const hasAmber = dimensions.some(d => d.status === 'amber');

      if (hasRed) instructionTypes.push({ type: 'correction', filename: `CORRECTION_${profile.primary_filename}` });
      if (hasAmber) instructionTypes.push({ type: 'refactoring', filename: `REFACTORING_${profile.primary_filename}` });
      instructionTypes.push({ type: 'continuation', filename: `STEERING_${profile.primary_filename}` });

      const generatedFiles: any[] = [];

      for (const instrType of instructionTypes) {
        const result = await callSync({
          model: 'claude-sonnet-4-5-20250929',
          thinking: 'think_hard',
          system: `You are generating a ${instrType.type} instruction file for "${profile.display_name}". This file contains specific steering instructions to bring a project back into alignment with its goals.

Format the output as a complete ${profile.primary_filename}-style Markdown file that the AI coding tool can directly use.

Tone: ${profile.tone_guidelines || 'Direct and actionable.'}
Formatting: ${profile.formatting_rules || 'Clean Markdown.'}

Focus on:
- Specific actions to address each finding
- Priority ordering (critical issues first)
- Verification criteria for each action
- Estimated effort indicators`,
          messages: [{
            role: 'user',
            content: `# Generate ${instrType.type} steering instructions

## Alignment Report
${JSON.stringify(alignmentReport, null, 2)}

## Findings Requiring Attention
${dimensions.map(d => `### ${d.dimension_name} (${d.status})\n${(d.findings || '').substring(0, 3000)}`).join('\n\n')}

Generate a ${instrType.filename} file with specific, actionable steering instructions.`,
          }],
        });

        const fileId = randomUUID();
        db.prepare(
          `INSERT INTO steering_instructions (id, alignment_review_id, target_tool, instruction_type, filename, content)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).run(fileId, req.params.id, targetTool, instrType.type, instrType.filename, result.text);

        generatedFiles.push({
          id: fileId,
          type: instrType.type,
          filename: instrType.filename,
          content: result.text,
        });
      }

      // Update status
      db.prepare("UPDATE alignment_reviews SET status = 'steering-generated', target_tool = ?, updated_at = datetime('now') WHERE id = ?")
        .run(targetTool, req.params.id);

      res.json({ files: generatedFiles });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // GET /api/coding/alignment-reviews/:id/history — get review history
  router.get('/coding/alignment-reviews/:id/history', (req, res) => {
    try {
      const review = db.prepare('SELECT * FROM alignment_reviews WHERE id = ?').get(req.params.id) as any;
      if (!review) {
        res.status(404).json({ error: 'Review not found' });
        return;
      }

      // Get all reviews for the same project name for trend analysis
      const history = db.prepare(
        'SELECT id, project_name, review_date, status, overall_status, created_at FROM alignment_reviews WHERE project_name = ? ORDER BY created_at ASC'
      ).all(review.project_name);

      res.json(history);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  return router;
}

// ── Helpers ──────────────────────────────────────────────

function safeJsonParse(value: string | null | undefined, fallback: any): any {
  if (!value) return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

function buildDimensionAnalysisPrompt(dimensionName: string, persona: string): string {
  const dimensionDescriptions: Record<string, string> = {
    'feature-completeness': 'Assess whether planned features are implemented. Check for missing, partial, or extra features compared to goals.',
    'architecture': 'Evaluate whether the actual architecture matches the planned architecture. Check patterns, tech stack, structure.',
    'domain-compliance': 'Verify domain-specific requirements are met. Check regulatory compliance, industry standards, business rules.',
    'tech-health': 'Assess code quality, dependency health, test coverage, documentation quality.',
    'security': 'Evaluate security posture: auth, input validation, dependency vulnerabilities, secrets management.',
    'goal-drift': 'Check for scope creep, feature drift, timeline slippage, quality degradation relative to original goals.',
  };

  return `You are a ${persona} assessing project alignment on the "${dimensionName}" dimension.

## Assessment Focus
${dimensionDescriptions[dimensionName] || 'General alignment assessment.'}

## Output Format
Respond with your analysis AND a JSON assessment block:

\`\`\`json
{
  "status": "green" | "amber" | "red",
  "confidence": 0.0-1.0,
  "key_findings": ["finding 1", "finding 2"],
  "recommendations": ["recommendation 1"],
  "evidence": ["specific evidence from project state"]
}
\`\`\`

- **green**: Aligned with goals, no significant issues
- **amber**: Partially aligned, attention needed
- **red**: Significantly misaligned, corrective action required`;
}
