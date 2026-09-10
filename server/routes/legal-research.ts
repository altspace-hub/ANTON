/**
 * legal-research.ts
 * REST API for Counsel's Desk legal research sessions.
 * Session CRUD + streaming Claude calls with legal-specialist prompt.
 */

import { safeError } from '../lib/error-response.js';
import { Router, Request, Response } from 'express';
import type { DatabaseAdapter } from '../db/database.js';

import { randomUUID } from 'crypto';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import type Anthropic from '@anthropic-ai/sdk';
import AnthropicSDK from '@anthropic-ai/sdk';
import { buildOrgContextLayer } from '../services/prompt-builder.js';
import { streamChat, mapModelToProvider } from '../services/provider-router.js';
import { getEffectiveDefaultModel } from '../services/default-model-store.js';
import { retrieveGroundingText } from '../services/framework-text-retrieval.js';
import { hasClaudeEngine, NO_CLAUDE_ENGINE_MESSAGE } from '../services/claude-engine-availability.js';
import { createCitationLedger, VERIFICATION_DISCLAIMER, type CitationInput } from '../services/citation-ledger.js';
import { bundleLegalResearchSessionToAnton } from '../services/anton-bundler.js';
import { signAntonBundle } from '../services/anton-bundle-signing.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── The matter (Wave 2, 2026-09-08) ─────────────────────────────────────────
// A session used to open on a blank textarea: nothing recorded about the
// facts, parties, jurisdiction or the decision the client needs, and no way
// to attach the contract or decision the question is about. The matter brief
// is taken by ANTON at intake; documents are attached by the consultant; both
// are injected into every research turn.
interface MatterDocument { id: string; name: string; text: string }
interface MatterSessionRow {
  id: string;
  title?: string;
  mode: string;
  expert_role: string;
  active_knowledge_packs: string;
  research_questions?: string | null;
  documents?: string | null;
  matter_brief?: string | null;
  intake_conversation?: string | null;
}
const MATTER_FIELDS = ['client', 'parties', 'facts', 'jurisdiction', 'question', 'decision_needed', 'deadline', 'risk_posture', 'instruments', 'constraints'] as const;
type MatterField = typeof MATTER_FIELDS[number];
const MATTER_LABELS: Record<MatterField, string> = {
  client: 'Client',
  parties: 'Parties',
  facts: 'Facts',
  jurisdiction: 'Governing law / jurisdiction',
  question: 'The question',
  decision_needed: 'Decision the client needs',
  deadline: 'Deadline',
  risk_posture: 'Risk posture',
  instruments: 'Instruments in play',
  constraints: 'Constraints and sensitivities',
};
const MAX_MATTER_DOCS = 20;
const MAX_MATTER_DOC_CHARS = 300_000;
/** Characters of attached documents injected into one research turn. */
const MATTER_DOC_BUDGET = 80_000;

/** The client's document list as stored: bounded, typed, or null when malformed. */
function sanitiseMatterDocuments(raw: unknown): MatterDocument[] | null {
  if (!Array.isArray(raw)) return null;
  const out: MatterDocument[] = [];
  for (const d of raw.slice(0, MAX_MATTER_DOCS)) {
    if (!d || typeof d !== 'object') return null;
    const { id, name, text } = d as Record<string, unknown>;
    if (typeof id !== 'string' || !id.trim() || typeof name !== 'string') return null;
    out.push({ id: id.slice(0, 200), name: name.trim().slice(0, 200) || id.slice(0, 200), text: typeof text === 'string' ? text.slice(0, MAX_MATTER_DOC_CHARS) : '' });
  }
  return out;
}

function parseMatterDocuments(raw: unknown): MatterDocument[] {
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return sanitiseMatterDocuments(parsed) ?? [];
  } catch { return []; }
}

function parseMatterBrief(raw: unknown): Partial<Record<MatterField, string>> {
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Partial<Record<MatterField, string>> = {};
    for (const k of MATTER_FIELDS) {
      const v = (parsed as Record<string, unknown>)[k];
      if (typeof v === 'string' && v.trim()) out[k] = v.trim();
    }
    return out;
  } catch { return {}; }
}

