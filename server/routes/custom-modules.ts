import { Router } from 'express';
import type { DatabaseAdapter } from '../db/database.js';

import { randomUUID } from 'crypto';
import Anthropic from '@anthropic-ai/sdk';
import { callChat, mapModelToProvider } from '../services/provider-router.js';
import { safeError } from '../lib/error-response.js';

const GUIDE_SYSTEM_PROMPT = `You are a friendly AI module designer helping users create custom Claude modules tailored to their specific tasks.

Your job is to have a brief, helpful conversation to understand:
1. What task or problem they want to solve
2. Who will use this module (audience, expertise level)
3. What kind of output or deliverable they need
4. What domain expertise or tone is most relevant
5. Any specific style, format, or constraints

Rules:
- Ask ONE or TWO clear questions per reply. Never ask more.
- Be warm and concise. Maximum 3-4 sentences or a short bulleted list per response.
- After 2-4 exchanges you will have enough to design the module.
- When you have enough information, end your response with: "I think I have everything I need — click **Generate Module** when you're ready!"
- Never write the module config yourself in this chat — that happens via the Generate step.`;

const GENERATE_SYSTEM_PROMPT = `You are an expert AI module designer. Based on the conversation provided, generate a complete module configuration.

Return ONLY a valid JSON object with NO markdown fences, NO explanation, just the raw JSON:

{
  "name": "Full descriptive module name (5-10 words)",
  "short_name": "Max 20 chars for sidebar",
  "description": "1-2 sentence description of what this module does and who uses it",
  "icon": "Puzzle",
  "area": "my-modules",
  "system_prompt": "## MODULE NAME\\n\\nDetailed system prompt in markdown. Minimum 150 words. Use ## headers. Explain the expert role, analysis framework, and output requirements clearly.",
  "thinking": "think_hard",
  "creativity": "balanced",
  "personas": [],
  "skills": [],
  "output_formats": []
}

VALID icon values: Puzzle, Star, Zap, Shield, BookOpen, FileText, Search, Target, Lightbulb, Globe, Lock, BarChart3, Users, Briefcase, Award

VALID thinking values: quick, think, think_hard, investigate, plan_first
VALID creativity values: strict, balanced, creative

VALID persona IDs (pick 0-3 most relevant):
general-assistant, fcp-expert, legal-expert, cco, business-expert, trade-expert, fsa-regulator, financial-police, cyber-expert, sanctions-expert, auditor, data-scientist, risk-specialist, hr-expert, finance-expert, tech-expert, strategy-expert, startup-advisor, devil-advocate, systems-thinker, pragmatist, optimist, simplifier, synthesiser, digital-marketing-manager, dpo, tax-director, policy-analyst, board-member, regulator, journalist, customer, employee, investor, technical-team

VALID skill IDs (pick 0-3 most relevant):
eu-regulatory-navigator, plain-language, startup-mode, amlr-article-ref, nordic-regulatory-navigator, regulatory-examiner, risk-based-thinking, socratic-method, data-storytelling, investor-lens

VALID output format IDs (pick 1-4 most relevant):
executive-summary, decision-memo, detailed-findings, regulatory-comparison, impact-assessment, project-plan, action-plan, mitigation-plan, policy-document, raci-matrix, gap-scoring-matrix, maturity-assessment, data-readiness-scorecard, quick-briefing, problem-solution, stakeholder-presentation, training-material, client-proposal, compliance-calendar, monitoring-plan, budget-resource-estimate, plain-language-guide, faq-document, press-release, field-guide, step-by-step-guide, campaign-brief, product-requirements-doc, policy-brief, privacy-impact-assessment

Choose area based on the domain. Common area IDs: financial-crime-prevention, legal-compliance, risk-management, banking-finance, technology, marketing-communications, hr-talent, strategy-consulting, legal-general, tax, data-analytics, startups-entrepreneurship, education, healthcare, coding, my-modules`;

