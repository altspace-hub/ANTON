/**
 * legal-research.ts
 * REST API for Counsel's Desk legal research sessions.
 * Session CRUD + streaming Claude calls with legal-specialist prompt.
 */

import { Router, Request, Response } from 'express';
import type { DatabaseAdapter } from '../db/database.js';

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
  // ── Financial Crime & Compliance ──
  { id: 'eu-regulatory-lawyer', label: 'EU Regulatory Lawyer', focus: 'AMLR, AMLD6, AMLA, DORA, MiFID II, MAR — EU primary law and technical standards', category: 'compliance' },
  { id: 'sanctions-lawyer', label: 'Sanctions Lawyer', focus: 'EU, OFAC, OFSI sanctions frameworks — designation, screening, licensing, enforcement', category: 'compliance' },
  { id: 'abc-counsel', label: 'Anti-Bribery Counsel', focus: 'FCPA, UK Bribery Act, OECD Convention, UNCAC — corporate liability, adequate procedures', category: 'compliance' },
  { id: 'nordic-compliance', label: 'Nordic Compliance Counsel', focus: 'SE, FI, DK, NO, IS AML/CFT legislation, Finansinspektionen, Finanstilsynet practice', category: 'compliance' },
  { id: 'financial-crime-barrister', label: 'Financial Crime Barrister', focus: 'Criminal law, POCA, tipping-off, legal professional privilege, court proceedings', category: 'compliance' },
  { id: 'regulatory-affairs', label: 'Regulatory Affairs Advisor', focus: 'EBA/ESMA RTS, ITS, Guidelines, Q&As — technical standards development and application', category: 'compliance' },

  // ── Corporate & Business Law ──
  { id: 'corporate-counsel', label: 'Corporate Counsel', focus: 'Company law, board duties, governance, shareholder rights, M&A, restructuring, joint ventures', category: 'corporate' },
  { id: 'commercial-contracts', label: 'Commercial Contracts Counsel', focus: 'Contract drafting, interpretation, breach, remedies, limitation, force majeure, indemnities', category: 'corporate' },
  { id: 'ma-counsel', label: 'M&A Counsel', focus: 'Due diligence, SPA/APA drafting, warranties, earn-outs, competition clearance, post-completion', category: 'corporate' },
  { id: 'competition-lawyer', label: 'Competition & Antitrust Lawyer', focus: 'EU competition law, Art 101/102 TFEU, merger control, state aid, cartel investigations, dawn raids', category: 'corporate' },

  // ── Civil & Dispute Resolution ──
  { id: 'civil-litigation', label: 'Civil Litigation Counsel', focus: 'Tort, damages, injunctions, enforcement, cross-border disputes, limitation periods, appeals', category: 'civil' },
  { id: 'arbitration-counsel', label: 'Arbitration & ADR Counsel', focus: 'ICC, LCIA, SCC arbitration, mediation, investor-state disputes, enforcement of awards', category: 'civil' },
  { id: 'employment-lawyer', label: 'Employment Law Counsel', focus: 'Labor law, discrimination, termination, collective agreements, works councils, TUPE/transfers', category: 'civil' },
  { id: 'real-estate-counsel', label: 'Real Estate Counsel', focus: 'Property transactions, leases, planning, construction law, landlord-tenant disputes', category: 'civil' },

  // ── Technology, Data & IP ──
  { id: 'data-privacy-counsel', label: 'Data Protection Counsel', focus: 'GDPR, ePrivacy, cross-border transfers, DPIAs, breach notification, AI Act, data governance', category: 'tech' },
  { id: 'tech-ip-counsel', label: 'Technology & IP Counsel', focus: 'Patents, trademarks, copyright, trade secrets, licensing, SaaS/cloud contracts, open source', category: 'tech' },
  { id: 'ai-regulation-counsel', label: 'AI & Digital Regulation Counsel', focus: 'EU AI Act, DSA, DMA, algorithmic accountability, AI liability, emerging tech regulation', category: 'tech' },

  // ── Banking, Finance & Insurance ──
  { id: 'banking-finance-counsel', label: 'Banking & Finance Counsel', focus: 'CRD/CRR, PSD2/PSR, prudential regulation, securitisation, loan documentation, payment services', category: 'finance' },
  { id: 'capital-markets-counsel', label: 'Capital Markets Counsel', focus: 'Prospectus regulation, MAR, short selling, MiFID II, listing rules, securities offerings', category: 'finance' },
  { id: 'insurance-counsel', label: 'Insurance Law Counsel', focus: 'Solvency II, IDD, claims handling, reinsurance, policy interpretation, Lloyd\'s market', category: 'finance' },

  // ── Public & International ──
  { id: 'public-procurement', label: 'Public Procurement Counsel', focus: 'EU procurement directives, tender procedures, concessions, remedies, framework agreements', category: 'public' },
  { id: 'international-trade', label: 'International Trade Counsel', focus: 'Export controls, dual-use goods, customs law, WTO, trade agreements, trade sanctions', category: 'public' },
  { id: 'environmental-counsel', label: 'Environmental & ESG Counsel', focus: 'CSRD, EU Taxonomy, emissions trading, environmental liability, green bonds, greenwashing', category: 'public' },
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

