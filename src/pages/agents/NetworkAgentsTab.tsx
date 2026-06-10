/**
 * NetworkAgentsTab.tsx — discover + query agents on peer ANTON instances.
 *
 * Frontend for the previously curl-only remote-agent endpoints:
 *   GET  /api/agents/remote/discover  — list peers' public agent directories
 *   POST /api/agents/remote/query     — query a specific remote agent
 *
 * Flow: discover → pick an agent → send a query → markdown answer with
 * latency + source instance. Honest empty state when no peers expose agents.
 */

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Bot, Globe, Loader2, RefreshCw, Send, Timer } from 'lucide-react';
import { discoverRemoteAgents, queryRemoteAgent, type RemoteAgentInfo } from '@/lib/api';

interface RemoteExchange {
  question: string;
  response: string;
  agentName: string;
  peerName: string;
  endpoint: string;
  latencyMs: number;
}

export default function NetworkAgentsTab() {
  const [agents, setAgents] = useState<RemoteAgentInfo[]>([]);
  const [discovering, setDiscovering] = useState(true);
  const [selected, setSelected] = useState<RemoteAgentInfo | null>(null);
  const [query, setQuery] = useState('');
  const [asking, setAsking] = useState(false);
  const [exchanges, setExchanges] = useState<RemoteExchange[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const discover = useCallback(async () => {
    setDiscovering(true);
    setError(null);
    try {
      setAgents(await discoverRemoteAgents());
    } finally {
      setDiscovering(false);
    }
  }, []);

  useEffect(() => { discover(); }, [discover]);

  function selectAgent(agent: RemoteAgentInfo) {
    setSelected(agent);
    setExchanges([]);
    setConversationId(undefined);
    setError(null);
  }

  async function handleAsk() {
    const q = query.trim();
    if (!q || !selected || asking) return;
    setAsking(true);
    setError(null);
    setQuery('');
    const started = Date.now();
    try {
      const result = await queryRemoteAgent({
        query: q,
        endpoint: selected.endpoint,
        agentSlug: selected.slug,
        conversationId,
      });
      const latencyMs = Date.now() - started;
      if (!result) {
        setError('The remote agent did not answer — the peer may be offline.');
        return;
      }
      setConversationId(result.conversationId);
      setExchanges(prev => [...prev, {
        question: q,
        response: result.response,
        agentName: result.agentName,
        peerName: selected.peerName,
        endpoint: selected.endpoint,
        latencyMs,
      }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Remote query failed');
    } finally {
      setAsking(false);
    }
  }

  if (discovering) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20">
        <Loader2 className="h-6 w-6 animate-spin text-adv-teal" />
        <p className="text-sm text-adv-gray">Asking connected peers for their public agents…</p>
      </div>
    );
  }

  if (agents.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-adv-card px-6 py-12 text-center">
        <Globe className="h-10 w-10 text-adv-gray/40 mx-auto mb-3" />
        <h3 className="text-base font-medium text-adv-off-white">No network agents found</h3>
        <p className="mt-1 text-sm text-adv-gray max-w-md mx-auto">
          Network agents are public agents published by your Community contacts' ANTON instances.
          None of your connected peers currently expose agents — or you have no peers with an endpoint configured.
        </p>
        <div className="mt-4 flex items-center justify-center gap-3">
          <Link to="/community/contacts"
            className="rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark">
            Manage Community contacts
          </Link>
          <button onClick={discover}
            className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-adv-gray hover:text-adv-teal">
            <RefreshCw className="h-4 w-4" /> Retry discovery
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-adv-gray">
          {agents.length} public agent{agents.length === 1 ? '' : 's'} found on connected peers. Pick one to query it.
        </p>
        <button onClick={discover}
          className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs text-adv-gray hover:text-adv-teal">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      {/* Agent picker */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {agents.map(agent => {
          const isSelected = selected?.endpoint === agent.endpoint && selected?.slug === agent.slug;
          return (
            <button key={`${agent.endpoint}::${agent.slug}`} onClick={() => selectAgent(agent)}
              className={`rounded-xl border p-4 text-left transition ${
                isSelected ? 'border-adv-teal bg-adv-teal-dim' : 'border-border bg-adv-card hover:border-adv-teal/40'
              }`}>
              <div className="flex items-center gap-2 mb-1">
                <Bot className={`h-4 w-4 shrink-0 ${isSelected ? 'text-adv-teal' : 'text-purple-400'}`} />
                <span className={`text-sm font-medium truncate ${isSelected ? 'text-adv-teal' : 'text-adv-off-white'}`}>{agent.name}</span>
              </div>
              <p className="text-xs text-adv-gray line-clamp-2">{agent.role}</p>
              <div className="mt-2 flex items-center gap-1.5 text-xs text-adv-gray">
                <Globe className="h-3 w-3 shrink-0" />
                <span className="truncate">{agent.peerName || agent.endpoint}</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Query surface */}
      {selected && (
        <div className="rounded-xl border border-border bg-adv-dark-2 p-4 space-y-4">
          <div className="flex items-center gap-2 text-sm text-adv-gray">
            <Bot className="h-4 w-4 text-adv-teal" />
            Asking <span className="font-medium text-adv-off-white">{selected.name}</span>
            on <span className="font-medium text-adv-off-white">{selected.peerName || selected.endpoint}</span>
          </div>

          {exchanges.map((ex, i) => (
            <div key={i} className="space-y-2">
              <div className="flex justify-end">
                <div className="max-w-[75%] rounded-xl bg-adv-teal/10 px-4 py-2.5 text-sm text-adv-off-white whitespace-pre-wrap">
                  {ex.question}
                </div>
              </div>
              <div className="rounded-xl border border-border bg-adv-card px-4 py-3">
                <div className="prose prose-invert prose-sm max-w-none text-adv-off-white">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{ex.response}</ReactMarkdown>
                </div>
                <div className="mt-2 flex items-center gap-3 border-t border-border pt-2 text-xs text-adv-gray">
                  <span className="flex items-center gap-1"><Bot className="h-3 w-3" /> {ex.agentName} @ {ex.peerName || ex.endpoint}</span>
                  <span className="flex items-center gap-1"><Timer className="h-3 w-3" /> {(ex.latencyMs / 1000).toFixed(1)}s</span>
                </div>
              </div>
            </div>
          ))}

          {asking && (
            <div className="flex items-center gap-2 text-sm text-adv-gray">
              <Loader2 className="h-4 w-4 animate-spin text-adv-teal" /> Waiting for {selected.name}…
            </div>
          )}
          {error && (
            <div className="rounded-lg border border-adv-red/20 bg-adv-red/10 px-3 py-2 text-sm text-adv-red">{error}</div>
          )}

          <div className="flex items-end gap-2">
            <textarea value={query} onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAsk(); } }}
              placeholder={`Ask ${selected.name}…`} rows={2} disabled={asking}
              className="flex-1 resize-none rounded-lg border border-border bg-adv-card px-3 py-2 text-sm text-adv-off-white placeholder:text-adv-gray/50 focus:border-adv-teal focus:outline-none disabled:opacity-50" />
            <button onClick={handleAsk} disabled={!query.trim() || asking} title="Send"
              className="rounded-lg bg-adv-teal p-2.5 text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50">
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