/** The system-prompt section carrying the matter brief and the attached documents. */
function buildMatterSection(session: MatterSessionRow): string {
  const brief = parseMatterBrief(session.matter_brief);
  const docs = parseMatterDocuments(session.documents);
  let out = '';
  const lines = MATTER_FIELDS.filter((k) => brief[k]).map((k) => `- ${MATTER_LABELS[k]}: ${brief[k]}`);
  if (lines.length > 0) {
    out += `\n\n## THE MATTER\nThe instructions taken at intake. Answer about this matter, not in the abstract.\n${lines.join('\n')}`;
  }
  if (docs.length > 0) {
    let budget = MATTER_DOC_BUDGET;
    const parts: string[] = [];
    for (const d of docs) {
      if (budget <= 0) { parts.push(`### DOCUMENT: ${d.name}\n(omitted — the document budget for one turn is exhausted)`); continue; }
      const text = d.text.slice(0, budget);
      budget -= text.length;
      const note = text.length < d.text.length ? ` (first ${text.length.toLocaleString('en-GB')} of ${d.text.length.toLocaleString('en-GB')} characters)` : '';
      parts.push(`### DOCUMENT: ${d.name}${note}\n${text}`);
    }
    out += `\n\n## MATTER DOCUMENTS (${docs.length})\nThe documents the matter concerns. Quote them by name and clause when you rely on them, and say when a document does not cover a point.\n\n${parts.join('\n\n---\n\n')}`;
  }
  return out;
}

