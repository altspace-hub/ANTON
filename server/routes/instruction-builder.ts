import { Router } from 'express';
import type { DatabaseAdapter } from '../db/database.js';
import { randomUUID } from 'crypto';
import { callSync } from '../services/claude-client.js';
import { safeError } from '../lib/error-response.js';

export async function createInstructionBuilderRoutes(db: DatabaseAdapter): Promise<Router> {
  const router = Router();

  // GET /api/coding/instruction-builder/projects — list all IB projects
  router.get('/coding/instruction-builder/projects', async (req, res) => {
    try {
      const projects = await db.all(
        'SELECT * FROM instruction_builder_projects ORDER BY updated_at DESC'
      );
      res.json(projects);
    } catch (error) {
      res.status(500).json({ error: safeError(error) });
    }
  });

  // POST /api/coding/instruction-builder/projects — create new IB project
  router.post('/coding/instruction-builder/projects', async (req, res) => {
    try {
      const { name, description, target_tool } = req.body;
      if (!name || !target_tool) {
        res.status(400).json({ error: 'name and target_tool are required' });
        return;
      }

      const id = randomUUID();
      await db.run(
        `INSERT INTO instruction_builder_projects (id, name, description, target_tool)
         VALUES (?, ?, ?, ?)`
      , id, name, description || null, target_tool);

      const project = await db.get('SELECT * FROM instruction_builder_projects WHERE id = ?', id);
      res.json(project);
    } catch (error) {
      res.status(500).json({ error: safeError(error) });
    }
  });

  // GET /api/coding/instruction-builder/projects/:id — get project details
  router.get('/coding/instruction-builder/projects/:id', async (req, res) => {
    try {
      const project = await db.get('SELECT * FROM instruction_builder_projects WHERE id = ?', req.params.id);
      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }

      // Also fetch instruction files
      const files = await db.get(
        'SELECT * FROM instruction_files WHERE instruction_builder_project_id = ? ORDER BY file_type ASC, filename ASC'
      , req.params.id);

      res.json({ ...(project as any), instruction_files: files });
    } catch (error) {
      res.status(500).json({ error: safeError(error) });
    }
  });

  // PUT /api/coding/instruction-builder/projects/:id — update project fields
  router.put('/coding/instruction-builder/projects/:id', async (req, res) => {
    try {
      const { name, description, status, vision_goals, discovery_notes, architecture_proposal, tool_profile_id } = req.body;

      const updates: string[] = [];
      const values: any[] = [];

      if (name !== undefined) { updates.push('name = ?'); values.push(name); }
      if (description !== undefined) { updates.push('description = ?'); values.push(description); }
      if (status !== undefined) { updates.push('status = ?'); values.push(status); }
      if (vision_goals !== undefined) { updates.push('vision_goals = ?'); values.push(typeof vision_goals === 'string' ? vision_goals : JSON.stringify(vision_goals)); }
      if (discovery_notes !== undefined) { updates.push('discovery_notes = ?'); values.push(typeof discovery_notes === 'string' ? discovery_notes : JSON.stringify(discovery_notes)); }
      if (architecture_proposal !== undefined) { updates.push('architecture_proposal = ?'); values.push(typeof architecture_proposal === 'string' ? architecture_proposal : JSON.stringify(architecture_proposal)); }
      if (tool_profile_id !== undefined) { updates.push('tool_profile_id = ?'); values.push(tool_profile_id); }

      if (updates.length === 0) {
        res.status(400).json({ error: 'No fields to update' });
        return;
      }

      updates.push("updated_at = NOW()");
      values.push(req.params.id);

      await db.run(`UPDATE instruction_builder_projects SET ${updates.join(', ')} WHERE id = ?`, ...values);

      const project = await db.get('SELECT * FROM instruction_builder_projects WHERE id = ?', req.params.id);
      res.json(project);
    } catch (error) {
      res.status(500).json({ error: safeError(error) });
    }
  });

  // POST /api/coding/instruction-builder/projects/:id/discovery — process discovery turn
  router.post('/coding/instruction-builder/projects/:id/discovery', async (req, res) => {
    try {
      const project = await db.get('SELECT * FROM instruction_builder_projects WHERE id = ?', req.params.id) as any;
      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }

      const { userMessage, history } = req.body;
      if (!userMessage) {
        res.status(400).json({ error: 'userMessage is required' });
        return;
      }

      const existingNotes = safeJsonParse(project.discovery_notes, {});
      const existingGoals = safeJsonParse(project.vision_goals, {});

      const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
      if (history && Array.isArray(history)) {
        for (const msg of history) {
          if (msg.role && msg.content) messages.push({ role: msg.role, content: msg.content });
        }
      }
      messages.push({ role: 'user', content: userMessage });

      const result = await callSync({
        model: 'claude-sonnet-4-5-20250929',
        thinking: 'think',
        system: buildDiscoverySystemPrompt(project.name, project.target_tool, existingGoals, existingNotes),
        messages,
      });

      // Extract structured data from response
      const structuredMatch = result.text.match(/```json:structured\n([\s\S]*?)```/);
      if (structuredMatch) {
        try {
          const structured = JSON.parse(structuredMatch[1]);
          if (structured.vision_goals) {
            await db.run("UPDATE instruction_builder_projects SET vision_goals = ?, updated_at = NOW() WHERE id = ?", JSON.stringify({ ...existingGoals, ...structured.vision_goals }), req.params.id);
          }
          if (structured.discovery_notes) {
            await db.run("UPDATE instruction_builder_projects SET discovery_notes = ?, updated_at = NOW() WHERE id = ?", JSON.stringify({ ...existingNotes, ...structured.discovery_notes }), req.params.id);
          }
        } catch { /* ignore parse failures */ }
      }

      // Return conversational part (strip structured JSON block)
      const conversational = result.text.replace(/```json:structured\n[\s\S]*?```/g, '').trim();

      res.json({
        response: conversational,
        thinking: result.thinking,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      });
    } catch (error) {
      res.status(500).json({ error: safeError(error) });
    }
  });

  // POST /api/coding/instruction-builder/projects/:id/architecture — generate architecture proposal
  router.post('/coding/instruction-builder/projects/:id/architecture', async (req, res) => {
    try {
      const project = await db.get('SELECT * FROM instruction_builder_projects WHERE id = ?', req.params.id) as any;
      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }

      const visionGoals = safeJsonParse(project.vision_goals, {});
      const discoveryNotes = safeJsonParse(project.discovery_notes, {});

      const result = await callSync({
        model: 'claude-opus-4-8',
        thinking: 'think_hard',
        system: `You are a senior software architect and CTO creating an architecture proposal.

Based on the project vision, goals, and discovery notes, produce a comprehensive architecture proposal with:

1. **Architecture Overview** — High-level system design, patterns, and architectural style
2. **Tech Stack Recommendation** — Languages, frameworks, libraries with rationale
3. **Directory Structure** — Proposed project structure with descriptions
4. **Key Design Decisions** — Important choices with trade-offs explained
5. **Data Model** — Core entities and relationships
6. **Integration Points** — External systems, APIs, services
7. **Phased Implementation** — Recommended build order with milestones
8. **Risk Assessment** — Technical risks and mitigation strategies

Format as well-structured Markdown. Be specific and actionable.`,
        messages: [{
          role: 'user',
          content: `# Architecture Proposal Request\n\n## Project: ${project.name}\n\n## Vision & Goals\n${JSON.stringify(visionGoals, null, 2)}\n\n## Discovery Notes\n${JSON.stringify(discoveryNotes, null, 2)}\n\nPlease generate a comprehensive architecture proposal for this project.`,
        }],
      });

      // Save architecture proposal
      await db.run("UPDATE instruction_builder_projects SET architecture_proposal = ?, status = 'architecture', updated_at = NOW() WHERE id = ?", result.text, req.params.id);

      res.json({
        proposal: result.text,
        thinking: result.thinking,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      });
    } catch (error) {
      res.status(500).json({ error: safeError(error) });
    }
  });

  // POST /api/coding/instruction-builder/projects/:id/review — trigger expert panel review
  router.post('/coding/instruction-builder/projects/:id/review', async (req, res) => {
    try {
      const project = await db.get('SELECT * FROM instruction_builder_projects WHERE id = ?', req.params.id) as any;
      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }

      const visionGoals = safeJsonParse(project.vision_goals, {});
      const architecture = project.architecture_proposal || '';

      // Expert panel — always: Software Architect + Product Manager; conditionally: Security, FCP, Legal
      const panelMembers = [
        { id: 'software-architect', name: 'Software Architect', type: 'architecture' as const },
        { id: 'product-manager', name: 'Product Manager', type: 'product' as const },
        { id: 'security-analyst', name: 'Security Analyst', type: 'security' as const },
      ];

      const reviews: any[] = [];

      for (const member of panelMembers) {
        const reviewId = randomUUID();
        const result = await callSync({
          model: 'claude-sonnet-4-5-20250929',
          thinking: 'think',
          system: `You are a ${member.name} reviewing a project plan and architecture proposal.

Provide your expert review with:
1. **Verdict**: One of: endorse, flag, dissent
2. **Key Findings**: 3-5 specific observations
3. **Recommendations**: Actionable suggestions
4. **Risk Assessment**: Any risks from your perspective

Format your response as:
## Verdict: [endorse/flag/dissent]
## Findings
- ...
## Recommendations
- ...
## Risks
- ...`,
          messages: [{
            role: 'user',
            content: `# Expert Review Request\n\n## Project: ${project.name}\n\n## Vision & Goals\n${JSON.stringify(visionGoals, null, 2)}\n\n## Architecture Proposal\n${architecture}\n\nPlease provide your expert ${member.type} review.`,
          }],
        });

        // Parse verdict
        const verdictMatch = result.text.match(/## Verdict:\s*(endorse|flag|dissent)/i);
        const verdict = verdictMatch ? verdictMatch[1].toLowerCase() : 'flag';

        // Save to the Instruction Builder's own review table (NOT coding_reviews,
        // whose coding_project_id FK to coding_projects an IB project can't satisfy).
        await db.run(`INSERT INTO instruction_builder_reviews (id, project_id, reviewer_persona_id, review_type, verdict, findings, recommendations, status, review_completed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'completed', NOW())`
        ,
          reviewId,
          project.id,
          member.id,
          member.type,
          verdict,
          result.text,
          null,
        );

        reviews.push({
          id: reviewId,
          reviewer: member.name,
          reviewerPersonaId: member.id,
          reviewType: member.type,
          verdict,
          content: result.text,
        });
      }

      // Update project status
      await db.run("UPDATE instruction_builder_projects SET status = 'review', review_cycle_count = review_cycle_count + 1, updated_at = NOW() WHERE id = ?", req.params.id);

      res.json({ reviews });
    } catch (error) {
      res.status(500).json({ error: safeError(error) });
    }
  });

  // POST /api/coding/instruction-builder/projects/:id/generate — generate instruction files
  router.post('/coding/instruction-builder/projects/:id/generate', async (req, res) => {
    try {
      const project = await db.get('SELECT * FROM instruction_builder_projects WHERE id = ?', req.params.id) as any;
      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }

      // Load tool profile
      const profile = await db.get(
        'SELECT * FROM tool_profiles WHERE tool_name = ? AND is_default = 1'
      , project.target_tool) as any;

      if (!profile) {
        res.status(400).json({ error: `No default tool profile found for ${project.target_tool}` });
        return;
      }

      const visionGoals = safeJsonParse(project.vision_goals, {});
      const discoveryNotes = safeJsonParse(project.discovery_notes, {});
      const architecture = project.architecture_proposal || '';
      const structureTemplate = safeJsonParse(profile.structure_template, {});

      // Fetch expert reviews (from the IB-specific table)
      const reviews = await db.all(
        'SELECT * FROM instruction_builder_reviews WHERE project_id = ? ORDER BY created_at DESC LIMIT 10'
      , project.id) as any[];

      const reviewSummary = reviews.map((r: any) => `${r.reviewer_persona_id}: ${r.verdict} — ${(r.findings || '').substring(0, 500)}`).join('\n');

      // Generate primary instruction file
      const primaryResult = await callSync({
        model: 'claude-opus-4-8',
        thinking: 'think_hard',
        system: buildGenerationSystemPrompt(profile, structureTemplate),
        messages: [{
          role: 'user',
          content: `# Generate ${profile.primary_filename} for "${project.name}"

## Target Tool: ${profile.display_name}

## Vision & Goals
${JSON.stringify(visionGoals, null, 2)}

## Discovery Notes
${JSON.stringify(discoveryNotes, null, 2)}

## Architecture Proposal
${architecture}

## Expert Review Summary
${reviewSummary}

Generate a complete, production-ready ${profile.primary_filename} file that an AI coding tool can use to build this project. The file must be comprehensive, actionable, and follow the ${profile.display_name} conventions.`,
        }],
      });

      // Save primary file
      const primaryId = randomUUID();
      await db.run(`INSERT INTO instruction_files (id, instruction_builder_project_id, filename, file_type, target_tool, content, content_hash)
         VALUES (?, ?, ?, 'primary', ?, ?, ?)`
      , primaryId, req.params.id, profile.primary_filename, project.target_tool, primaryResult.text, simpleHash(primaryResult.text));

      // Generate supplementary files for Claude Code
      const supplementaryFiles: any[] = [];
      if (project.target_tool === 'claude-code') {
        const suppFileNames = ['ARCHITECTURE.md', 'ROADMAP.md', 'DECISIONS.md', 'DOMAIN_REQUIREMENTS.md', 'TEST_PLAN.md'];

        for (const filename of suppFileNames) {
          const suppResult = await callSync({
            model: 'claude-sonnet-4-5-20250929',
            thinking: 'think',
            system: `Generate a supplementary project documentation file called "${filename}" based on the project context. This file accompanies the main CLAUDE.md instruction file for a Claude Code project. Be specific and actionable. Format as clean Markdown.`,
            messages: [{
              role: 'user',
              content: `Project: ${project.name}\n\nVision: ${JSON.stringify(visionGoals, null, 2)}\n\nArchitecture: ${architecture.substring(0, 5000)}\n\nGenerate the ${filename} file.`,
            }],
          });

          const suppId = randomUUID();
          await db.run(
            `INSERT INTO instruction_files (id, instruction_builder_project_id, filename, file_type, target_tool, content, content_hash)
             VALUES (?, ?, ?, 'supplementary', ?, ?, ?)`
          , suppId, req.params.id, filename, project.target_tool, suppResult.text, simpleHash(suppResult.text));

          supplementaryFiles.push({ id: suppId, filename, content: suppResult.text });
        }
      }

      // Update project status
      await db.run("UPDATE instruction_builder_projects SET status = 'generated', updated_at = NOW() WHERE id = ?", req.params.id);

      // Fetch all files
      const allFiles = await db.all(
        'SELECT * FROM instruction_files WHERE instruction_builder_project_id = ? ORDER BY file_type ASC, filename ASC'
      , req.params.id);

      res.json({
        primaryFile: { id: primaryId, filename: profile.primary_filename, content: primaryResult.text },
        supplementaryFiles,
        allFiles,
      });
    } catch (error) {
      res.status(500).json({ error: safeError(error) });
    }
  });

  // GET /api/coding/instruction-builder/tool-profiles — list tool profiles
  router.get('/coding/instruction-builder/tool-profiles', async (req, res) => {
    try {
      const profiles = await db.all('SELECT * FROM tool_profiles ORDER BY display_name ASC');
      res.json(profiles);
    } catch (error) {
      res.status(500).json({ error: safeError(error) });
    }
  });

  // GET /api/coding/instruction-builder/tool-profiles/:id — get profile
  router.get('/coding/instruction-builder/tool-profiles/:id', async (req, res) => {
    try {
      const profile = await db.get('SELECT * FROM tool_profiles WHERE id = ?', req.params.id);
      if (!profile) {
        res.status(404).json({ error: 'Tool profile not found' });
        return;
      }
      res.json(profile);
    } catch (error) {
      res.status(500).json({ error: safeError(error) });
    }
  });

  // PUT /api/coding/instruction-builder/tool-profiles/:id — update profile
  router.put('/coding/instruction-builder/tool-profiles/:id', async (req, res) => {
    try {
      const { display_name, primary_filename, structure_template, tone_guidelines, formatting_rules, special_directives } = req.body;

      const updates: string[] = [];
      const values: any[] = [];

      if (display_name !== undefined) { updates.push('display_name = ?'); values.push(display_name); }
      if (primary_filename !== undefined) { updates.push('primary_filename = ?'); values.push(primary_filename); }
      if (structure_template !== undefined) { updates.push('structure_template = ?'); values.push(typeof structure_template === 'string' ? structure_template : JSON.stringify(structure_template)); }
      if (tone_guidelines !== undefined) { updates.push('tone_guidelines = ?'); values.push(tone_guidelines); }
      if (formatting_rules !== undefined) { updates.push('formatting_rules = ?'); values.push(formatting_rules); }
      if (special_directives !== undefined) { updates.push('special_directives = ?'); values.push(special_directives); }

      if (updates.length === 0) {
        res.status(400).json({ error: 'No fields to update' });
        return;
      }

      updates.push("updated_at = NOW()");
      values.push(req.params.id);

      await db.run(`UPDATE tool_profiles SET ${updates.join(', ')} WHERE id = ?`, ...values);

      const profile = await db.get('SELECT * FROM tool_profiles WHERE id = ?', req.params.id);
      res.json(profile);
    } catch (error) {
      res.status(500).json({ error: safeError(error) });
    }
  });

  return router;
}

