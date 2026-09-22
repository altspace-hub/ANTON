/**
 * agents.ts — REST API for Specialized Agents
 */

import { Router } from 'express';
import { z } from 'zod';
import type { DatabaseAdapter } from '../db/database.js';
import { createAgentService, type AgentProfile } from '../services/agent-service.js';
import { createAgentProcessor } from '../services/agent-processor.js';
import { createAgentBuilder } from '../services/agent-builder.js';
import { safeError } from '../lib/error-response.js';
import { p2pLimiter } from '../middleware/rate-limit.js';
import { ownerFilter, type OwnedRequest } from '../middleware/ownership.js';
import { loadOwnedRow, respondToRowAccessError, isRowAccessError } from '../lib/owned-row.js';

const createAgentSchema = z.object({
  name: z.string().min(1).max(200),
  roleDescription: z.string().min(1),
  systemPrompt: z.string().min(10),
  slug: z.string().max(60).optional(),
  avatar: z.string().max(50).optional(),
  greetingMessage: z.string().optional(),
  defaultModel: z.string().optional(),
  defaultThinking: z.enum(['quick', 'think', 'think_hard', 'investigate', 'plan_first']).optional(),
  maxTokens: z.number().int().min(1024).max(128000).optional(),
  routingKeywords: z.array(z.string()).optional(),
  routingPriority: z.number().int().optional(),
  escalationPolicy: z.enum(['notify', 'redirect', 'human_only', 'queue']).optional(),
  maxConversationTurns: z.number().int().min(1).max(100).optional(),
  knowledgeCollectionIds: z.array(z.string()).optional(),
  knowledgePackIds: z.array(z.string()).optional(),
  allowedModules: z.array(z.string()).optional(),
  allowedAreas: z.array(z.string()).optional(),
  templateId: z.string().optional(),
});

