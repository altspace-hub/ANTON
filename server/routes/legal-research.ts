/**
 * legal-research.ts
 * REST API for Counsel's Desk legal research sessions.
 * Session CRUD + streaming Claude calls with legal-specialist prompt.
 */

import { Router, Request, Response } from 'express';
import type Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import type Anthropic from '@anthropic-ai/sdk';
import AnthropicSDK from '@anthropic-ai/sdk';
import { createKnowledgePackService } from '../services/knowledge-pack-service.js';
import { buildOrgContextLayer } from '../services/prompt-builder.js';
import { streamChat, mapModelToProvider } from '../services/provider-router.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Thinking token budget per mode (null = web-search mode, no thinking allowed)
const THINKING_BUDGETS: Record<string, number | null> = {
  'deep-dive': 16000,
  'hypothetical': 16000,
  'comparison': 8000,
  'case-law': null,       // typically used with web search
  'opinion': 24000,
  'gap-spotter': 16000,
  'comparative-jurisdiction': 16000,
  'rapid-risk': 4000,
};

// Eight interaction modes available in Counsel's Desk
export const LEGAL_MODES = [
  { id: 'deep-dive', label: 'Regulatory Deep-Dive', thinking: 'think_hard', icon: 'BookOpen' },
  { id: 'hypothetical', label: 'Hypothetical / Test Case', thinking: 'think_hard', icon: 'FlaskConical' },
  { id: 'comparison', label: 'Regulation Comparison', thinking: 'think', icon: 'GitCompare' },
  { id: 'case-law', label: 'Case Law Explorer', thinking: 'quick', icon: 'Search' },
  { id: 'opinion', label: 'Legal Opinion Draft', thinking: 'investigate', icon: 'FileText' },
  { id: 'gap-spotter', label: 'Regulatory Gap Spotter', thinking: 'investigate', icon: 'SearchCheck' },
  { id: 'comparative-jurisdiction', label: 'Comparative Jurisdiction', thinking: 'think_hard', icon: 'Globe' },
  { id: 'rapid-risk', label: 'Legal Risk Rapid', thinking: 'quick', icon: 'Zap' },
] as const;

export const EXPERT_ROLES = [
  { id: 'eu-regulatory-lawyer', label: 'EU Regulatory Lawyer', focus: 'AMLR, AMLD6, AMLA, DORA, MiFID II, MAR — EU primary law and technical standards' },
  { id: 'sanctions-lawyer', label: 'Sanctions Lawyer', focus: 'EU, OFAC, OFSI sanctions frameworks — designation, screening, licensing, enforcement' },
  { id: 'abc-counsel', label: 'Anti-Bribery Counsel', focus: 'FCPA, UK Bribery Act, OECD Convention, UNCAC — corporate liability, adequate procedures' },
  { id: 'nordic-compliance', label: 'Nordic Compliance Counsel', focus: 'SE, FI, DK, NO, IS AML/CFT legislation, Finansinspektionen, Finanstilsynet practice' },
  { id: 'financial-crime-barrister', label: 'Financial Crime Barrister', focus: 'Criminal law, POCA, tipping-off, legal professional privilege, court proceedings' },
  { id: 'regulatory-affairs', label: 'Regulatory Affairs Advisor', focus: 'EBA/ESMA RTS, ITS, Guidelines, Q&As — technical standards development and application' },
] as const;

function getUserId(req: Request): string {
  return (req as unknown as { user?: { id?: string } }).user?.id ?? 'default';
}

function loadBasePrompt(): string {
  try {
    const p = path.join(__dirname, '..', 'prompts', 'counsels-desk.md');
    return fs.readFileSync(p, 'utf-8');
  } catch {
    return 'You are a specialist legal research assistant for FCP lawyers and compliance counsel.';
  }
}