export async function createLegalResearchRoutes(db: DatabaseAdapter, sharedAnthropic?: Anthropic | undefined): Router {
  const router = Router();
  const anthropic = sharedAnthropic ?? (process.env.ANTHROPIC_API_KEY ? new AnthropicSDK({ apiKey: process.env.ANTHROPIC_API_KEY }) : null);

  // ── List all sessions ───────────────────────────────────────────────────────
  router.get('/legal-research', async (req: Request, res: Response) => {
    try {
      const uid = getUserId(req);
      const sessions = await db.all(
        `SELECT id, title, mode, expert_role, created_at, updated_at
         FROM legal_research_sessions WHERE user_id = ?
         ORDER BY updated_at DESC LIMIT 50`
      , uid);
      res.json({ sessions });
    } catch (err) {
      console.error('[legal-research] list error:', err);
      res.status(500).json({ error: 'Failed to list sessions' });
    }
  });

  // ── Create session ──────────────────────────────────────────────────────────
  router.post('/legal-research', async (req: Request, res: Response) => {
    try {
      const uid = getUserId(req);
      const { title, mode, expert_role } = req.body as { title?: string; mode?: string; expert_role?: string };
      const id = randomUUID();
      const now = new Date().toISOString();
      await db.run(
        `INSERT INTO legal_research_sessions (id, title, mode, expert_role, user_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ,
        id,
        title || 'Untitled Legal Research',
        mode || 'deep-dive',
        expert_role || 'eu-regulatory-lawyer',
        uid,
        now,
        now
      );
      const session = await db.get('SELECT * FROM legal_research_sessions WHERE id = ?', id);
      res.status(201).json({ session });
    } catch (err) {
      console.error('[legal-research] create error:', err);
      res.status(500).json({ error: 'Failed to create session' });
    }
  });

  // ── Get single session ──────────────────────────────────────────────────────
  router.get('/legal-research/:id', async (req: Request, res: Response) => {
    try {
      const uid = getUserId(req);
      const session = await db.get('SELECT * FROM legal_research_sessions WHERE id = ? AND user_id = ?', req.params.id, uid);
      if (!session) return res.status(404).json({ error: 'Session not found' });
      res.json({ session });
    } catch (err) {
      console.error('[legal-research] get error:', err);
      res.status(500).json({ error: 'Failed to get session' });
    }
  });

  // ── Update session (config, questions, pinned, citations) ───────────────────
  router.patch('/legal-research/:id', async (req: Request, res: Response) => {
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
      await db.run(`UPDATE legal_research_sessions SET ${sets}, updated_at = ? WHERE id = ? AND user_id = ?`, ...vals);
      const session = await db.get('SELECT * FROM legal_research_sessions WHERE id = ? AND user_id = ?', req.params.id, uid);
      res.json({ session });
    } catch (err) {
      console.error('[legal-research] update error:', err);
      res.status(500).json({ error: 'Failed to update session' });
    }
  });

  // ── Delete session ──────────────────────────────────────────────────────────
  router.delete('/legal-research/:id', async (req: Request, res: Response) => {
    try {
      const uid = getUserId(req);
      await db.run('DELETE FROM legal_research_sessions WHERE id = ? AND user_id = ?', req.params.id, uid);
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
      const session = await db.get('SELECT * FROM legal_research_sessions WHERE id = ? AND user_id = ?', req.params.id, uid) as {
        mode: string; expert_role: string; active_knowledge_packs: string } | undefined;
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
          const kpService = await createKnowledgePackService(db);
          const allActiveSummary = kpService.getActivePacksSummary();
          if (allActiveSummary) {
            // Filter to only packs named in the session's active list
            const placeholders = activePackNames.map(() => '?').join(',');
            const packRows = await db.all(`SELECT display_name, regulatory_area, regulation_ids, entity_count FROM knowledge_packs WHERE display_name IN (${placeholders}) AND status='active'`, ...activePackNames) as Array<{ display_name: string; regulatory_area: string | null; regulation_ids: string; entity_count: number }>;
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
      const orgContextLayer = await buildOrgContextLayer(db, uid);
      const orgContextSection = orgContextLayer ? `\n\n${orgContextLayer}` : '';

      // ONBOARD-04: plain language prefix instruction
      const plainLanguageInstruction = plainLanguageMode
        ? '\n\n## PLAIN LANGUAGE MODE — ACTIVE\nBefore your full legal analysis, first provide a short "PLAIN LANGUAGE SUMMARY" section (max 150 words). Write it for a non-lawyer board member: no Latin, no statute numbers, just clear plain English explaining what the issue is, what it means for the organisation, and what the recommended action is. Then proceed with the full legal analysis as normal.'
        : '';

      const toneInstruction = '\n\n## TONE & STYLE\nUse strict professional legal language throughout. No emojis. No colloquialisms. Structure responses with clear headings, numbered points, and precise legal references. Maintain the register expected by a senior legal practitioner reviewing the analysis.';

      const systemPrompt = basePrompt + modeInstruction + roleInstruction + toneInstruction + orgContextSection + knowledgePackSection + plainLanguageInstruction;

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
      await db.run('UPDATE legal_research_sessions SET updated_at = ? WHERE id = ?', new Date().toISOString(), req.params.id);

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
  router.get('/legal-research-meta/config', async (_req: Request, res: Response) => {
    res.json({ modes: LEGAL_MODES, expertRoles: EXPERT_ROLES });
  });

  return router;
}