export async function createAgentRoutes(db: DatabaseAdapter): Promise<Router> {
  const router = Router();
  const service = await createAgentService(db);
  const processor = await createAgentProcessor(db);
  const builder = await createAgentBuilder(db);

  // ── Ownership ──────────────────────────────────────────────────────
  //
  // Every /agents/:id route below used to address the row by id alone. agent_profiles
  // has carried `created_by` since migration 111 but nothing wrote it and nothing read
  // it, so on a DEPLOYMENT_MODE=team install any authenticated user — role 'viewer'
  // included — could read another tenant's system_prompt and knowledge scopes, repoint
  // a rest_api connector at a host they control and then execute it through the
  // operator's decrypted vault credentials, or archive a production agent outright.
  // Migration 265 stamps the legacy rows; createAgent stamps new ones; these two
  // helpers are the read side.
  //
  // loadOwnedRow (lib/owned-row.ts) IS the fetch, deliberately: a handler that forgets
  // the guard has no agent to work with, rather than quietly reading someone else's.
  // It 404s — never 403 — so an id cannot be used to confirm that another tenant's
  // agent exists. Solo mode and admins are pass-through; see middleware/ownership.ts.

  /** The agent at :id, or throw RowAccessError(401|404). */
  function loadOwnedAgent(req: OwnedRequest, id: string, notFoundMessage = 'Agent not found') {
    return loadOwnedRow<AgentProfile>(db, req, {
      table: 'agent_profiles', ownerColumn: 'created_by', id, notFoundMessage,
    });
  }

  /**
   * Same, for the one route whose :id has always accepted a slug as well as an id.
   * The retry goes through the SAME owner check — never an unscoped fallback, which
   * would make `slug` a way around everything above.
   */
  async function loadOwnedAgentByIdOrSlug(req: OwnedRequest, idOrSlug: string): Promise<AgentProfile> {
    try {
      return await loadOwnedAgent(req, idOrSlug);
    } catch (err) {
      if (isRowAccessError(err) && err.status === 404) {
        return await loadOwnedRow<AgentProfile>(db, req, {
          table: 'agent_profiles', ownerColumn: 'created_by', id: idOrSlug,
          idColumn: 'slug', notFoundMessage: 'Agent not found',
        });
      }
      throw err;
    }
  }

  // ── CRUD ───────────────────────────────────────────────────────────

  router.get('/agents', async (req, res) => {
    try {
      const agents = await service.listAgents({
        status: req.query.status as string | undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
      }, ownerFilter(req, 'created_by'));
      res.json({ success: true, agents });
    } catch (err) { res.status(500).json({ error: safeError(err) }); }
  });

  router.get('/agents/templates', async (_req, res) => {
    try {
      const templates = await service.listTemplates();
      res.json({ success: true, templates });
    } catch (err) { res.status(500).json({ error: safeError(err) }); }
  });

  router.get('/agents/:id', async (req, res) => {
    try {
      const agent = await loadOwnedAgentByIdOrSlug(req, req.params.id);
      const stats = await service.getAgentStats(agent.id);
      res.json({ success: true, agent, stats });
    } catch (err) {
      // First in the catch: respondToRowAccessError must win over the generic arm,
      // or the 404 contract turns into a 500. See lib/owned-row.ts.
      if (respondToRowAccessError(err, res)) return;
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.post('/agents', async (req, res) => {
    try {
      // No identity, no agent. An agent with a NULL created_by is one no owner
      // predicate can ever match, so it would be invisible to its own creator in team
      // mode — the state migration 111 left every row in.
      const createdBy = req.user?.id;
      if (!createdBy) { res.status(401).json({ error: 'Authentication required' }); return; }
      const parsed = createAgentSchema.safeParse(req.body);
      if (!parsed.success) { res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }); return; }
      const id = await service.createAgent({ ...parsed.data, createdBy });
      res.status(201).json({ success: true, id });
    } catch (err) { res.status(500).json({ error: safeError(err) }); }
  });

  router.patch('/agents/:id', async (req, res) => {
    try {
      await loadOwnedAgent(req, req.params.id);
      await service.updateAgent(req.params.id, req.body);
      res.json({ success: true });
    } catch (err) {
      if (respondToRowAccessError(err, res)) return;
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.delete('/agents/:id', async (req, res) => {
    try {
      await loadOwnedAgent(req, req.params.id);
      await service.deleteAgent(req.params.id);
      res.json({ success: true });
    } catch (err) {
      if (respondToRowAccessError(err, res)) return;
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.post('/agents/:id/activate', async (req, res) => {
    try {
      await loadOwnedAgent(req, req.params.id);
      await service.updateAgent(req.params.id, { status: 'active' });
      res.json({ success: true });
    } catch (err) {
      if (respondToRowAccessError(err, res)) return;
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.post('/agents/:id/pause', async (req, res) => {
    try {
      await loadOwnedAgent(req, req.params.id);
      await service.updateAgent(req.params.id, { status: 'paused' });
      res.json({ success: true });
    } catch (err) {
      if (respondToRowAccessError(err, res)) return;
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── Connectors ─────────────────────────────────────────────────────

  // agent_connectors has no owner column of its own — a connector belongs to whoever
  // owns its agent. Guarding the parent is therefore the whole check, and it must come
  // before the INSERT: attaching a connector to somebody else's agent is the step that
  // turns a read hole into an exfiltration channel run on their credentials.
  router.get('/agents/:id/connectors', async (req, res) => {
    try {
      await loadOwnedAgent(req, req.params.id);
      const connectors = await db.all(
        'SELECT id, name, connector_type, description, is_active, last_used_at, last_error, created_at FROM agent_connectors WHERE agent_id = ? ORDER BY created_at',
        req.params.id
      );
      res.json({ success: true, connectors });
    } catch (err) {
      if (respondToRowAccessError(err, res)) return;
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.post('/agents/:id/connectors', async (req, res) => {
    try {
      await loadOwnedAgent(req, req.params.id);
      const { name, connectorType, description, config, authConfig } = req.body as {
        name: string; connectorType: string; description?: string;
        config: Record<string, unknown>; authConfig?: Record<string, unknown>;
      };
      if (!name || !connectorType) { res.status(400).json({ error: 'name and connectorType required' }); return; }

      // Encrypt auth credentials before storage
      let encryptedAuth = '{}';
      if (authConfig && Object.keys(authConfig).length > 0) {
        const { encryptConfig } = await import('../services/credential-vault.js');
        encryptedAuth = JSON.stringify(encryptConfig(authConfig));
      }

      const id = `aconn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      await db.run(`
        INSERT INTO agent_connectors (id, agent_id, name, connector_type, description, config, auth_config)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, id, req.params.id, name, connectorType, description ?? null,
         JSON.stringify(config), encryptedAuth);

      res.status(201).json({ success: true, id });
    } catch (err) {
      if (respondToRowAccessError(err, res)) return;
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.delete('/agents/:id/connectors/:connectorId', async (req, res) => {
    try {
      await loadOwnedAgent(req, req.params.id);
      await db.run('DELETE FROM agent_connectors WHERE id = ? AND agent_id = ?', req.params.connectorId, req.params.id);
      res.json({ success: true });
    } catch (err) {
      if (respondToRowAccessError(err, res)) return;
      res.status(500).json({ error: safeError(err) });
    }
  });

  // Test a connector
  router.post('/agents/:id/connectors/:connectorId/test', async (req, res) => {
    try {
      await loadOwnedAgent(req, req.params.id);
      const { createConnectorExecutor } = await import('../services/agent-connector-executor.js');
      const executor = await createConnectorExecutor(db);
      const connector = await db.get<{ name: string }>(
        'SELECT name FROM agent_connectors WHERE id = ? AND agent_id = ?',
        req.params.connectorId, req.params.id
      );
      if (!connector) { res.status(404).json({ error: 'Connector not found' }); return; }

      const result = await executor.executeCall(req.params.id, {
        tool: connector.name,
        action: req.body.action ?? 'GET',
        params: req.body.params ?? {},
      });
      res.json({ success: true, result });
    } catch (err) {
      if (respondToRowAccessError(err, res)) return;
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── Conversations ──────────────────────────────────────────────────

  router.get('/agents/:id/conversations', async (req, res) => {
    try {
      await loadOwnedAgent(req, req.params.id);
      const conversations = await service.listConversations(req.params.id, req.query.limit ? Number(req.query.limit) : 20);
      res.json({ success: true, conversations });
    } catch (err) {
      if (respondToRowAccessError(err, res)) return;
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.get('/agents/conversations/:conversationId', async (req, res) => {
    try {
      // Resolve the OWNING AGENT before reading a single message. A transcript carries
      // whatever the requester said to the agent and whatever it answered with, so a
      // conversation id must not be a second door onto an agent the caller cannot open;
      // agent_conversations has no owner column of its own, only agent_id. Fetching just
      // that link keeps the message rows out of memory until the check has passed.
      const link = await db.get<{ agent_id: string }>(
        'SELECT agent_id FROM agent_conversations WHERE id = ?', req.params.conversationId,
      );
      if (!link) { res.status(404).json({ error: 'Conversation not found' }); return; }
      await loadOwnedAgent(req, link.agent_id, 'Conversation not found');

      const data = await service.getConversation(req.params.conversationId);
      if (!data) { res.status(404).json({ error: 'Conversation not found' }); return; }
      res.json({ success: true, ...data });
    } catch (err) {
      if (respondToRowAccessError(err, res)) return;
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── Route Query to Best Agent ──────────────────────────────────────

  router.post('/agents/route', async (req, res) => {
    try {
      const { query } = req.body as { query: string };
      if (!query) { res.status(400).json({ error: 'query required' }); return; }
      // routeQuery's own docstring says "the authenticated route (POST /api/agents/route)
      // passes it" — it did not. Without the scope this hands back another tenant's agent
      // NAME and ID: the enumeration listAgents refuses, reached by the side door.
      // /agents/public/route below deliberately passes nothing, because a storefront is
      // meant to be instance-wide.
      const match = await processor.routeQuery(query, ownerFilter(req, 'created_by'));
      res.json({ success: true, match });
    } catch (err) { res.status(500).json({ error: safeError(err) }); }
  });

  // ── Remote Agent Discovery & Query ──────────────────────────────────

  // Discover agents available on connected peers
  router.get('/agents/remote/discover', async (req, res) => {
    try {
      const { createRemoteAgentClient } = await import('../services/remote-agent-client.js');
      const client = await createRemoteAgentClient(db);
      const agents = await client.discoverRemoteAgents();
      res.json({ success: true, agents, count: agents.length });
    } catch (err) { res.status(500).json({ error: safeError(err) }); }
  });

  // Smart query: find best remote agent and query it
  router.post('/agents/remote/query', async (req, res) => {
    try {
      const { query, endpoint, agentSlug, conversationId } = req.body as {
        query: string; endpoint?: string; agentSlug?: string; conversationId?: string;
      };
      if (!query) { res.status(400).json({ error: 'query required' }); return; }

      const { createRemoteAgentClient } = await import('../services/remote-agent-client.js');
      const client = await createRemoteAgentClient(db);

      if (endpoint && agentSlug) {
        // Direct query to a specific remote agent
        const result = await client.queryRemoteAgent(endpoint, agentSlug, query, conversationId);
        res.json({ success: true, result });
      } else {
        // Smart routing: find the best agent across all peers
        const result = await client.smartQuery(query);
        res.json({ success: true, result });
      }
    } catch (err) { res.status(500).json({ error: safeError(err) }); }
  });

  // ── Agent Builder ──────────────────────────────────────────────────

  router.post('/agents/builder/generate', async (req, res) => {
    try {
      const { description } = req.body as { description: string };
      if (!description) { res.status(400).json({ error: 'description required' }); return; }
      const config = await builder.generateFromDescription(description);
      res.json({ success: true, config });
    } catch (err) { res.status(500).json({ error: safeError(err) }); }
  });

  router.post('/agents/builder/system-prompt', async (req, res) => {
    try {
      const { role, context } = req.body as { role: string; context?: string };
      if (!role) { res.status(400).json({ error: 'role required' }); return; }
      const prompt = await builder.generateSystemPrompt(role, context);
      res.json({ success: true, prompt });
    } catch (err) { res.status(500).json({ error: safeError(err) }); }
  });

  router.post('/agents/builder/keywords', async (req, res) => {
    try {
      const { role, description } = req.body as { role: string; description: string };
      if (!role) { res.status(400).json({ error: 'role required' }); return; }
      const keywords = await builder.suggestKeywords(role, description ?? role);
      res.json({ success: true, keywords });
    } catch (err) { res.status(500).json({ error: safeError(err) }); }
  });

  // ── Public Storefront (no auth required — for external ANTONs) ──

  // GET /agents/public/directory — list all active agents that are publicly queryable
  router.get('/agents/public/directory', p2pLimiter, async (req, res) => {
    try {
      const agents = await service.listAgents({ status: 'active' });
      // Only expose public-safe fields
      const directory = agents
        .filter(a => a.auto_response_enabled)
        .map(a => ({
          slug: a.slug,
          name: a.name,
          role: a.role_description,
          avatar: a.avatar,
          greeting: a.greeting_message,
          keywords: typeof a.routing_keywords === 'string' ? JSON.parse(a.routing_keywords) : a.routing_keywords,
        }));
      res.json({ agents: directory, count: directory.length });
    } catch (err) { res.status(500).json({ error: safeError(err) }); }
  });

  // POST /agents/public/query — external ANTON queries an agent (no mutual contact needed)
  // Secured by: agent must be active + auto_response_enabled, optional API key
  router.post('/agents/public/query', p2pLimiter, async (req, res) => {
    try {
      const { agentSlug, message, conversationId, requesterHash, requesterName } = req.body as {
        agentSlug: string; message: string; conversationId?: string;
        requesterHash?: string; requesterName?: string;
      };
      if (!agentSlug || !message) {
        res.status(400).json({ error: 'agentSlug and message required' });
        return;
      }

      const agent = await service.getAgentBySlug(agentSlug);
      if (!agent) { res.status(404).json({ error: `Agent "${agentSlug}" not found` }); return; }
      if (agent.status !== 'active') { res.status(404).json({ error: 'Agent is not active' }); return; }
      if (!agent.auto_response_enabled) { res.status(403).json({ error: 'Agent does not accept public queries' }); return; }

      // A TOOL-BEARING agent must not be publicly queryable by accident.
      //
      // auto_response_enabled is DEFAULT TRUE (migration 111_specialized_agents),
      // so every agent an operator creates is reachable here by an unauthenticated
      // caller. That is a reasonable default for a conversational agent; it is not
      // one for an agent holding live connectors, where the caller's text steers a
      // model whose output drives SQL against ANTON's own database and HTTP calls
      // carrying the operator's vault credentials. The executor now bounds what
      // those calls may do, but exposure should still be a deliberate choice.
      //
      // Opt in per agent with agent_profiles.public_tool_use (migration 252,
      // DEFAULT FALSE). Only consulted when the agent actually has active
      // connectors, so ordinary conversational agents are unaffected.
      {
        const { createConnectorExecutor } = await import('../services/agent-connector-executor.js');
        const exec = await createConnectorExecutor(db);
        const connectors = await exec.getAgentConnectors(agent.id);
        if (connectors.length > 0 && (agent as { public_tool_use?: boolean }).public_tool_use !== true) {
          res.status(403).json({
            error: 'This agent uses connectors and is not enabled for anonymous queries — set public_tool_use on the agent to allow it',
          });
          return;
        }
      }

      const result = await processor.processQuery(agent.id, message, {
        conversationId,
        source: 'p2p',
        requesterHash: requesterHash ?? req.ip ?? 'anonymous',
        requesterName: requesterName ?? 'External ANTON',
      });

      res.json({
        success: true,
        agent: { name: agent.name, role: agent.role_description, avatar: agent.avatar },
        response: result.response,
        conversationId: result.conversationId,
        escalated: result.escalated,
      });
    } catch (err) { res.status(500).json({ error: safeError(err) }); }
  });

  // POST /agents/public/route — external ANTON asks "who can help with X?"
  router.post('/agents/public/route', p2pLimiter, async (req, res) => {
    try {
      const { query } = req.body as { query: string };
      if (!query) { res.status(400).json({ error: 'query required' }); return; }
      const match = await processor.routeQuery(query);
      if (match) {
        const agent = await service.getAgent(match.agentId);
        res.json({
          success: true,
          match: {
            slug: agent?.slug,
            name: match.agentName,
            role: agent?.role_description,
            confidence: match.confidence,
          },
        });
      } else {
        res.json({ success: true, match: null });
      }
    } catch (err) { res.status(500).json({ error: safeError(err) }); }
  });

  // ── Query Agent ────────────────────────────────────────────────────
  // Registered AFTER the /agents/remote/* and /agents/public/* routes:
  // Express matches in declaration order, and the parameterized ':id'
  // pattern otherwise swallows 'remote' and 'public' — which made
  // POST /agents/remote/query and POST /agents/public/query (the endpoint
  // remote-agent-client calls for cross-instance queries) unreachable.
  // Found by the A2A two-instance verification ladder (tests/a2a/).

  router.post('/agents/:id/query', async (req, res) => {
    try {
      const { message, conversationId } = req.body as { message: string; conversationId?: string };
      if (!message) { res.status(400).json({ error: 'message required' }); return; }
      // The most consequential per-agent route to have missed the guard: a query runs the
      // agent's system prompt AND its connectors, so unguarded it executes another
      // tenant's rest_api and database connectors through the vault credentials those
      // connectors resolve, and returns the output. Reading their config was the lesser
      // half of what this exposed.
      await loadOwnedAgent(req, req.params.id);
      const result = await processor.processQuery(req.params.id, message, { conversationId, source: 'direct' });
      res.json({ success: true, ...result });
    } catch (err) {
      if (respondToRowAccessError(err, res)) return;
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── Stats ──────────────────────────────────────────────────────────

  router.get('/agents/:id/stats', async (req, res) => {
    try {
      await loadOwnedAgent(req, req.params.id);
      const stats = await service.getAgentStats(req.params.id);
      res.json({ success: true, stats });
    } catch (err) {
      if (respondToRowAccessError(err, res)) return;
      res.status(500).json({ error: safeError(err) });
    }
  });

  return router;
}
