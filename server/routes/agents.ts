/**
 * agents.ts — REST API for Specialized Agents
 */

import { Router } from 'express';
import { z } from 'zod';
import type { DatabaseAdapter } from '../db/database.js';
import { createAgentService } from '../services/agent-service.js';
import { createAgentProcessor } from '../services/agent-processor.js';
import { createAgentBuilder } from '../services/agent-builder.js';
import { safeError } from '../lib/error-response.js';

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

  // ── CRUD ───────────────────────────────────────────────────────────

  router.get('/agents', async (req, res) => {
    try {
      const agents = await service.listAgents({
        status: req.query.status as string | undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
      });
      res.json({ success: true, agents });
    } catch (err) { const { status, message } = safeError(err); res.status(status).json({ error: message }); }
  });

  router.get('/agents/templates', async (_req, res) => {
    try {
      const templates = await service.listTemplates();
      res.json({ success: true, templates });
    } catch (err) { const { status, message } = safeError(err); res.status(status).json({ error: message }); }
  });

  router.get('/agents/:id', async (req, res) => {
    try {
      const agent = await service.getAgent(req.params.id) ?? await service.getAgentBySlug(req.params.id);
      if (!agent) { res.status(404).json({ error: 'Agent not found' }); return; }
      const stats = await service.getAgentStats(agent.id);
      res.json({ success: true, agent, stats });
    } catch (err) { const { status, message } = safeError(err); res.status(status).json({ error: message }); }
  });

  router.post('/agents', async (req, res) => {
    try {
      const parsed = createAgentSchema.safeParse(req.body);
      if (!parsed.success) { res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }); return; }
      const id = await service.createAgent(parsed.data);
      res.status(201).json({ success: true, id });
    } catch (err) { const { status, message } = safeError(err); res.status(status).json({ error: message }); }
  });

  router.patch('/agents/:id', async (req, res) => {
    try {
      await service.updateAgent(req.params.id, req.body);
      res.json({ success: true });
    } catch (err) { const { status, message } = safeError(err); res.status(status).json({ error: message }); }
  });

  router.delete('/agents/:id', async (req, res) => {
    try {
      await service.deleteAgent(req.params.id);
      res.json({ success: true });
    } catch (err) { const { status, message } = safeError(err); res.status(status).json({ error: message }); }
  });

  router.post('/agents/:id/activate', async (req, res) => {
    try {
      await service.updateAgent(req.params.id, { status: 'active' });
      res.json({ success: true });
    } catch (err) { const { status, message } = safeError(err); res.status(status).json({ error: message }); }
  });

  router.post('/agents/:id/pause', async (req, res) => {
    try {
      await service.updateAgent(req.params.id, { status: 'paused' });
      res.json({ success: true });
    } catch (err) { const { status, message } = safeError(err); res.status(status).json({ error: message }); }
  });

  // ── Connectors ─────────────────────────────────────────────────────

  router.get('/agents/:id/connectors', async (req, res) => {
    try {
      const connectors = await db.all(
        'SELECT id, name, connector_type, description, is_active, last_used_at, last_error, created_at FROM agent_connectors WHERE agent_id = ? ORDER BY created_at',
        req.params.id
      );
      res.json({ success: true, connectors });
    } catch (err) { const { status, message } = safeError(err); res.status(status).json({ error: message }); }
  });

  router.post('/agents/:id/connectors', async (req, res) => {
    try {
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
    } catch (err) { const { status, message } = safeError(err); res.status(status).json({ error: message }); }
  });

  router.delete('/agents/:id/connectors/:connectorId', async (req, res) => {
    try {
      await db.run('DELETE FROM agent_connectors WHERE id = ? AND agent_id = ?', req.params.connectorId, req.params.id);
      res.json({ success: true });
    } catch (err) { const { status, message } = safeError(err); res.status(status).json({ error: message }); }
  });

  // Test a connector
  router.post('/agents/:id/connectors/:connectorId/test', async (req, res) => {
    try {
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
    } catch (err) { const { status, message } = safeError(err); res.status(status).json({ error: message }); }
  });

  // ── Conversations ──────────────────────────────────────────────────

  router.get('/agents/:id/conversations', async (req, res) => {
    try {
      const conversations = await service.listConversations(req.params.id, req.query.limit ? Number(req.query.limit) : 20);
      res.json({ success: true, conversations });
    } catch (err) { const { status, message } = safeError(err); res.status(status).json({ error: message }); }
  });

  router.get('/agents/conversations/:conversationId', async (req, res) => {
    try {
      const data = await service.getConversation(req.params.conversationId);
      if (!data) { res.status(404).json({ error: 'Conversation not found' }); return; }
      res.json({ success: true, ...data });
    } catch (err) { const { status, message } = safeError(err); res.status(status).json({ error: message }); }
  });

  // ── Query Agent ────────────────────────────────────────────────────

  router.post('/agents/:id/query', async (req, res) => {
    try {
      const { message, conversationId } = req.body as { message: string; conversationId?: string };
      if (!message) { res.status(400).json({ error: 'message required' }); return; }
      const result = await processor.processQuery(req.params.id, message, { conversationId, source: 'direct' });
      res.json({ success: true, ...result });
    } catch (err) { const { status, message } = safeError(err); res.status(status).json({ error: message }); }
  });

  // ── Route Query to Best Agent ──────────────────────────────────────

  router.post('/agents/route', async (req, res) => {
    try {
      const { query } = req.body as { query: string };
      if (!query) { res.status(400).json({ error: 'query required' }); return; }
      const match = await processor.routeQuery(query);
      res.json({ success: true, match });
    } catch (err) { const { status, message } = safeError(err); res.status(status).json({ error: message }); }
  });

  // ── Remote Agent Discovery & Query ──────────────────────────────────

  // Discover agents available on connected peers
  router.get('/agents/remote/discover', async (req, res) => {
    try {
      const { createRemoteAgentClient } = await import('../services/remote-agent-client.js');
      const client = await createRemoteAgentClient(db);
      const agents = await client.discoverRemoteAgents();
      res.json({ success: true, agents, count: agents.length });
    } catch (err) { const { status, message } = safeError(err); res.status(status).json({ error: message }); }
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
    } catch (err) { const { status, message } = safeError(err); res.status(status).json({ error: message }); }
  });

  // ── Agent Builder ──────────────────────────────────────────────────

  router.post('/agents/builder/generate', async (req, res) => {
    try {
      const { description } = req.body as { description: string };
      if (!description) { res.status(400).json({ error: 'description required' }); return; }
      const config = await builder.generateFromDescription(description);
      res.json({ success: true, config });
    } catch (err) { const { status, message } = safeError(err); res.status(status).json({ error: message }); }
  });

  router.post('/agents/builder/system-prompt', async (req, res) => {
    try {
      const { role, context } = req.body as { role: string; context?: string };
      if (!role) { res.status(400).json({ error: 'role required' }); return; }
      const prompt = await builder.generateSystemPrompt(role, context);
      res.json({ success: true, prompt });
    } catch (err) { const { status, message } = safeError(err); res.status(status).json({ error: message }); }
  });

  router.post('/agents/builder/keywords', async (req, res) => {
    try {
      const { role, description } = req.body as { role: string; description: string };
      if (!role) { res.status(400).json({ error: 'role required' }); return; }
      const keywords = await builder.suggestKeywords(role, description ?? role);
      res.json({ success: true, keywords });
    } catch (err) { const { status, message } = safeError(err); res.status(status).json({ error: message }); }
  });

  // ── Public Storefront (no auth required — for external ANTONs) ──

  // GET /agents/public/directory — list all active agents that are publicly queryable
  router.get('/agents/public/directory', async (req, res) => {
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
    } catch (err) { const { status, message } = safeError(err); res.status(status).json({ error: message }); }
  });

  // POST /agents/public/query — external ANTON queries an agent (no mutual contact needed)
  // Secured by: agent must be active + auto_response_enabled, optional API key
  router.post('/agents/public/query', async (req, res) => {
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
    } catch (err) { const { status, message } = safeError(err); res.status(status).json({ error: message }); }
  });

  // POST /agents/public/route — external ANTON asks "who can help with X?"
  router.post('/agents/public/route', async (req, res) => {
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
    } catch (err) { const { status, message } = safeError(err); res.status(status).json({ error: message }); }
  });

  // ── Stats ──────────────────────────────────────────────────────────

  router.get('/agents/:id/stats', async (req, res) => {
    try {
      const stats = await service.getAgentStats(req.params.id);
      res.json({ success: true, stats });
    } catch (err) { const { status, message } = safeError(err); res.status(status).json({ error: message }); }
  });

  return router;
}
