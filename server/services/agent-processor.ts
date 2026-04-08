/**
 * agent-processor.ts — Executes queries against specialized agents
 *
 * Loads the agent's persona, knowledge, and context, then processes
 * the query through the LLM with full agent context. Handles escalation,
 * conversation tracking, and knowledge retrieval.
 */

import type { DatabaseAdapter } from '../db/database.js';
import { callChat } from './provider-router.js';
import { createAgentService } from './agent-service.js';

export async function createAgentProcessor(db: DatabaseAdapter) {
  const agentService = await createAgentService(db);
  const { createConnectorExecutor } = await import('./agent-connector-executor.js');
  const connectorExec = await createConnectorExecutor(db);

  /**
   * Process a query through a specialized agent.
   * Returns the agent's response with full conversation tracking.
   */
  async function processQuery(agentId: string, userMessage: string, options?: {
    conversationId?: string;
    source?: string;
    sourceRef?: string;
    requesterHash?: string;
    requesterName?: string;
  }): Promise<{
    response: string;
    thinking?: string;
    conversationId: string;
    escalated: boolean;
    inputTokens: number;
    outputTokens: number;
  }> {
    const agent = await agentService.getAgent(agentId);
    if (!agent) throw new Error(`Agent not found: ${agentId}`);
    if (agent.status !== 'active') throw new Error(`Agent "${agent.name}" is not active (status: ${agent.status})`);

    // Get or create conversation
    let conversationId = options?.conversationId;
    let conversationHistory: Array<{ role: string; content: string }> = [];

    if (conversationId) {
      const conv = await agentService.getConversation(conversationId);
      if (conv) {
        conversationHistory = conv.messages
          .filter(m => (m as { role: string }).role !== 'system')
          .map(m => ({ role: (m as { role: string }).role, content: (m as { content: string }).content }));

        // Check turn limit
        const turnCount = conversationHistory.filter(m => m.role === 'user').length;
        if (turnCount >= agent.max_conversation_turns) {
          return {
            response: `I've reached my conversation limit for this session. ${
              agent.escalation_policy === 'redirect' && agent.fallback_agent_id
                ? 'Let me redirect you to another specialist.'
                : 'Please contact a human representative for further assistance.'
            }`,
            conversationId,
            escalated: true,
            inputTokens: 0,
            outputTokens: 0,
          };
        }
      }
    }

    if (!conversationId) {
      conversationId = await agentService.createConversation(
        agentId, options?.source ?? 'direct', options?.sourceRef,
        options?.requesterHash, options?.requesterName
      );
    }

    // Save user message
    await agentService.addMessage(conversationId, 'user', userMessage);

    // ── Build knowledge context ──────────────────────────────────────
    let knowledgeContext = '';

    // RAG search from linked collections
    if (agent.rag_search_enabled) {
      try {
        const collectionIds = typeof agent.knowledge_collection_ids === 'string'
          ? JSON.parse(agent.knowledge_collection_ids) : agent.knowledge_collection_ids;
        if (Array.isArray(collectionIds) && collectionIds.length > 0) {
          const placeholders = collectionIds.map(() => '?').join(',');
          const chunks = await db.all<{ content: string; metadata: string }>(
            `SELECT rc.content, rc.metadata FROM rag_chunks rc
             JOIN rag_documents rd ON rc.document_id = rd.id
             WHERE rd.collection_id IN (${placeholders})
             AND rc.content ILIKE ?
             ORDER BY LENGTH(rc.content) DESC LIMIT 5`,
            ...collectionIds, `%${userMessage.split(/\s+/).slice(0, 3).join('%')}%`
          );
          if (chunks.length > 0) {
            knowledgeContext += '\n\nRELEVANT DOCUMENTS:\n' +
              chunks.map(c => c.content.slice(0, 500)).join('\n---\n');
          }
        }
      } catch { /* RAG search is best-effort */ }
    }

    // Knowledge atoms from scoped areas
    try {
      const scopes = typeof agent.knowledge_atom_scopes === 'string'
        ? JSON.parse(agent.knowledge_atom_scopes) : agent.knowledge_atom_scopes;
      let atomQuery = `SELECT content, atom_type, confidence FROM knowledge_atoms WHERE confidence >= 0.5`;
      const atomArgs: unknown[] = [];
      if (Array.isArray(scopes) && scopes.length > 0) {
        atomQuery += ` AND category IN (${scopes.map(() => '?').join(',')})`;
        atomArgs.push(...scopes);
      }
      atomQuery += ` AND content ILIKE ? ORDER BY confidence DESC LIMIT 8`;
      atomArgs.push(`%${userMessage.split(/\s+/).slice(0, 3).join('%')}%`);
      const atoms = await db.all<{ content: string; atom_type: string; confidence: number }>(atomQuery, ...atomArgs);
      if (atoms.length > 0) {
        knowledgeContext += '\n\nKNOWLEDGE BASE:\n' +
          atoms.map(a => `[${a.atom_type}|${a.confidence}] ${a.content}`).join('\n');
      }
    } catch { /* atom search is best-effort */ }

    // ── Build tool descriptions from connectors ───────────────────────
    const connectors = await connectorExec.getAgentConnectors(agent.id);
    const toolDescriptions = connectorExec.buildToolDescriptions(connectors);

    // ── Build system prompt with agent identity ──────────────────────
    const systemPrompt = `${agent.system_prompt}

${agent.greeting_message && conversationHistory.length === 0 ? `Your greeting when starting a new conversation: "${agent.greeting_message}"` : ''}

IMPORTANT BEHAVIOR RULES:
- You are "${agent.name}" — ${agent.role_description}
- Stay in character and within your domain expertise
- If a question is outside your scope, say so clearly and suggest who might help
- Use markdown formatting for readability
- Be professional, helpful, and concise
${agent.escalation_policy === 'human_only' ? '- For anything requiring professional advice (legal, medical, financial), always recommend consulting a qualified professional' : ''}
${knowledgeContext}
${toolDescriptions}`;

    // ── Build messages ───────────────────────────────────────────────
    const messages = [
      ...conversationHistory,
      { role: 'user', content: userMessage },
    ];

    // ── Call LLM ─────────────────────────────────────────────────────
    const result = await callChat({
      model: agent.default_model ?? undefined,
      tier: agent.default_model ? undefined : 'medium',
      system: systemPrompt,
      messages,
      maxTokens: agent.max_tokens,
      db,
    });

    let finalResponse = result.text;
    let totalInputTokens = result.inputTokens;
    let totalOutputTokens = result.outputTokens;

    // ── Tool Call Execution Loop ─────────────────────────────────────
    // If the AI response contains tool_call blocks, execute them and re-prompt
    if (connectors.length > 0) {
      const toolCalls = connectorExec.parseToolCalls(result.text);
      if (toolCalls.length > 0) {
        // Execute each tool call
        const toolResults: string[] = [];
        for (const tc of toolCalls.slice(0, 5)) { // Max 5 tool calls per turn
          const callResult = await connectorExec.executeCall(agent.id, tc);
          toolResults.push(`TOOL RESULT [${callResult.connectorName}]: ${callResult.success ? JSON.stringify(callResult.data) : `ERROR: ${callResult.error}`}`);

          // Log tool call
          await agentService.addMessage(conversationId, 'tool', JSON.stringify({
            tool: tc.tool, action: tc.action, params: tc.params,
            success: callResult.success, durationMs: callResult.durationMs,
          }));
        }

        // Re-prompt with tool results so AI can incorporate them
        const followUp = await callChat({
          model: agent.default_model ?? undefined,
          tier: agent.default_model ? undefined : 'medium',
          system: systemPrompt,
          messages: [
            ...messages,
            { role: 'assistant', content: result.text },
            { role: 'user', content: `Here are the results from the tools you called:\n\n${toolResults.join('\n\n')}\n\nNow provide your final response to the user incorporating these results. Do NOT include tool_call blocks — just give the final answer.` },
          ],
          maxTokens: agent.max_tokens,
          db,
        });

        finalResponse = followUp.text;
        totalInputTokens += followUp.inputTokens;
        totalOutputTokens += followUp.outputTokens;
      }
    }

    // Save assistant response
    await agentService.addMessage(conversationId, 'assistant', finalResponse, result.thinking,
      totalInputTokens, totalOutputTokens);

    // Update agent stats
    await db.run('UPDATE agent_profiles SET total_messages_handled = total_messages_handled + 1, updated_at = NOW() WHERE id = ?', agentId);

    return {
      response: finalResponse,
      thinking: result.thinking || undefined,
      conversationId,
      escalated: false,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
    };
  }

  /**
   * Process a P2P task through a specialized agent.
   * Used when task delegation routes a task to a specific agent.
   */
  async function processAgentTask(agentId: string, taskPayload: {
    taskId: string; title: string; description: string;
    context?: string; requiredModules?: string[];
  }, fromHash: string): Promise<{ status: string; taskId: string; result: string }> {
    const userMessage = `TASK: ${taskPayload.title}\n\n${taskPayload.description}${taskPayload.context ? `\n\nCONTEXT:\n${taskPayload.context}` : ''}`;

    const result = await processQuery(agentId, userMessage, {
      source: 'task_delegation',
      sourceRef: taskPayload.taskId,
      requesterHash: fromHash,
    });

    return {
      status: 'completed',
      taskId: taskPayload.taskId,
      result: result.response,
    };
  }

  /**
   * Route a query to the best matching agent based on keywords and patterns.
   */
  async function routeQuery(query: string): Promise<{ agentId: string; agentName: string; confidence: number } | null> {
    const activeAgents = await agentService.listAgents({ status: 'active' });
    if (activeAgents.length === 0) return null;

    let bestMatch: { agentId: string; agentName: string; confidence: number } | null = null;
    const queryLower = query.toLowerCase();

    for (const agent of activeAgents) {
      const keywords: string[] = typeof agent.routing_keywords === 'string'
        ? JSON.parse(agent.routing_keywords) : (agent.routing_keywords ?? []);

      // Count keyword matches
      const matchCount = keywords.filter(kw => queryLower.includes(kw.toLowerCase())).length;
      if (matchCount === 0) continue;

      const confidence = Math.min(0.95, 0.4 + (matchCount / Math.max(keywords.length, 1)) * 0.5);

      if (!bestMatch || confidence > bestMatch.confidence) {
        bestMatch = { agentId: agent.id, agentName: agent.name, confidence };
      }
    }

    return bestMatch;
  }

  return { processQuery, processAgentTask, routeQuery };
}

export type AgentProcessor = Awaited<ReturnType<typeof createAgentProcessor>>;
