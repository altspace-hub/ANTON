import { Router, type Response } from 'express';
import type { DatabaseAdapter } from '../db/database.js';

import { randomUUID } from 'crypto';
import { getRoutedUtilityModel } from '../services/utility-model.js';
import { callChat, mapModelToProvider } from '../services/provider-router.js';
import { JSON_ONLY_NUDGE } from '../services/adapters/provider-extras.js';
import { extractJsonReply, isJsonObject } from '../services/coding-workspace.js';
import { publicErrorMessage } from '../lib/error-response.js';
import { chargeMonthlyUsage } from '../services/budget-manager.js';
import { assertOwned, ownerFilter, scopesToOwner, type OwnedRequest } from '../middleware/ownership.js';
import { isDemoMode, demoModuleHidden } from '../middleware/demo-mode.js';
import { hasAnyModelEngine, NO_MODEL_ENGINE_MESSAGE } from '../services/claude-engine-availability.js';
import { modelCallErrorStatus } from '../services/side-route-model.js';

/** The area a demo visitor's module goes to when the one asked for is kept off the demo. */
const DEMO_FALLBACK_AREA = 'my-modules';

/**
 * The area to store for a module the caller writes. On a demo a visitor may
 * not file a module under an area the demo keeps off (demoModuleHidden: health,
 * HR, workers' rights): GET /custom-modules/:id would then answer 404 to its
 * own owner, and the module would invite the data those areas are closed for.
 * Such an area becomes DEMO_FALLBACK_AREA. Everyone else keeps what they sent.
 */
function areaForCaller(req: OwnedRequest, area: unknown): string | null {
  if (typeof area !== 'string' || !area.trim()) return null;
  const value = area.trim().slice(0, 100);
  if (isDemoMode() && req.user?.role !== 'admin' && demoModuleHidden(null, value)) return DEMO_FALLBACK_AREA;
  return value;
}

/** Guided-builder turns sent to the model: the last ones only, each bounded. */
const GUIDE_MAX_TURNS = 30;
const GUIDE_MAX_TURN_CHARS = 8_000;

/** The conversation as the client sent it, cleaned: user/assistant turns of text, the latest GUIDE_MAX_TURNS. */
function guideTurns(messages: unknown): Array<{ role: 'user' | 'assistant'; content: string }> {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter((m): m is { role: 'user' | 'assistant'; content: string } =>
      !!m && typeof m === 'object'
      && ((m as { role?: unknown }).role === 'user' || (m as { role?: unknown }).role === 'assistant')
      && typeof (m as { content?: unknown }).content === 'string')
    .slice(-GUIDE_MAX_TURNS)
    .map((m) => ({ role: m.role, content: m.content.slice(0, GUIDE_MAX_TURN_CHARS) }));
}

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

/** The generator's reply must be one JSON object with at least a name and a system prompt. */
function isModuleConfig(value: unknown): boolean {
  return isJsonObject(value) && typeof value.name === 'string' && typeof value.system_prompt === 'string';
}

/**
 * Whether the caller may read one custom module: its owner, an admin, anyone in
 * solo mode, or anyone once it is shared with the community. A row the caller
 * may not read answers like a missing one. Exported for the other routes that
 * read a module by id (exchange export and fingerprint).
 */
export async function canReadCustomModule(db: DatabaseAdapter, req: OwnedRequest, id: string): Promise<boolean> {
  if (!scopesToOwner(req)) {
    return !!(await db.get('SELECT 1 AS ok FROM custom_modules WHERE id = ?', id));
  }
  if (!req.user?.id) return false;
  return !!(await db.get(
    'SELECT 1 AS ok FROM custom_modules WHERE id = ? AND (user_id = ? OR is_shared_with_community = 1)',
    id, req.user.id,
  ));
}

/**
 * Demo mode: whether a visitor (a non-admin) must not see this custom module,
 * because its id or its area is kept off the demo (demoModuleHidden, the same
 * rule as the built-in catalogue in routes/modules.ts and the run route). An
 * admin, and everyone outside demo mode, sees it.
 */