// ── Helper Functions ──────────────────────────────────────────

function safeJsonParse(value: string | null | undefined, fallback: any): any {
  if (!value) return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

function simpleHash(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return 'h' + Math.abs(hash).toString(36);
}

function buildDiscoverySystemPrompt(projectName: string, targetTool: string, existingGoals: any, existingNotes: any): string {
  return `You are ANTON's strategic planning intelligence, guiding a discovery conversation for the project "${projectName}".
The target AI coding tool is: ${targetTool}.

## YOUR ROLE
Lead a structured discovery session to gather all information needed to generate high-quality instruction files. Ask focused questions one area at a time. After each user response, summarise what you've learned and probe deeper where needed.

## DISCOVERY AREAS
1. **Vision & Purpose** — What is this project? Who is it for? What problem does it solve?
2. **Goals & Success Criteria** — What specific outcomes define success?
3. **Target Audience** — Who will use the result? Technical level? Context?
4. **Scope & Boundaries** — What's in scope? What's explicitly excluded?
5. **Technical Constraints** — Required tech stack? Platform? Performance requirements?
6. **Domain Requirements** — Industry-specific rules, regulations, or conventions?
7. **Timeline & Priorities** — Deadlines? MVP vs full scope? Phase ordering?
8. **Integration Points** — External systems, APIs, data sources?
9. **Quality Standards** — Testing requirements? Code style? Documentation needs?

## EXISTING CONTEXT
${Object.keys(existingGoals).length > 0 ? `Vision & Goals gathered so far:\n${JSON.stringify(existingGoals, null, 2)}` : 'No goals gathered yet.'}
${Object.keys(existingNotes).length > 0 ? `Discovery notes so far:\n${JSON.stringify(existingNotes, null, 2)}` : 'No notes gathered yet.'}

## RESPONSE FORMAT
After each conversational response, append a structured data block:
\`\`\`json:structured
{
  "vision_goals": { "key": "value" },
  "discovery_notes": { "key": "value" }
}
\`\`\`
Only include keys that were newly discussed or updated in this turn.`;
}

function buildGenerationSystemPrompt(profile: any, structureTemplate: any): string {
  const sections = structureTemplate.sections || [];
  return `You are generating a production-ready ${profile.primary_filename} instruction file for the AI coding tool "${profile.display_name}".

## TONE & STYLE
${profile.tone_guidelines || 'Professional, direct, actionable.'}

## FORMATTING
${profile.formatting_rules || 'Use Markdown with clear section hierarchy.'}

## REQUIRED SECTIONS
${sections.map((s: string, i: number) => `${i + 1}. ${s}`).join('\n')}

## SPECIAL DIRECTIVES
${profile.special_directives || 'None.'}

## QUALITY STANDARDS
- Every section must be actionable — no placeholders, no "TBD"
- Include specific file paths, commands, and code examples where relevant
- Reference the project's tech stack and architecture decisions
- Include acceptance criteria for key features
- The file must be comprehensive enough for the AI tool to build the project without additional context
- Incorporate expert review feedback where applicable`;
}