export async function createCustomModuleRoutes(db: DatabaseAdapter, anthropic?: Anthropic) {
  const router = Router();

  // GET /api/custom-modules — list all custom modules
  router.get('/custom-modules', async (_req, res) => {
    try {
      const modules = await db.all(
        `SELECT * FROM custom_modules ORDER BY updated_at DESC`
      ) as Record<string, unknown>[];
      res.json(modules.map((m) => ({
        ...m,
        config: typeof m.config === 'string' ? JSON.parse(m.config as string) : m.config,
      })));
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch custom modules' });
    }
  });

  // GET /api/custom-modules/:id — get single custom module
  router.get('/custom-modules/:id', async (req, res) => {
    try {
      const m = await db.get(`SELECT * FROM custom_modules WHERE id = ?`, req.params.id) as Record<string, unknown> | undefined;
      if (!m) return res.status(404).json({ error: 'Not found' });
      res.json({ ...m, config: typeof m.config === 'string' ? JSON.parse(m.config as string) : m.config });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch custom module' });
    }
  });

  // POST /api/custom-modules — create custom module
  router.post('/custom-modules', async (req, res) => {
    try {
      const { name, short_name, description, icon, area, system_prompt, config } = req.body as {
        name: string;
        short_name?: string;
        description?: string;
        icon?: string;
        area?: string;
        system_prompt?: string;
        config?: Record<string, unknown>;
      };

      if (!name?.trim()) {
        return res.status(400).json({ error: 'name is required' });
      }

      const id = `custom-${randomUUID().slice(0, 8)}`;
      const now = new Date().toISOString();

      await db.run(`
        INSERT INTO custom_modules (id, name, short_name, description, icon, area, system_prompt, config, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        id,
        name.trim(),
        (short_name || name).trim().slice(0, 20),
        description || '',
        icon || 'Puzzle',
        area || 'custom',
        system_prompt || '',
        JSON.stringify(config || {}),
        now,
        now,
      );

      const created = await db.get(`SELECT * FROM custom_modules WHERE id = ?`, id) as Record<string, unknown>;
      res.status(201).json({ ...created, config: JSON.parse(created.config as string) });
    } catch (error) {
      res.status(500).json({ error: 'Failed to create custom module' });
    }
  });

  // PATCH /api/custom-modules/:id — update custom module
  router.patch('/custom-modules/:id', async (req, res) => {
    try {
      const existing = await db.get(`SELECT * FROM custom_modules WHERE id = ?`, req.params.id);
      if (!existing) return res.status(404).json({ error: 'Not found' });

      const { name, short_name, description, icon, area, system_prompt, config } = req.body as Record<string, unknown>;
      const now = new Date().toISOString();

      await db.run(`
        UPDATE custom_modules
        SET name = COALESCE(?, name),
            short_name = COALESCE(?, short_name),
            description = COALESCE(?, description),
            icon = COALESCE(?, icon),
            area = COALESCE(?, area),
            system_prompt = COALESCE(?, system_prompt),
            config = COALESCE(?, config),
            updated_at = ?
        WHERE id = ?
      `,
        name || null,
        short_name || null,
        description || null,
        icon || null,
        area || null,
        system_prompt || null,
        config ? JSON.stringify(config) : null,
        now,
        req.params.id,
      );

      const updated = await db.get(`SELECT * FROM custom_modules WHERE id = ?`, req.params.id) as Record<string, unknown>;
      res.json({ ...updated, config: JSON.parse(updated.config as string) });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update custom module' });
    }
  });

  // DELETE /api/custom-modules/:id
  router.delete('/custom-modules/:id', async (req, res) => {
    try {
      const result = await db.run(`DELETE FROM custom_modules WHERE id = ?`, req.params.id);
      if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete custom module' });
    }
  });

  // POST /api/modules/community — mark a custom module as community-shared
  router.post('/modules/community', async (req, res) => {
    try {
      const { moduleId } = req.body as { moduleId: string };
      if (!moduleId?.trim()) {
        res.status(400).json({ error: 'moduleId is required' });
        return;
      }

      const existing = await db.get(`SELECT id FROM custom_modules WHERE id = ?`, moduleId);
      if (!existing) {
        res.status(404).json({ error: 'Module not found' });
        return;
      }
      await db.run(`UPDATE custom_modules SET is_shared_with_community = 1, updated_at = ? WHERE id = ?`, new Date().toISOString(), moduleId);
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to share module with community' });
    }
  });

  // GET /api/modules/community — return all community-shared custom modules
  router.get('/modules/community', async (_req, res) => {
    try {
      const modules = await db.all(`SELECT * FROM custom_modules WHERE is_shared_with_community = 1 ORDER BY updated_at DESC`) as Record<string, unknown>[];
      res.json(modules.map((m) => ({
        ...m,
        config: typeof m.config === 'string' ? JSON.parse(m.config as string) : m.config,
      })));
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch community modules' });
    }
  });

  // POST /api/custom-modules/guide-message — AI-guided module builder: one chat turn
  router.post('/custom-modules/guide-message', async (req, res) => {
    if (!anthropic) {
      return res.status(503).json({ error: 'AI service not configured' });
    }
    const { messages, userMessage } = req.body as {
      messages: Array<{ role: 'user' | 'assistant'; content: string }>;
      userMessage: string;
    };
    if (!userMessage?.trim()) {
      return res.status(400).json({ error: 'userMessage is required' });
    }
    try {
      const allMessages = [
        ...messages,
        { role: 'user' as const, content: userMessage.trim() },
      ];
      const result = await callChat({
        model: mapModelToProvider('claude-haiku-4-5-20251001'),
        maxTokens: 512,
        system: GUIDE_SYSTEM_PROMPT,
        messages: allMessages,
      });
      res.json({ response: result.text });
    } catch (err) {
      const msg = safeError(err);
      res.status(500).json({ error: msg });
    }
  });

  // POST /api/custom-modules/guide-generate — generate module config JSON from conversation
  router.post('/custom-modules/guide-generate', async (req, res) => {
    if (!anthropic) {
      return res.status(503).json({ error: 'AI service not configured' });
    }
    const { messages } = req.body as {
      messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    };
    if (!messages?.length) {
      return res.status(400).json({ error: 'messages are required' });
    }
    try {
      const conversationSummary = messages
        .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
        .join('\n\n');
      const result = await callChat({
        model: mapModelToProvider('claude-sonnet-4-6'),
        maxTokens: 2048,
        system: GENERATE_SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: `Here is the discovery conversation:\n\n${conversationSummary}\n\nGenerate the module configuration JSON now.`,
          },
        ],
      });
      const text = result.text.trim();
      // Strip any accidental markdown fences
      const cleaned = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
      const moduleConfig = JSON.parse(cleaned);
      res.json({ moduleConfig });
    } catch (err) {
      const msg = safeError(err);
      res.status(500).json({ error: msg });
    }
  });

  // POST /api/custom-modules/test-run — non-streaming preview with Haiku
  router.post('/custom-modules/test-run', async (req, res) => {
    if (!anthropic) return res.status(503).json({ error: 'AI service not configured' });
    const { systemPrompt, referenceOutput, testQuery, knowledgeLibraryIds } = req.body as {
      systemPrompt: string;
      referenceOutput?: string;
      testQuery: string;
      knowledgeLibraryIds?: string[];
    };
    if (!testQuery?.trim()) return res.status(400).json({ error: 'testQuery is required' });
    if (!systemPrompt?.trim()) return res.status(400).json({ error: 'systemPrompt is required' });

    try {
      let fullSystem = systemPrompt.trim();

      // Resolve knowledge library paths for context
      if (knowledgeLibraryIds && knowledgeLibraryIds.length > 0) {
        const placeholders = knowledgeLibraryIds.map(() => '?').join(',');
        const entries = await db.all(`SELECT path, label FROM knowledge_library WHERE id IN (${placeholders})`, ...knowledgeLibraryIds) as Array<{ path: string; label: string }>;
        if (entries.length > 0) {
          const pathList = entries.map(e => `- ${e.label}: ${e.path}`).join('\n');
          fullSystem += `\n\n## KNOWLEDGE SOURCES\nThe following document corpora are available:\n${pathList}`;
        }
      }

      if (referenceOutput?.trim()) {
        fullSystem += `\n\n## REFERENCE OUTPUT EXAMPLE\nMatch the structure, depth, and formatting of this example:\n<reference>\n${referenceOutput.trim()}\n</reference>`;
      }

      const resolvedModel = mapModelToProvider('claude-haiku-4-5-20251001');
      const result = await callChat({
        model: resolvedModel,
        maxTokens: 2048,
        system: fullSystem,
        messages: [{ role: 'user', content: testQuery.trim() }],
      });

      res.json({
        response: result.text,
        tokens_used: result.inputTokens + result.outputTokens,
        model: resolvedModel,
      });
    } catch (err) {
      const msg = safeError(err);
      res.status(500).json({ error: msg });
    }
  });

  return router;
}