function hiddenFromDemoVisitor(req: OwnedRequest, row: { id?: unknown; area?: unknown }): boolean {
  if (!isDemoMode() || req.user?.role === 'admin') return false;
  return demoModuleHidden(
    typeof row.id === 'string' ? row.id : null,
    typeof row.area === 'string' ? row.area : null,
  );
}

/**
 * Custom modules belong to the person who made them (custom_modules.user_id,
 * migration 290). In team mode a user lists their own, reads their own plus the
 * community-shared ones, and only the owner or an admin may edit, delete or
 * share one: a module's system prompt is what everyone who runs it gets, so it
 * is not everyone's to rewrite. Solo mode is not scoped.
 */
/**
 * Bounds on what a module stores. POST and PATCH are open to demo visitors,
 * and every other route that stores a visitor's bytes has a bound (versions,
 * uploads); without one a single request stored an 11 MB prompt.
 */
const MODULE_FIELD_LIMITS: ReadonlyArray<readonly [field: string, max: number]> = [
  ['name', 200], ['short_name', 50], ['description', 2_000], ['icon', 50], ['area', 100], ['system_prompt', 100_000],
];
const MODULE_CONFIG_MAX_CHARS = 200_000;
/** Modules one demo visitor may keep. */
const DEMO_MODULES_PER_ACCOUNT = 50;

/** Why a module body is too large to store, or null. */
export function moduleSizeProblem(body: Record<string, unknown>): string | null {
  for (const [field, max] of MODULE_FIELD_LIMITS) {
    const v = body[field];
    if (typeof v === 'string' && v.length > max) return `${field} is too long (at most ${max.toLocaleString('en-GB')} characters).`;
  }
  if (body.config !== undefined && JSON.stringify(body.config ?? {}).length > MODULE_CONFIG_MAX_CHARS) {
    return `config is too large (at most ${MODULE_CONFIG_MAX_CHARS.toLocaleString('en-GB')} characters).`;
  }
  return null;
}

