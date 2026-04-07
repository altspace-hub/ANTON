/**
 * remote-agent-client.ts — Query specialized agents on remote ANTON instances
 *
 * Enables the flow: User asks their ANTON → ANTON discovers a relevant agent
 * on a peer's public directory → queries that agent → returns the response.
 *
 * Example: User wants running shoes → their ANTON finds a sports store ANTON
 * with a Sales Agent → queries it for inventory/pricing → returns to user.
 */

import type { DatabaseAdapter } from '../db/database.js';

interface RemoteAgent {
  slug: string;
  name: string;
  role: string;
  keywords: string[];
  endpoint: string;
  peerHash: string;
  peerName: string;
}

export async function createRemoteAgentClient(db: DatabaseAdapter) {

  /**
   * Discover agents available on all connected peers.
   * Queries each peer's /api/agents/public/directory endpoint.
   */
  async function discoverRemoteAgents(): Promise<RemoteAgent[]> {
    const peers = await db.all<{ contact_hash: string; endpoint: string; display_name: string }>(
      "SELECT contact_hash, endpoint, display_name FROM community_connections WHERE endpoint IS NOT NULL AND status IN ('accepted', 'active')"
    );

    const allAgents: RemoteAgent[] = [];

    for (const peer of peers) {
      try {
        const url = `${peer.endpoint.replace(/\/+$/, '')}/api/agents/public/directory`;
        const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
        if (!res.ok) continue;

        const data = await res.json() as { agents: Array<{ slug: string; name: string; role: string; keywords: string[] }> };
        for (const agent of data.agents ?? []) {
          allAgents.push({
            ...agent,
            endpoint: peer.endpoint,
            peerHash: peer.contact_hash,
            peerName: peer.display_name,
          });
        }
      } catch { /* peer offline or no agents — skip */ }
    }

    return allAgents;
  }

  /**
   * Find the best remote agent across all peers for a given query.
   */
  async function findRemoteAgent(query: string): Promise<RemoteAgent | null> {
    const agents = await discoverRemoteAgents();
    if (agents.length === 0) return null;

    const queryLower = query.toLowerCase();
    let bestMatch: RemoteAgent | null = null;
    let bestScore = 0;

    for (const agent of agents) {
      const matchCount = agent.keywords.filter(kw => queryLower.includes(kw.toLowerCase())).length;
      if (matchCount === 0) continue;
      const score = matchCount / Math.max(agent.keywords.length, 1);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = agent;
      }
    }

    return bestMatch;
  }

  /**
   * Query a specific agent on a remote ANTON instance.
   */
  async function queryRemoteAgent(endpoint: string, agentSlug: string, message: string, conversationId?: string): Promise<{
    response: string;
    agentName: string;
    agentRole: string;
    conversationId: string;
  } | null> {
    const identity = await db.get<{ contact_hash: string; display_name: string }>(
      "SELECT contact_hash, display_name FROM community_identity WHERE user_id = 'default'"
    );

    try {
      const url = `${endpoint.replace(/\/+$/, '')}/api/agents/public/query`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentSlug,
          message,
          conversationId,
          requesterHash: identity?.contact_hash,
          requesterName: identity?.display_name ?? 'ANTON',
        }),
        signal: AbortSignal.timeout(60_000), // 60s for AI processing
      });

      if (!res.ok) return null;

      const data = await res.json() as {
        agent: { name: string; role: string };
        response: string;
        conversationId: string;
      };

      return {
        response: data.response,
        agentName: data.agent.name,
        agentRole: data.agent.role,
        conversationId: data.conversationId,
      };
    } catch (err) {
      console.error(`[remote-agent] Query to ${endpoint} failed:`, err instanceof Error ? err.message : err);
      return null;
    }
  }

  /**
   * Smart query: find the best remote agent and query it in one step.
   */
  async function smartQuery(query: string): Promise<{
    response: string;
    agentName: string;
    agentRole: string;
    peerName: string;
    conversationId: string;
  } | null> {
    const agent = await findRemoteAgent(query);
    if (!agent) return null;

    console.log(`[remote-agent] Routing to "${agent.name}" on ${agent.peerName} (${agent.endpoint})`);

    const result = await queryRemoteAgent(agent.endpoint, agent.slug, query);
    if (!result) return null;

    return { ...result, peerName: agent.peerName };
  }

  return { discoverRemoteAgents, findRemoteAgent, queryRemoteAgent, smartQuery };
}
