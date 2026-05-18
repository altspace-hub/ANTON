/**
 * agent-service.ts — Core CRUD + business logic for Specialized Agents
 */

import { randomUUID } from 'crypto';
import type { DatabaseAdapter } from '../db/database.js';

export interface AgentProfile {
  id: string; name: string; slug: string; role_description: string;
  avatar: string; greeting_message: string | null; status: string;
  system_prompt: string; default_model: string | null; default_thinking: string;
  max_tokens: number; temperature: number;
  knowledge_collection_ids: string; knowledge_pack_ids: string; knowledge_atom_scopes: string;
  rag_search_enabled: boolean; web_search_enabled: boolean;
  allowed_modules: string; allowed_areas: string;
  routing_keywords: string; routing_patterns: string; routing_priority: number;
  escalation_policy: string; max_conversation_turns: number;
  connectors: string; availability_schedule: string; offline_message: string | null;
  auto_response_enabled: boolean;
  total_conversations: number; total_messages_handled: number; avg_satisfaction_score: number | null;
  created_at: string; updated_at: string;
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

export async function createAgentService(db: DatabaseAdapter) {

  async function createAgent(params: {
    name: string; roleDescription: string; systemPrompt: string;
    slug?: string; avatar?: string; greetingMessage?: string;
    defaultModel?: string; defaultThinking?: string; maxTokens?: number; temperature?: number;
    knowledgeCollectionIds?: string[]; knowledgePackIds?: string[]; knowledgeAtomScopes?: string[];
    ragSearchEnabled?: boolean; webSearchEnabled?: boolean;
    allowedModules?: string[]; allowedAreas?: string[];
    routingKeywords?: string[]; routingPatterns?: string[]; routingPriority?: number;
    escalationPolicy?: string; maxConversationTurns?: number;
    availabilitySchedule?: Record<string, unknown>; offlineMessage?: string;
    templateId?: string;
  }): Promise<string> {
    const id = `agent_${Date.now()}_${randomUUID().slice(0, 8)}`;
    const slug = params.slug || slugify(params.name);

    await db.run(`
      INSERT INTO agent_profiles (id, name, slug, role_description, system_prompt, avatar, greeting_message,
        default_model, default_thinking, max_tokens, temperature,
        knowledge_collection_ids, knowledge_pack_ids, knowledge_atom_scopes,
        rag_search_enabled, web_search_enabled,
        allowed_modules, allowed_areas,
        routing_keywords, routing_patterns, routing_priority,
        escalation_policy, max_conversation_turns,
        availability_schedule, offline_message, template_id, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')
    `, id, params.name, slug, params.roleDescription, params.systemPrompt,
       params.avatar ?? 'Bot', params.greetingMessage ?? null,
       params.defaultModel ?? null, params.defaultThinking ?? 'think',
       params.maxTokens ?? 16384, params.temperature ?? 0.7,
       JSON.stringify(params.knowledgeCollectionIds ?? []),
       JSON.stringify(params.knowledgePackIds ?? []),
       JSON.stringify(params.knowledgeAtomScopes ?? []),
       params.ragSearchEnabled ?? true, params.webSearchEnabled ?? false,
       JSON.stringify(params.allowedModules ?? []),
       JSON.stringify(params.allowedAreas ?? []),
       JSON.stringify(params.routingKeywords ?? []),
       JSON.stringify(params.routingPatterns ?? []),
       params.routingPriority ?? 0,
       params.escalationPolicy ?? 'notify', params.maxConversationTurns ?? 20,
       JSON.stringify(params.availabilitySchedule ?? {}), params.offlineMessage ?? null,
       params.templateId ?? null);

    return id;
  }

  async function getAgent(id: string): Promise<AgentProfile | null> {
    return await db.get<AgentProfile>('SELECT * FROM agent_profiles WHERE id = ?', id) ?? null;
  }

  async function getAgentBySlug(slug: string): Promise<AgentProfile | null> {
    return await db.get<AgentProfile>('SELECT * FROM agent_profiles WHERE slug = ?', slug) ?? null;
  }

  async function listAgents(params?: { status?: string; category?: string; limit?: number }): Promise<AgentProfile[]> {
    let where = 'WHERE 1=1';
    const args: unknown[] = [];
    if (params?.status) { where += ' AND status = ?'; args.push(params.status); }
    args.push(params?.limit ?? 50);
    return await db.all<AgentProfile>(`SELECT * FROM agent_profiles ${where} ORDER BY routing_priority DESC, updated_at DESC LIMIT ?`, ...args);
  }

  async function updateAgent(id: string, updates: Record<string, unknown>): Promise<void> {
    const allowed = [
      'name', 'slug', 'role_description', 'system_prompt', 'avatar', 'greeting_message',
      'status', 'default_model', 'default_thinking', 'max_tokens', 'temperature',
      'knowledge_collection_ids', 'knowledge_pack_ids', 'knowledge_atom_scopes',
      'rag_search_enabled', 'web_search_enabled', 'allowed_modules', 'allowed_areas',
      'routing_keywords', 'routing_patterns', 'routing_priority',
      'escalation_policy', 'max_conversation_turns', 'connectors',
      'availability_schedule', 'offline_message', 'auto_response_enabled',
    ];
    const fields: string[] = [];
    const args: unknown[] = [];
    for (const key of allowed) {
      if (updates[key] !== undefined) {
        fields.push(`${key} = ?`);
        const val = updates[key];
        args.push(typeof val === 'object' && val !== null ? JSON.stringify(val) : val);
      }
    }
    if (fields.length === 0) return;
    fields.push('updated_at = NOW()');
    args.push(id);
    await db.run(`UPDATE agent_profiles SET ${fields.join(', ')} WHERE id = ?`, ...args);
  }

  async function deleteAgent(id: string): Promise<void> {
    await db.run("UPDATE agent_profiles SET status = 'archived', updated_at = NOW() WHERE id = ?", id);
  }

  // ── Conversations ──────────────────────────────────────────────────

  async function createConversation(agentId: string, source: string, sourceRef?: string, requesterHash?: string, requesterName?: string): Promise<string> {
    const id = `aconv_${Date.now()}_${randomUUID().slice(0, 8)}`;
    await db.run(`
      INSERT INTO agent_conversations (id, agent_id, source, source_ref, requester_hash, requester_name)
      VALUES (?, ?, ?, ?, ?, ?)
    `, id, agentId, source, sourceRef ?? null, requesterHash ?? null, requesterName ?? null);
    await db.run('UPDATE agent_profiles SET total_conversations = total_conversations + 1 WHERE id = ?', agentId);
    return id;
  }

  async function addMessage(conversationId: string, role: string, content: string, thinkingContent?: string, inputTokens?: number, outputTokens?: number): Promise<string> {
    const id = `amsg_${Date.now()}_${randomUUID().slice(0, 8)}`;
    await db.run(`
      INSERT INTO agent_messages (id, conversation_id, role, content, thinking_content, input_tokens, output_tokens)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, id, conversationId, role, content, thinkingContent ?? null, inputTokens ?? 0, outputTokens ?? 0);
    await db.run(`
      UPDATE agent_conversations SET message_count = message_count + 1,
        total_input_tokens = total_input_tokens + ?, total_output_tokens = total_output_tokens + ?,
        updated_at = NOW()
      WHERE id = ?
    `, inputTokens ?? 0, outputTokens ?? 0, conversationId);
    return id;
  }

  async function getConversation(id: string): Promise<{ conversation: Record<string, unknown>; messages: Array<Record<string, unknown>> } | null> {
    const conversation = await db.get('SELECT * FROM agent_conversations WHERE id = ?', id);
    if (!conversation) return null;
    const messages = await db.all('SELECT * FROM agent_messages WHERE conversation_id = ? ORDER BY created_at ASC', id);
    return { conversation, messages };
  }

  async function listConversations(agentId: string, limit = 20): Promise<Array<Record<string, unknown>>> {
    return await db.all('SELECT * FROM agent_conversations WHERE agent_id = ? ORDER BY updated_at DESC LIMIT ?', agentId, limit);
  }

  // ── Templates ──────────────────────────────────────────────────────

  async function listTemplates(): Promise<Array<Record<string, unknown>>> {
    return await db.all('SELECT * FROM agent_templates ORDER BY category, name');
  }

  async function getTemplate(id: string): Promise<Record<string, unknown> | null> {
    return await db.get('SELECT * FROM agent_templates WHERE id = ?', id) ?? null;
  }

  // ── Stats ──────────────────────────────────────────────────────────

  async function getAgentStats(agentId: string): Promise<Record<string, unknown>> {
    const agent = await getAgent(agentId);
    const recentConvs = await db.get<{ n: number }>(
      "SELECT COUNT(*) as n FROM agent_conversations WHERE agent_id = ? AND created_at > NOW() - INTERVAL '7 days'", agentId
    );
    const escalated = await db.get<{ n: number }>(
      "SELECT COUNT(*) as n FROM agent_conversations WHERE agent_id = ? AND status = 'escalated'", agentId
    );
    return {
      totalConversations: agent?.total_conversations ?? 0,
      recentConversations: recentConvs?.n ?? 0,
      totalEscalations: escalated?.n ?? 0,
      avgSatisfaction: agent?.avg_satisfaction_score ?? null,
    };
  }

  return {
    createAgent, getAgent, getAgentBySlug, listAgents, updateAgent, deleteAgent,
    createConversation, addMessage, getConversation, listConversations,
    listTemplates, getTemplate, getAgentStats,
  };
}

export type AgentService = Awaited<ReturnType<typeof createAgentService>>;