export async function createCustomModuleRoutes(db: DatabaseAdapter) {
  const router = Router();

  const ownedModule = (req: OwnedRequest, res: Response, id: string) =>
    assertOwned(db, req, res, { table: 'custom_modules', ownerColumn: 'user_id', id, notFoundMessage: 'Not found' });

  // GET /api/custom-modules — list the caller's custom modules (all of them for admins and solo)
  router.get('/custom-modules', async (req, res) => {
    try {
      const scope = ownerFilter(req, 'user_id');
      const modules = await db.all(
        `SELECT * FROM custom_modules WHERE 1=1${scope.sql} ORDER BY updated_at DESC`,
        ...scope.params,
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
      if (!(await canReadCustomModule(db, req, req.params.id))) return res.status(404).json({ error: 'Not found' });
      const m = await db.get(`SELECT * FROM custom_modules WHERE id = ?`, req.params.id) as Record<string, unknown> | undefined;
      if (!m || hiddenFromDemoVisitor(req, m)) return res.status(404).json({ error: 'Not found' });
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
      const tooLarge = moduleSizeProblem(req.body as Record<string, unknown>);
      if (tooLarge) return res.status(413).json({ error: tooLarge });
      if (isDemoMode() && req.user?.role !== 'admin') {
        const n = await db.get<{ n: number | string }>('SELECT COUNT(*) AS n FROM custom_modules WHERE user_id = ?', req.user?.id ?? '');
        if (Number(n?.n ?? 0) >= DEMO_MODULES_PER_ACCOUNT) {
          return res.status(409).json({ error: `This demo account already has ${DEMO_MODULES_PER_ACCOUNT} modules. Delete one before saving another.` });
        }
      }

      const id = `custom-${randomUUID().slice(0, 8)}`;
      const now = new Date().toISOString();

      await db.run(`
        INSERT INTO custom_modules (id, name, short_name, description, icon, area, system_prompt, config, created_at, updated_at, user_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        id,
        name.trim(),
        (short_name || name).trim().slice(0, 20),
        description || '',
        icon || 'Puzzle',
        areaForCaller(req, area) ?? 'custom',
        system_prompt || '',
        JSON.stringify(config || {}),
        now,
        now,
        req.user?.id ?? null,
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
      if (!(await ownedModule(req, res, req.params.id))) return;

      const { name, short_name, description, icon, area, system_prompt, config } = req.body as Record<string, unknown>;
      const tooLarge = moduleSizeProblem(req.body as Record<string, unknown>);
      if (tooLarge) return res.status(413).json({ error: tooLarge });
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
        areaForCaller(req, area),
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
      if (!(await ownedModule(req, res, req.params.id))) return;
      const result = await db.run(`DELETE FROM custom_modules WHERE id = ?`, req.params.id);
      if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
      // The copies Build Module saved on every save (POST /versions/module/:id)
      // go with it: a visitor cannot list or delete them, and deleting the
      // module is how they remove what they wrote.
      await db.run(`DELETE FROM versions WHERE entity_type = 'module' AND entity_id = ?`, req.params.id);
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

      // Only the owner (or an admin) may put a module in front of everyone.
      if (!(await assertOwned(db, req, res, {
        table: 'custom_modules', ownerColumn: 'user_id', id: moduleId, notFoundMessage: 'Module not found',
      }))) return;
      await db.run(`UPDATE custom_modules SET is_shared_with_community = 1, updated_at = ? WHERE id = ?`, new Date().toISOString(), moduleId);
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to share module with community' });
    }
  });

  // GET /api/modules/community — return all community-shared custom modules
  // (on a demo, a visitor gets none whose id or area is kept off the demo)
  router.get('/modules/community', async (req, res) => {
    try {
      const modules = await db.all(`SELECT * FROM custom_modules WHERE is_shared_with_community = 1 ORDER BY updated_at DESC`) as Record<string, unknown>[];
      res.json(modules.filter((m) => !hiddenFromDemoVisitor(req, m)).map((m) => ({
        ...m,
        config: typeof m.config === 'string' ? JSON.parse(m.config as string) : m.config,
      })));
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch community modules' });
    }
  });

  // POST /api/custom-modules/guide-message — AI-guided module builder: one chat turn
  // The model calls below go through provider-router on the configured
  // engine. They were gated on an Anthropic client, built only from
  // ANTHROPIC_API_KEY, and answered 503 on a server whose engine is an
  // OpenAI-compatible endpoint — for an administrator too.
  router.post('/custom-modules/guide-message', async (req, res) => {
    if (!hasAnyModelEngine()) {
      return res.status(503).json({ error: NO_MODEL_ENGINE_MESSAGE });
    }
    const { messages, userMessage } = req.body as {
      messages?: unknown;
      userMessage?: unknown;
    };
    if (typeof userMessage !== 'string' || !userMessage.trim()) {
      return res.status(400).json({ error: 'userMessage is required' });
    }
    try {
      const allMessages = [
        ...guideTurns(messages),
        { role: 'user' as const, content: userMessage.trim().slice(0, GUIDE_MAX_TURN_CHARS) },
      ];
      const result = await callChat({
        model: await getRoutedUtilityModel(db),
        maxTokens: 512,
        system: GUIDE_SYSTEM_PROMPT,
        messages: allMessages,
        db,
        purpose: 'module-builder-guide',
      });
      await chargeMonthlyUsage(db, req.user, result.inputTokens, result.outputTokens);
      res.json({ response: result.text });
    } catch (err) {
      res.status(modelCallErrorStatus(err)).json({ error: publicErrorMessage(err) });
    }
  });

  // POST /api/custom-modules/guide-generate — generate module config JSON from conversation
  router.post('/custom-modules/guide-generate', async (req, res) => {
    if (!hasAnyModelEngine()) {
      return res.status(503).json({ error: NO_MODEL_ENGINE_MESSAGE });
    }
    const turns = guideTurns((req.body as { messages?: unknown }).messages);
    if (turns.length === 0) {
      return res.status(400).json({ error: 'messages are required' });
    }
    try {
      const conversationSummary = turns
        .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
        .join('\n\n');
      const ask = (system: string) => callChat({
        model: mapModelToProvider('claude-sonnet-4-6'),
        maxTokens: 2048,
        system,
        messages: [
          {
            role: 'user',
            content: `Here is the discovery conversation:\n\n${conversationSummary}\n\nGenerate the module configuration JSON now.`,
          },
        ],
        jsonMode: true,
        db,
        purpose: 'module-builder-generate',
      }).then(async (r) => { await chargeMonthlyUsage(db, req.user, r.inputTokens, r.outputTokens); return r; });
      // A reply with prose, reasoning or a fence around the JSON is read
      // (extractJsonReply), and one with no usable object is asked once more
      // for JSON only. A strict JSON.parse failed on GLM, DeepSeek and Kimi
      // replies that carried any text beside the object.
      let reply = extractJsonReply((await ask(GENERATE_SYSTEM_PROMPT)).text, isModuleConfig);
      if (!reply || !isModuleConfig(reply.value)) {
        reply = extractJsonReply((await ask(GENERATE_SYSTEM_PROMPT + JSON_ONLY_NUDGE)).text, isModuleConfig);
      }
      if (!reply || !isModuleConfig(reply.value)) {
        return res.status(502).json({ error: 'The model did not return a module configuration. Try Generate again.' });
      }
      const moduleConfig = reply.value as Record<string, unknown>;
      // A demo visitor's module never lands in an area the demo keeps off.
      if (isDemoMode() && req.user?.role !== 'admin' && typeof moduleConfig.area === 'string'
        && demoModuleHidden(null, moduleConfig.area)) {
        moduleConfig.area = DEMO_FALLBACK_AREA;
      }
      res.json({ moduleConfig });
    } catch (err) {
      res.status(modelCallErrorStatus(err)).json({ error: publicErrorMessage(err) });
    }
  });

  // POST /api/custom-modules/test-run — non-streaming preview with Haiku
  router.post('/custom-modules/test-run', async (req, res) => {
    if (!hasAnyModelEngine()) return res.status(503).json({ error: NO_MODEL_ENGINE_MESSAGE });
    const { systemPrompt, referenceOutput, testQuery, knowledgeLibraryIds } = req.body as {
      systemPrompt?: unknown;
      referenceOutput?: unknown;
      testQuery?: unknown;
      knowledgeLibraryIds?: unknown;
    };
    if (typeof testQuery !== 'string' || !testQuery.trim()) return res.status(400).json({ error: 'testQuery is required' });
    if (typeof systemPrompt !== 'string' || !systemPrompt.trim()) return res.status(400).json({ error: 'systemPrompt is required' });
    // Ids of knowledge_library rows: strings only, at most 50.
    const libraryIds = Array.isArray(knowledgeLibraryIds)
      ? [...new Set(knowledgeLibraryIds.filter((id): id is string => typeof id === 'string' && id.length > 0 && id.length <= 200))].slice(0, 50)
      : [];

    try {
      let fullSystem = systemPrompt.trim();

      // Name the knowledge corpora the module will use — their labels only.
      // The server path of each corpus is this machine's business, not the
      // model host's: it went into the prompt sent to the provider.
      if (libraryIds.length > 0) {
        const placeholders = libraryIds.map(() => '?').join(',');
        const entries = await db.all<{ label: string }>(`SELECT label FROM knowledge_library WHERE id IN (${placeholders})`, libraryIds);
        const labels = entries.map((e) => (typeof e.label === 'string' ? e.label.trim() : '')).filter(Boolean);
        if (labels.length > 0) {
          fullSystem += `\n\n## KNOWLEDGE SOURCES\nThe following document corpora are available:\n${labels.map((l) => `- ${l}`).join('\n')}`;
        }
      }

      if (typeof referenceOutput === 'string' && referenceOutput.trim()) {
        fullSystem += `\n\n## REFERENCE OUTPUT EXAMPLE\nMatch the structure, depth, and formatting of this example:\n<reference>\n${referenceOutput.trim()}\n</reference>`;
      }

      const resolvedModel = await getRoutedUtilityModel(db);
      const result = await callChat({
        model: resolvedModel,
        maxTokens: 2048,
        system: fullSystem,
        messages: [{ role: 'user', content: testQuery.trim() }],
        db,
        purpose: 'module-builder-test-run',
      });
      await chargeMonthlyUsage(db, req.user, result.inputTokens, result.outputTokens);

      res.json({
        response: result.text,
        tokens_used: result.inputTokens + result.outputTokens,
        model: resolvedModel,
      });
    } catch (err) {
      res.status(modelCallErrorStatus(err)).json({ error: publicErrorMessage(err) });
    }
  });

  return router;
}