export function createLegalResearchRoutes(db: Database.Database, sharedAnthropic?: Anthropic | undefined): Router {
  const router = Router();
  const anthropic = sharedAnthropic ?? (process.env.ANTHROPIC_API_KEY ? new AnthropicSDK({ apiKey: process.env.ANTHROPIC_API_KEY }) : null);

  // ── List all sessions ───────────────────────────────────────────────────────
  router.get('/legal-research', (req: Request, res: Response) => {
    try {
      const uid = getUserId(req);
      const sessions = db.prepare(
        `SELECT id, title, mode, expert_role, created_at, updated_at
         FROM legal_research_sessions WHERE user_id = ?
         ORDER BY updated_at DESC LIMIT 50`
      ).all(uid);
      res.json({ sessions });
    } catch (err) {
      console.error('[legal-research] list error:', err);
      res.status(500).json({ error: 'Failed to list sessions' });
    }
  });

  // ── Create session ──────────────────────────────────────────────────────────
  router.post('/legal-research', (req: Request, res: Response) => {
    try {
      const uid = getUserId(req);
      const { title, mode, expert_role } = req.body as { title?: string; mode?: string; expert_role?: string };
      const id = randomUUID();
      const now = new Date().toISOString();
      db.prepare(
        `INSERT INTO legal_research_sessions (id, title, mode, expert_role, user_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        title || 'Untitled Legal Research',
        mode || 'deep-dive',
        expert_role || 'eu-regulatory-lawyer',
        uid,
        now,
        now
      );
      const session = db.prepare('SELECT * FROM legal_research_sessions WHERE id = ?').get(id);
      res.status(201).json({ session });
    } catch (err) {
      console.error('[legal-research] create error:', err);
      res.status(500).json({ error: 'Failed to create session' });
    }
  });

  // ── Get single session ──────────────────────────────────────────────────────
  router.get('/legal-research/:id', (req: Request, res: Response) => {
    try {
      const uid = getUserId(req);
      const session = db.prepare('SELECT * FROM legal_research_sessions WHERE id = ? AND user_id = ?').get(req.params.id, uid);
      if (!session) return res.status(404).json({ error: 'Session not found' });
      res.json({ session });
    } catch (err) {
      console.error('[legal-research] get error:', err);
      res.status(500).json({ error: 'Failed to get session' });
    }
  });

  // ── Update session (config, questions, pinned, citations) ───────────────────
  router.patch('/legal-research/:id', (req: Request, res: Response) => {
    try {
      const uid = getUserId(req);
      const allowed = ['title', 'mode', 'expert_role', 'research_questions', 'pinned_findings', 'citations', 'active_knowledge_packs'];
      const updates: Record<string, unknown> = {};
      for (const key of allowed) {
        if (req.body[key] !== undefined) {
          updates[key] = typeof req.body[key] === 'object' ? JSON.stringify(req.body[key]) : req.body[key];
        }
      }
      if (Object.keys(updates).length === 0) return res.json({ ok: true });

      // Keys are guaranteed safe: sourced from the allowed whitelist above
      const sets = Object.keys(updates).map(k => `${k} = ?`).join(', ');
      const vals = [...Object.values(updates), new Date().toISOString(), req.params.id, uid];
      db.prepare(`UPDATE legal_research_sessions SET ${sets}, updated_at = ? WHERE id = ? AND user_id = ?`).run(...vals);
      const session = db.prepare('SELECT * FROM legal_research_sessions WHERE id = ? AND user_id = ?').get(req.params.id, uid);
      res.json({ session });
    } catch (err) {
      console.error('[legal-research] update error:', err);
      res.status(500).json({ error: 'Failed to update session' });
    }
  });

  // ── Delete session ──────────────────────────────────────────────────────────
  router.delete('/legal-research/:id', (req: Request, res: Response) => {
    try {
      const uid = getUserId(req);
      db.prepare('DELETE FROM legal_research_sessions WHERE id = ? AND user_id = ?').run(req.params.id, uid);
      res.json({ ok: true });
    } catch (err) {
      console.error('[legal-research] delete error:', err);
      res.status(500).json({ error: 'Failed to delete session' });
    }
  });

  // ── Streaming Claude message ────────────────────────────────────────────────
  router.post('/legal-research/:id/message', async (req: Request, res: Response) => {
    if (!anthropic) return res.status(503).json({ error: 'Claude API not configured' });

    try {
      const uid = getUserId(req);
      const session = db.prepare('SELECT * FROM legal_research_sessions WHERE id = ? AND user_id = ?').get(req.params.id, uid) as
        | { mode: string; expert_role: string; active_knowledge_packs: string } | undefined;
      if (!session) return res.status(404).json({ error: 'Session not found' });

      const { messages, webSearchEnabled, plainLanguageMode } = req.body as {
        messages: Array<{ role: 'user' | 'assistant'; content: string }>;
        webSearchEnabled?: boolean;
        plainLanguageMode?: boolean;
      };

      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: 'messages array required' });
      }

      const basePrompt = loadBasePrompt();
      const modeInfo = LEGAL_MODES.find(m => m.id === session.mode);
      const roleInfo = EXPERT_ROLES.find(r => r.id === session.expert_role);

      const modeInstruction = modeInfo
        ? `\n\n## ACTIVE MODE: ${modeInfo.label.toUpperCase()}\nApply the analytical approach for ${modeInfo.label} as described in your instructions above.`
        : '';
      const roleInstruction = roleInfo
        ? `\n\n## YOUR ROLE\nYou are acting as a ${roleInfo.label}. Primary focus: ${roleInfo.focus}.`
        : '';

      // Inject active knowledge packs for this session
      let knowledgePackSection = '';
      try {
        const activePackNames: string[] = JSON.parse(session.active_knowledge_packs || '[]');
        if (activePackNames.length > 0) {
          const kpService = createKnowledgePackService(db);
          const allActiveSummary = kpService.getActivePacksSummary();
          if (allActiveSummary) {
            // Filter to only packs named in the session's active list
            const placeholders = activePackNames.map(() => '?').join(',');
            const packRows = db.prepare(
              `SELECT display_name, regulatory_area, regulation_ids, entity_count
               FROM knowledge_packs WHERE name IN (${placeholders}) AND status IN ('active','installed') ORDER BY tier ASC, display_name ASC`
            ).all(...activePackNames) as Array<{ display_name: string; regulatory_area: string | null; regulation_ids: string; entity_count: number }>;
            if (packRows.length > 0) {
              const lines = packRows.map(r => {
                const regs = ((): string => { try { return (JSON.parse(r.regulation_ids) as string[]).join(', '); } catch { return ''; } })();
                return `- ${r.display_name} (${r.regulatory_area ?? 'General'}, ${r.entity_count} entities${regs ? `, covers: ${regs}` : ''})`;
              });
              knowledgePackSection = `\n\n## ACTIVE KNOWLEDGE PACKS\nThe following regulatory knowledge packs are loaded for this session. Use them to ground and verify citations:\n${lines.join('\n')}`;
            }
          }
        }
      } catch { /* non-fatal — proceed without pack injection */ }

      // Inject org-wide context (entity type, jurisdiction, risk appetite, priorities)
      const orgContextLayer = buildOrgContextLayer(db, uid);
      const orgContextSection = orgContextLayer ? `\n\n${orgContextLayer}` : '';

      // ONBOARD-04: plain language prefix instruction
      const plainLanguageInstruction = plainLanguageMode
        ? '\n\n## PLAIN LANGUAGE MODE — ACTIVE\nBefore your full legal analysis, first provide a short "PLAIN LANGUAGE SUMMARY" section (max 150 words). Write it for a non-lawyer board member: no Latin, no statute numbers, just clear plain English explaining what the issue is, what it means for the organisation, and what the recommended action is. Then proceed with the full legal analysis as normal.'
        : '';

      const systemPrompt = basePrompt + modeInstruction + roleInstruction + orgContextSection + knowledgePackSection + plainLanguageInstruction;

      const tools = webSearchEnabled
        ? [{ type: 'web_search_20250305', name: 'web_search' }]
        : [];

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');

      // Thinking and tools (web search) are mutually exclusive in the Claude API
      const useThinking = tools.length === 0;
      // Map budget tiers to effort levels for provider-router thinking
      const EFFORT_MAP: Record<string, string> = {
        'deep-dive': 'investigate',
        'hypothetical': 'investigate',
        'comparison': 'think_hard',
        'opinion': 'investigate',
        'gap-spotter': 'investigate',
        'comparative-jurisdiction': 'think_hard',
        'rapid-risk': 'think',
      };
      const thinkingLevel = EFFORT_MAP[session.mode] ?? 'think_hard';

      await streamChat({
        model: mapModelToProvider('claude-opus-4-6'),
        system: systemPrompt,
        messages: messages as Array<{ role: string; content: string }>,
        maxTokens: 16000,
        thinkingLevel: useThinking ? thinkingLevel : undefined,
        tools: useThinking ? undefined : tools,
      }, res);

      res.write('data: [DONE]\n\n');
      res.end();

      // Update session timestamp
      db.prepare('UPDATE legal_research_sessions SET updated_at = ? WHERE id = ?')
        .run(new Date().toISOString(), req.params.id);

    } catch (err) {
      console.error('[legal-research] message error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Claude API call failed' });
      } else {
        res.write(`data: ${JSON.stringify({ type: 'error', error: String(err) })}\n\n`);
        res.end();
      }
    }
  });

  // ── Get available modes and expert roles ────────────────────────────────────
  router.get('/legal-research-meta/config', (_req: Request, res: Response) => {
    res.json({ modes: LEGAL_MODES, expertRoles: EXPERT_ROLES });
  });

  return router;
}