// Reasoning depth per mode — ANTON thinking levels, the currency provider-router
// takes. (A THINKING_BUDGETS table in raw tokens lived here for a year and was
// never read.) Web search no longer switches reasoning off: that was an
// API-era myth, and the router now sends thinking and tools together.
const MODE_THINKING: Record<string, string> = {
  'deep-dive': 'investigate',
  'hypothetical': 'investigate',
  'comparison': 'think_hard',
  'case-law': 'think',
  'opinion': 'investigate',
  'gap-spotter': 'investigate',
  'comparative-jurisdiction': 'think_hard',
  'rapid-risk': 'think',
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

export async function createLegalResearchRoutes(db: DatabaseAdapter, sharedAnthropic?: Anthropic | undefined): Promise<Router> {
  const router = Router();
  const anthropic = sharedAnthropic ?? (process.env.ANTHROPIC_API_KEY ? new AnthropicSDK({ apiKey: process.env.ANTHROPIC_API_KEY }) : null);
  // Ground-truth citation ledger (item 1.4) — shared LRU across requests
  const citationLedger = createCitationLedger();

  // ── Verify citations against ground truth (local frameworks → EUR-Lex) ──────
  // Called by the client AFTER a stream completes — never blocks streaming.
  router.post('/legal-research/verify-citations', async (req: Request, res: Response) => {
    try {
      const { citations } = req.body as { citations?: Array<{ ref?: unknown; type?: unknown }> };
      if (!Array.isArray(citations) || citations.length === 0) {
        return res.status(400).json({ error: 'citations array required' });
      }
      const inputs: CitationInput[] = citations
        .slice(0, 50) // cap per request
        .filter((c) => typeof c?.ref === 'string' && (c.ref as string).trim().length > 0)
        .map((c) => ({
          ref: (c.ref as string).slice(0, 300),
          type: typeof c.type === 'string' ? c.type : undefined,
        }));
      if (inputs.length === 0) {
        return res.status(400).json({ error: 'citations array must contain { ref: string } items' });
      }
      const results = await citationLedger.verifyCitations(inputs);
      res.json({ results, disclaimer: VERIFICATION_DISCLAIMER });
    } catch (err) {
      console.error('[legal-research] verify-citations error:', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

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
      const { title, mode, expert_role, active_knowledge_packs } = req.body as {
        title?: string; mode?: string; expert_role?: string; active_knowledge_packs?: unknown;
      };
      // The page has always sent its default pack selection; the route dropped
      // it, so every session was stored with '[]' and the Knowledge Packs
      // panel showed five active packs that grounded nothing.
      const packs = Array.isArray(active_knowledge_packs)
        ? active_knowledge_packs.filter((p): p is string => typeof p === 'string' && p.length > 0 && p.length <= 100).slice(0, 20)
        : [];
      const id = randomUUID();
      const now = new Date().toISOString();
      await db.run(
        `INSERT INTO legal_research_sessions (id, title, mode, expert_role, active_knowledge_packs, user_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ,
        id,
        title || 'Untitled Legal Research',
        mode || 'deep-dive',
        expert_role || 'eu-regulatory-lawyer',
        JSON.stringify(packs),
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
      const allowed = ['title', 'mode', 'expert_role', 'research_questions', 'pinned_findings', 'citations', 'active_knowledge_packs', 'documents', 'matter_brief'];
      const updates: Record<string, unknown> = {};
      for (const key of allowed) {
        if (req.body[key] !== undefined) {
          updates[key] = typeof req.body[key] === 'object' ? JSON.stringify(req.body[key]) : req.body[key];
        }
      }
      // Matter documents (Wave 2): the extracted text travels with the session
      // — the upload store keeps only the file — so bound what one session holds.
      if (req.body.documents !== undefined) {
        const cleaned = sanitiseMatterDocuments(req.body.documents);
        if (!cleaned) return res.status(400).json({ error: 'documents must be an array of { id, name, text }' });
        updates.documents = JSON.stringify(cleaned);
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

  // ── Export as .anton bundle (Wave 2.5 — export-only record) ────────────────
  // POST /api/legal-research/:id/export-bundle { sign?, author? }
  // Q&A transcript, pinned findings, the verified-citation ledger WITH statuses,
  // and the mode/expert-role config. Signed with the instance key unless
  // sign === false (same opt-in as exchange exports).
  router.post('/legal-research/:id/export-bundle', async (req: Request, res: Response) => {
    try {
      const uid = getUserId(req);
      const session = await db.get(
        'SELECT id FROM legal_research_sessions WHERE id = ? AND user_id = ?',
        req.params.id, uid,
      );
      if (!session) return res.status(404).json({ error: 'Session not found' });

      const { sign, author } = (req.body ?? {}) as { sign?: unknown; author?: unknown };
      let buffer = await bundleLegalResearchSessionToAnton(db, req.params.id as string, {
        author: typeof author === 'string' && author ? author : undefined,
      });
      if (sign !== false && sign !== 'false') {
        buffer = (await signAntonBundle(db, buffer)).buffer;
      }

      const filename = `legal-research-${(req.params.id as string).slice(0, 8)}-${Date.now()}.anton`;
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (err) {
      console.error('[legal-research] export-bundle error:', err);
      res.status(500).json({ error: safeError(err) });
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
    // The SDK engine or a key — or an explicitly injected client (tests, a funded key).
    if (!hasClaudeEngine() && !anthropic) return res.status(503).json({ error: NO_CLAUDE_ENGINE_MESSAGE });

    try {
      const uid = getUserId(req);
      const session = await db.get('SELECT * FROM legal_research_sessions WHERE id = ? AND user_id = ?', req.params.id, uid) as MatterSessionRow | undefined;
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

      // Inject REAL grounding text (item 1.3): relevant framework articles + pack
      // entity text matched against the user's question, budgeted ~3k tokens.
      // When nothing relevant matches, the layer is dropped entirely — no fake
      // "knowledge packs are loaded" claims.
      let knowledgePackSection = '';
      try {
        const activePackIds: string[] = JSON.parse(session.active_knowledge_packs || '[]');
        const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')?.content ?? '';
        const grounding = await retrieveGroundingText({
          query: lastUserMsg,
          packIds: activePackIds,
          db,
          tokenBudget: 3000,
        });
        if (grounding) {
          knowledgePackSection = `\n\n${grounding.text}`;
        }
      } catch { /* non-fatal — proceed without grounding injection */ }

      // Inject org-wide context (entity type, jurisdiction, risk appetite, priorities)
      const orgContextLayer = await buildOrgContextLayer(db, uid);
      const orgContextSection = orgContextLayer ? `\n\n${orgContextLayer}` : '';

      // ONBOARD-04: plain language prefix instruction
      const plainLanguageInstruction = plainLanguageMode
        ? '\n\n## PLAIN LANGUAGE MODE — ACTIVE\nBefore your full legal analysis, first provide a short "PLAIN LANGUAGE SUMMARY" section (max 150 words). Write it for a non-lawyer board member: no Latin, no statute numbers, just clear plain English explaining what the issue is, what it means for the organisation, and what the recommended action is. Then proceed with the full legal analysis as normal.'
        : '';

      const toneInstruction = '\n\n## TONE & STYLE\nUse strict professional legal language throughout. No emojis. No colloquialisms. Structure responses with clear headings, numbered points, and precise legal references. Maintain the register expected by a senior legal practitioner reviewing the analysis.';

      // A real search brief when web search is on. The model used to be handed
      // the tool with no instruction at all — and on the SDK engine the tool
      // is named WebSearch, which claude-sdk-client rewords from "web_search
      // tool" below.
      const webSearchInstruction = webSearchEnabled
        ? '\n\n## WEB SEARCH ENABLED\nUse the web_search tool to check the primary sources for every instrument you cite: EUR-Lex for EU regulations and directives, the EBA/ESMA/EIOPA sites for guidelines, curia.europa.eu for CJEU judgments, and the national gazette or supervisor for national law. Prefer official sources over commentary. Cite the URL and the date you consulted it alongside the legal citation. Search before asserting the current text of a provision or the status of a case.'
        : '';

      // The matter (Wave 2): the brief ANTON took at intake and the documents
      // attached to the session, so every question is answered about THIS
      // contract, decision or set of facts rather than in the abstract.
      const matterSection = buildMatterSection(session);

      const systemPrompt = basePrompt + modeInstruction + roleInstruction + toneInstruction + orgContextSection + matterSection + knowledgePackSection + plainLanguageInstruction + webSearchInstruction;

      const tools = webSearchEnabled
        ? [{ type: 'web_search_20250305', name: 'web_search' }]
        : undefined;

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');

      // Thinking AND tools, always. `useThinking = tools.length === 0` used to
      // drop reasoning to the engine default the moment web search was on —
      // a Legal Opinion Draft ran at effort low instead of max.
      const thinkingLevel = MODE_THINKING[session.mode] ?? 'think_hard';

      // The instance default through the router — a hard-coded Claude-4 API
      // id ignored the model the user chose and, without a funded key, only
      // worked because the router happened to fall back to the engine.
      await streamChat({
        model: mapModelToProvider(getEffectiveDefaultModel() ?? 'claude-opus-4-8'),
        system: systemPrompt,
        messages: messages as Array<{ role: string; content: string }>,
        maxTokens: 16000,
        thinkingLevel,
        tools,
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
        res.write(`data: ${JSON.stringify({ type: 'error', error: safeError(err) })}\n\n`);
        res.end();
      }
    }
  });

  // ── Matter intake (Wave 2, 2026-09-08) ─────────────────────────────────────
  // POST /api/legal-research/:id/intake/turn  { message }
  // ANTON takes instructions on the matter the way senior counsel does —
  // facts, parties, governing law, the precise question, the decision the
  // client needs and by when — reading any attached documents first. What
  // the consultant confirms is merged into matter_brief (carried by a
  // trailing <matter_update> block the reader never sees) and injected into
  // every research turn. The conversation lives on the session.
  router.post('/legal-research/:id/intake/turn', async (req: Request, res: Response) => {
    if (!hasClaudeEngine() && !anthropic) return res.status(503).json({ error: NO_CLAUDE_ENGINE_MESSAGE });
    try {
      const uid = getUserId(req);
      const session = await db.get('SELECT * FROM legal_research_sessions WHERE id = ? AND user_id = ?', req.params.id, uid) as MatterSessionRow | undefined;
      if (!session) return res.status(404).json({ error: 'Session not found' });

      const message = typeof (req.body as { message?: unknown })?.message === 'string' ? String((req.body as { message: string }).message).trim().slice(0, 4000) : '';
      const conversation: Array<{ role: 'user' | 'assistant'; content: string }> = (() => {
        try {
          const v = JSON.parse(String(session.intake_conversation || '[]'));
          return Array.isArray(v) ? v.filter((t) => t && (t.role === 'user' || t.role === 'assistant') && typeof t.content === 'string') : [];
        } catch { return []; }
      })();
      if (message) conversation.push({ role: 'user', content: message });

      const brief = parseMatterBrief(session.matter_brief);
      const docs = parseMatterDocuments(session.documents);
      const known = MATTER_FIELDS.filter((k) => brief[k]).map((k) => `- ${k}: ${brief[k]}`);
      const unknown = MATTER_FIELDS.filter((k) => !brief[k]);
      const modeInfo = LEGAL_MODES.find((m) => m.id === session.mode);
      const roleInfo = EXPERT_ROLES.find((r) => r.id === session.expert_role);

      let excerptBudget = 12_000;
      const excerpts = docs.map((d) => {
        const text = d.text.slice(0, Math.max(0, Math.min(4000, excerptBudget)));
        excerptBudget -= text.length;
        return `### ${d.name}${text.length < d.text.length ? ' (excerpt)' : ''}\n${text || '(no text extracted)'}`;
      });

      const systemPrompt = `You are ANTON, senior counsel taking instructions on a new matter before research begins. You are speaking with the consultant or lawyer who owns the matter. Take instructions the way an experienced practitioner does: establish the facts, the parties, the governing law and jurisdiction, the precise question, the decision the client needs to make and by when, and the client's risk posture. Ask, do not lecture.

SESSION: ${String(session.title ?? '')}
CURRENT MODE: ${modeInfo ? modeInfo.label : session.mode} — CURRENT ROLE: ${roleInfo ? `${roleInfo.label} (${roleInfo.focus})` : session.expert_role}
AVAILABLE MODES: ${LEGAL_MODES.map((m) => `${m.id} = ${m.label}`).join('; ')}
AVAILABLE ROLES: ${EXPERT_ROLES.map((r) => `${r.id} = ${r.label}`).join('; ')}

DOCUMENTS ATTACHED (${docs.length}):
${excerpts.join('\n\n') || '(none — the consultant can attach the contract, decision or correspondence the matter concerns)'}

MATTER — known so far:
${known.join('\n') || '- nothing recorded yet'}
MATTER — still unknown: ${unknown.join(', ') || 'nothing'}

HOW TO TAKE INSTRUCTIONS
- Each turn: confirm what you now know in one or two lines, then ask the 2-3 questions that matter most for the research. Read the attached documents first and propose what they establish, marked as proposals, so the consultant only has to confirm. Never ask what is already known.
- When the matter is clear enough to research, restate it in three lines, set "done": true, and suggest the mode and expert role best suited to it (ids from the lists) when they differ from the current ones.
- End every reply with exactly one machine-readable block, even when nothing new was confirmed:
<matter_update>
{"matter": {"<field>": "<value>"}, "suggested_mode": null, "suggested_role": null, "done": false}
</matter_update>
  Fields: ${MATTER_FIELDS.join(', ')} — each a short string. Only include values the consultant confirmed, or that an attached document establishes and the consultant has not contradicted. Never include your own proposals until confirmed.`;

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');

      const messages = conversation.length > 0
        ? conversation.map((t) => ({ role: t.role, content: t.content }))
        : [{ role: 'user', content: 'Take instructions on this matter. Start with what the attached documents establish, if any, then ask your first questions.' }];

      let text = '';
      try {
        const result = await streamChat({
          model: mapModelToProvider(getEffectiveDefaultModel() ?? 'claude-opus-4-8'),
          system: systemPrompt,
          messages,
          maxTokens: 3000,
          thinkingLevel: 'think',
        }, res);
        text = result.text;
      } catch (err) {
        res.write(`data: ${JSON.stringify({ type: 'error', error: safeError(err) })}\n\n`);
        res.end();
        return;
      }

      const applied = { fields: 0, done: false, suggested_mode: null as string | null, suggested_role: null as string | null };
      const nextBrief: Partial<Record<MatterField, string>> = { ...brief };
      const block = text.match(/<matter_update>([\s\S]*?)<\/matter_update>/i);
      if (block) {
        try {
          const upd = JSON.parse(block[1].trim()) as { matter?: Record<string, unknown>; suggested_mode?: unknown; suggested_role?: unknown; done?: unknown };
          applied.done = upd.done === true;
          const matter = upd.matter && typeof upd.matter === 'object' ? upd.matter : {};
          for (const k of MATTER_FIELDS) {
            const v = matter[k];
            if (typeof v === 'string' && v.trim() && v.trim() !== nextBrief[k]) { nextBrief[k] = v.trim().slice(0, 2000); applied.fields += 1; }
          }
          if (typeof upd.suggested_mode === 'string' && upd.suggested_mode !== session.mode && LEGAL_MODES.some((m) => m.id === upd.suggested_mode)) applied.suggested_mode = upd.suggested_mode;
          if (typeof upd.suggested_role === 'string' && upd.suggested_role !== session.expert_role && EXPERT_ROLES.some((r) => r.id === upd.suggested_role)) applied.suggested_role = upd.suggested_role;
        } catch (err) {
          console.warn('[legal-research] matter update block unreadable:', err instanceof Error ? err.message : err);
        }
      }

      const visible = text.replace(/<matter_update>[\s\S]*?<\/matter_update>/i, '').trim();
      conversation.push({ role: 'assistant', content: visible });
      await db.run(
        'UPDATE legal_research_sessions SET matter_brief = ?, intake_conversation = ?, updated_at = ? WHERE id = ? AND user_id = ?',
        JSON.stringify(nextBrief), JSON.stringify(conversation.slice(-40)), new Date().toISOString(), req.params.id, uid,
      );
      res.write(`data: ${JSON.stringify({ type: 'matter_update', applied })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
      res.end();
    } catch (err) {
      console.error('[legal-research] intake error:', err);
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ type: 'error', error: safeError(err) })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: safeError(err) });
      }
    }
  });

  // ── Get available modes and expert roles ────────────────────────────────────
  router.get('/legal-research-meta/config', async (_req: Request, res: Response) => {
    res.json({ modes: LEGAL_MODES, expertRoles: EXPERT_ROLES });
  });

  return router;
}
