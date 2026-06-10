/**
 * AgentDetailPage.tsx — workspace for a single specialized agent.
 *
 * Three tabs over the existing (previously orphaned) backend:
 *   Chat       — conversations + POST /api/agents/:id/query, with tool-call
 *                activity surfaced from the conversation's 'tool' messages.
 *   Settings   — PATCH /api/agents/:id (system prompt, default model via the
 *                shared ModelSelector with an Auto option → null, thinking,
 *                tokens, routing + escalation fields).
 *   Connectors — list/add/test/delete agent_connectors (credentials are
 *                write-only; the server encrypts them at rest).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  ArrowLeft, Bot, Check, Loader2, MessageCircle, Pause, Play, Plug,
  Plus, Send, Settings as SettingsIcon, Trash2, Wrench, Zap,
} from 'lucide-react';
import {
  fetchAgent, updateAgentProfile, setAgentStatus,
  fetchAgentConversations, fetchAgentConversation, queryAgent,
  fetchAgentConnectors, createAgentConnector, deleteAgentConnector, testAgentConnector,
  type AgentProfileData, type AgentConversationSummary, type AgentMessage, type AgentConnector,
} from '@/lib/api';
import ModelSelector from '@/components/shared/ModelSelector';
import type { ModelId } from '@/lib/types';

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-adv-green/15 text-adv-green border-adv-green/20',
  draft: 'bg-adv-gray/15 text-adv-gray border-adv-gray/20',
  paused: 'bg-adv-gold/15 text-adv-gold border-adv-gold/20',
  archived: 'bg-adv-red/15 text-adv-red border-adv-red/20',
};

const THINKING_LEVELS = ['quick', 'think', 'think_hard', 'investigate', 'plan_first'] as const;
const ESCALATION_POLICIES = ['notify', 'redirect', 'human_only', 'queue'] as const;
const CONNECTOR_TYPES = ['rest_api', 'webhook', 'database', 'email', 'calendar', 'crm', 'erp'] as const;

const FALLBACK_MODEL: ModelId = 'claude-opus-4-8';

type Tab = 'chat' | 'settings' | 'connectors';

function parseKeywords(raw: string | string[]): string[] {
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === 'string') : [];
  } catch {
    return [];
  }
}

export default function AgentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [agent, setAgent] = useState<AgentProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [tab, setTab] = useState<Tab>('chat');

  const load = useCallback(async () => {
    if (!id) return;
    const data = await fetchAgent(id);
    if (!data) { setNotFound(true); setLoading(false); return; }
    setAgent(data.agent);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function toggleStatus() {
    if (!agent) return;
    const action = agent.status === 'active' ? 'pause' : 'activate';
    try {
      await setAgentStatus(agent.id, action);
      setAgent({ ...agent, status: action === 'activate' ? 'active' : 'paused' });
    } catch { /* leave status as-is */ }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-adv-dark">
        <Loader2 className="h-6 w-6 animate-spin text-adv-teal" />
      </div>
    );
  }

  if (notFound || !agent) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-adv-dark">
        <Bot className="h-12 w-12 text-adv-gray/40" />
        <p className="text-sm text-adv-gray">Agent not found.</p>
        <button onClick={() => navigate('/agents')} className="text-sm text-adv-teal hover:underline">
          Back to Agent Hub
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-adv-dark">
      {/* Header */}
      <div className="border-b border-border bg-adv-dark-2 px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={() => navigate('/agents')} title="Back to Agent Hub"
              className="rounded-lg border border-border p-2 text-adv-gray hover:text-adv-teal shrink-0">
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10 shrink-0">
              <Bot className="h-5 w-5 text-purple-400" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-semibold text-adv-off-white truncate">{agent.name}</h1>
                <span className={`rounded-full border px-2 py-0.5 text-xs font-medium shrink-0 ${STATUS_COLORS[agent.status] ?? STATUS_COLORS.draft}`}>
                  {agent.status}
                </span>
              </div>
              <p className="text-sm text-adv-gray truncate">{agent.role_description}</p>
            </div>
          </div>
          <button onClick={toggleStatus}
            className="flex shrink-0 items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-adv-gray hover:text-adv-teal">
            {agent.status === 'active' ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {agent.status === 'active' ? 'Pause' : 'Activate'}
          </button>
        </div>

        {/* Tabs */}
        <div className="mt-4 flex items-center gap-1">
          {([
            { key: 'chat' as Tab, label: 'Chat', icon: MessageCircle },
            { key: 'settings' as Tab, label: 'Settings', icon: SettingsIcon },
            { key: 'connectors' as Tab, label: 'Connectors', icon: Plug },
          ]).map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => setTab(key)}
              className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                tab === key ? 'bg-adv-teal/10 text-adv-teal' : 'text-adv-gray hover:text-adv-off-white'
              }`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === 'chat' && <ChatTab agent={agent} onActivate={toggleStatus} />}
        {tab === 'settings' && <SettingsTab agent={agent} onSaved={load} />}
        {tab === 'connectors' && <ConnectorsTab agentId={agent.id} />}
      </div>
    </div>
  );
}

// ── Chat tab ─────────────────────────────────────────────────────────

function ChatTab({ agent, onActivate }: { agent: AgentProfileData; onActivate: () => void }) {
  const [conversations, setConversations] = useState<AgentConversationSummary[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadConversations = useCallback(async () => {
    setConversations(await fetchAgentConversations(agent.id, 30));
  }, [agent.id]);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function openConversation(convId: string) {
    setActiveConvId(convId);
    setError(null);
    const data = await fetchAgentConversation(convId);
    setMessages(data?.messages ?? []);
  }

  function startNewConversation() {
    setActiveConvId(null);
    setMessages([]);
    setError(null);
  }

  async function handleSend() {
    const message = input.trim();
    if (!message || sending) return;
    setSending(true);
    setError(null);
    setInput('');
    // Optimistic local echo of the user message
    setMessages(prev => [...prev, {
      id: `local_${Date.now()}`, conversation_id: activeConvId ?? '', role: 'user',
      content: message, thinking: null, created_at: new Date().toISOString(),
    }]);
    try {
      const result = await queryAgent(agent.id, message, activeConvId ?? undefined);
      setActiveConvId(result.conversationId);
      // Re-fetch the conversation so tool-call rows logged server-side appear.
      const data = await fetchAgentConversation(result.conversationId);
      setMessages(data?.messages ?? []);
      if (!activeConvId) loadConversations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Query failed');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-full">
      {/* Conversation list */}
      <div className="flex w-64 shrink-0 flex-col border-r border-border bg-adv-dark-2">
        <div className="p-3">
          <button onClick={startNewConversation}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-adv-teal px-3 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark">
            <Plus className="h-4 w-4" /> New conversation
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1">
          {conversations.length === 0 ? (
            <p className="px-2 py-4 text-center text-xs text-adv-gray">No conversations yet</p>
          ) : conversations.map(conv => (
            <button key={conv.id} onClick={() => openConversation(conv.id)}
              className={`w-full rounded-lg px-3 py-2 text-left transition ${
                activeConvId === conv.id ? 'bg-adv-teal/10 text-adv-teal' : 'text-adv-gray hover:bg-adv-card hover:text-adv-off-white'
              }`}>
              <div className="text-sm font-medium truncate">
                {conv.requester_name || (conv.source === 'direct' ? 'Direct chat' : conv.source)}
              </div>
              <div className="text-xs opacity-70 truncate">
                {new Date(conv.updated_at ?? conv.created_at).toLocaleString()}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Thread + composer */}
      <div className="flex flex-1 min-w-0 flex-col">
        {agent.status !== 'active' && (
          <div className="flex items-center justify-between gap-3 border-b border-adv-gold/20 bg-adv-gold/10 px-4 py-2">
            <p className="text-sm text-adv-gold">This agent is {agent.status} — activate it to chat.</p>
            <button onClick={onActivate} className="shrink-0 rounded-lg border border-adv-gold/40 px-3 py-1 text-xs font-medium text-adv-gold hover:bg-adv-gold/10">
              Activate
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {messages.length === 0 && !sending ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <MessageCircle className="h-10 w-10 text-adv-gray/30 mb-3" />
              <p className="text-sm text-adv-gray">
                {agent.greeting_message || `Ask ${agent.name} anything within its domain.`}
              </p>
            </div>
          ) : messages.map(msg => <MessageRow key={msg.id} msg={msg} />)}
          {sending && (
            <div className="flex items-center gap-2 text-sm text-adv-gray">
              <Loader2 className="h-4 w-4 animate-spin text-adv-teal" /> {agent.name} is thinking…
            </div>
          )}
          {error && (
            <div className="rounded-lg border border-adv-red/20 bg-adv-red/10 px-3 py-2 text-sm text-adv-red">{error}</div>
          )}
          <div ref={bottomRef} />
        </div>
        <div className="border-t border-border bg-adv-dark-2 px-4 py-3">
          <div className="flex items-end gap-2">
            <textarea value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder={`Message ${agent.name}…`} rows={2} disabled={sending}
              className="flex-1 resize-none rounded-lg border border-border bg-adv-card px-3 py-2 text-sm text-adv-off-white placeholder:text-adv-gray/50 focus:border-adv-teal focus:outline-none disabled:opacity-50" />
            <button onClick={handleSend} disabled={!input.trim() || sending} title="Send"
              className="rounded-lg bg-adv-teal p-2.5 text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50">
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MessageRow({ msg }: { msg: AgentMessage }) {
  if (msg.role === 'tool') {
    // Tool messages are JSON logs of connector calls — render as activity chips.
    let info: { tool?: string; action?: string; success?: boolean; durationMs?: number } = {};
    try { info = JSON.parse(msg.content) as typeof info; } catch { /* show raw below */ }
    return (
      <div className="flex justify-start">
        <div className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs ${
          info.success === false ? 'border-adv-red/20 bg-adv-red/10 text-adv-red' : 'border-border bg-adv-card text-adv-gray'
        }`}>
          <Wrench className="h-3.5 w-3.5 shrink-0" />
          <span>
            Connector <span className="font-medium text-adv-off-white">{info.tool ?? 'call'}</span>
            {info.action ? ` · ${info.action}` : ''}
            {info.success === false ? ' · failed' : info.success === true ? ' · ok' : ''}
            {typeof info.durationMs === 'number' ? ` · ${info.durationMs}ms` : ''}
          </span>
        </div>
      </div>
    );
  }
  if (msg.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[75%] rounded-xl bg-adv-teal/10 px-4 py-2.5 text-sm text-adv-off-white whitespace-pre-wrap">
          {msg.content}
        </div>
      </div>
    );
  }
  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] rounded-xl border border-border bg-adv-card px-4 py-3">
        <div className="prose prose-invert prose-sm max-w-none text-adv-off-white">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}

// ── Settings tab ─────────────────────────────────────────────────────

function SettingsTab({ agent, onSaved }: { agent: AgentProfileData; onSaved: () => void }) {
  const [systemPrompt, setSystemPrompt] = useState(agent.system_prompt);
  // M9: null = Auto (instance default); otherwise an explicit model id.
  const [defaultModel, setDefaultModel] = useState<string | null>(agent.default_model);
  const [thinking, setThinking] = useState(agent.default_thinking);
  const [maxTokens, setMaxTokens] = useState(agent.max_tokens);
  const [keywords, setKeywords] = useState(parseKeywords(agent.routing_keywords).join(', '));
  const [routingPriority, setRoutingPriority] = useState(agent.routing_priority);
  const [escalationPolicy, setEscalationPolicy] = useState(agent.escalation_policy);
  const [maxTurns, setMaxTurns] = useState(agent.max_conversation_turns);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await updateAgentProfile(agent.id, {
        system_prompt: systemPrompt,
        default_model: defaultModel,
        default_thinking: thinking,
        max_tokens: maxTokens,
        routing_keywords: keywords.split(',').map(k => k.trim()).filter(Boolean),
        routing_priority: routingPriority,
        escalation_policy: escalationPolicy,
        max_conversation_turns: maxTurns,
      });
      setSaved(true);
      onSaved();
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  const labelCls = 'mb-2 block text-sm font-medium text-adv-off-white';
  const inputCls = 'w-full rounded-lg border border-border bg-adv-card px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none';

  return (
    <div className="h-full overflow-y-auto px-6 py-6">
      <div className="max-w-3xl space-y-6">
        <div>
          <label className={labelCls}>System prompt</label>
          <textarea value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)} rows={10}
            className={`${inputCls} font-mono text-xs resize-y`} />
        </div>

        {/* Default model — Auto (instance default) ⇄ explicit ModelSelector (closes parity M9) */}
        <div>
          <label className={labelCls}>Default model</label>
          <div className="flex items-center gap-2 mb-3">
            <button onClick={() => setDefaultModel(null)}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                defaultModel === null
                  ? 'border-adv-teal bg-adv-teal-dim text-adv-teal'
                  : 'border-border text-adv-gray hover:text-adv-off-white'
              }`}>
              <Zap className="h-4 w-4" /> Auto (instance default)
              {defaultModel === null && <Check className="h-4 w-4" />}
            </button>
            <button onClick={() => { if (defaultModel === null) setDefaultModel(FALLBACK_MODEL); }}
              className={`rounded-lg border px-3 py-2 text-sm transition ${
                defaultModel !== null
                  ? 'border-adv-teal bg-adv-teal-dim text-adv-teal'
                  : 'border-border text-adv-gray hover:text-adv-off-white'
              }`}>
              Specific model
            </button>
          </div>
          {defaultModel !== null && (
            <ModelSelector value={defaultModel as ModelId} onChange={(m) => setDefaultModel(m)} variant="dropdown" />
          )}
          <p className="mt-1.5 text-xs text-adv-gray">
            Auto follows the instance-wide default; a specific model pins this agent regardless of instance settings.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Thinking level</label>
            <select value={thinking} onChange={e => setThinking(e.target.value)} className={inputCls}>
              {THINKING_LEVELS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Max tokens</label>
            <input type="number" min={1024} max={128000} value={maxTokens}
              onChange={e => setMaxTokens(Number(e.target.value))} className={inputCls} />
          </div>
        </div>

        <div>
          <label className={labelCls}>Routing keywords <span className="font-normal text-adv-gray">(comma-separated — used to route incoming queries)</span></label>
          <input type="text" value={keywords} onChange={e => setKeywords(e.target.value)}
            placeholder="billing, invoice, refund" className={inputCls} />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className={labelCls}>Routing priority</label>
            <input type="number" value={routingPriority} onChange={e => setRoutingPriority(Number(e.target.value))} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Escalation policy</label>
            <select value={escalationPolicy} onChange={e => setEscalationPolicy(e.target.value)} className={inputCls}>
              {ESCALATION_POLICIES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Max conversation turns</label>
            <input type="number" min={1} max={100} value={maxTurns}
              onChange={e => setMaxTurns(Number(e.target.value))} className={inputCls} />
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-adv-red/20 bg-adv-red/10 px-3 py-2 text-sm text-adv-red">{error}</div>
        )}

        <div className="flex items-center gap-3">
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {saving ? 'Saving…' : 'Save settings'}
          </button>
          {saved && <span className="text-sm text-adv-green">Saved</span>}
        </div>
      </div>
    </div>
  );
}

// ── Connectors tab ───────────────────────────────────────────────────

function ConnectorsTab({ agentId }: { agentId: string }) {
  const [connectors, setConnectors] = useState<AgentConnector[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [testResults, setTestResults] = useState<Record<string, { running: boolean; text?: string; ok?: boolean }>>({});

  // Add-form state
  const [name, setName] = useState('');
  const [connectorType, setConnectorType] = useState<string>('rest_api');
  const [description, setDescription] = useState('');
  const [configJson, setConfigJson] = useState('{\n  "base_url": ""\n}');
  const [authJson, setAuthJson] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setConnectors(await fetchAgentConnectors(agentId));
    setLoading(false);
  }, [agentId]);

  useEffect(() => { load(); }, [load]);

  async function handleAdd() {
    setAddError(null);
    let config: Record<string, unknown>;
    let authConfig: Record<string, unknown> | undefined;
    try {
      config = JSON.parse(configJson) as Record<string, unknown>;
    } catch {
      setAddError('Config must be valid JSON');
      return;
    }
    if (authJson.trim()) {
      try {
        authConfig = JSON.parse(authJson) as Record<string, unknown>;
      } catch {
        setAddError('Credentials must be valid JSON');
        return;
      }
    }
    if (!name.trim()) { setAddError('Name is required'); return; }
    setAdding(true);
    try {
      await createAgentConnector(agentId, { name: name.trim(), connectorType, description: description.trim() || undefined, config, authConfig });
      setShowAdd(false);
      setName(''); setDescription(''); setConfigJson('{\n  "base_url": ""\n}'); setAuthJson('');
      load();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to add connector');
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(connectorId: string) {
    await deleteAgentConnector(agentId, connectorId);
    setConnectors(prev => prev.filter(c => c.id !== connectorId));
  }

  async function handleTest(connectorId: string) {
    setTestResults(prev => ({ ...prev, [connectorId]: { running: true } }));
    const result = await testAgentConnector(agentId, connectorId);
    setTestResults(prev => ({
      ...prev,
      [connectorId]: {
        running: false,
        ok: result.success && !result.error,
        text: result.error ?? JSON.stringify(result.result ?? result, null, 2).slice(0, 600),
      },
    }));
  }

  const inputCls = 'w-full rounded-lg border border-border bg-adv-card px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none';

  return (
    <div className="h-full overflow-y-auto px-6 py-6">
      <div className="max-w-3xl space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-adv-off-white">Connectors</h2>
            <p className="text-sm text-adv-gray">Live tools this agent can call (APIs, databases, calendars…). Credentials are encrypted and write-only.</p>
          </div>
          <button onClick={() => setShowAdd(v => !v)}
            className="flex shrink-0 items-center gap-2 rounded-lg bg-adv-teal px-3 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark">
            <Plus className="h-4 w-4" /> Add connector
          </button>
        </div>

        {showAdd && (
          <div className="rounded-xl border border-border bg-adv-dark-2 p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-adv-gray">Name</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Inventory API" className={inputCls} />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-adv-gray">Type</label>
                <select value={connectorType} onChange={e => setConnectorType(e.target.value)} className={inputCls}>
                  {CONNECTOR_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-adv-gray">Description <span className="font-normal">(tells the agent when to use it)</span></label>
              <input type="text" value={description} onChange={e => setDescription(e.target.value)}
                placeholder="Look up product stock levels by SKU" className={inputCls} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-adv-gray">Config (JSON)</label>
              <textarea value={configJson} onChange={e => setConfigJson(e.target.value)} rows={4}
                className={`${inputCls} font-mono text-xs resize-y`} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-adv-gray">Credentials (JSON, optional — stored encrypted, never shown again)</label>
              <textarea value={authJson} onChange={e => setAuthJson(e.target.value)} rows={3}
                placeholder='{ "type": "bearer", "token": "…" }'
                className={`${inputCls} font-mono text-xs resize-y`} />
            </div>
            {addError && <p className="text-sm text-adv-red">{addError}</p>}
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => setShowAdd(false)} className="rounded-lg border border-border px-3 py-2 text-sm text-adv-gray hover:text-adv-off-white">Cancel</button>
              <button onClick={handleAdd} disabled={adding}
                className="flex items-center gap-2 rounded-lg bg-adv-teal px-3 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50">
                {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-adv-teal" /></div>
        ) : connectors.length === 0 ? (
          <div className="rounded-xl border border-border bg-adv-card px-4 py-8 text-center">
            <Plug className="h-8 w-8 text-adv-gray/40 mx-auto mb-2" />
            <p className="text-sm text-adv-gray">No connectors yet. Add one so the agent can act on live systems.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {connectors.map(conn => {
              const test = testResults[conn.id];
              return (
                <div key={conn.id} className="rounded-xl border border-border bg-adv-card px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-adv-off-white">{conn.name}</span>
                        <span className="rounded bg-adv-teal/10 px-1.5 py-0.5 text-xs font-medium text-adv-teal">{conn.connector_type}</span>
                        {!conn.is_active && (
                          <span className="rounded bg-adv-gray/15 px-1.5 py-0.5 text-xs text-adv-gray">inactive</span>
                        )}
                      </div>
                      {conn.description && <p className="text-xs text-adv-gray truncate mt-0.5">{conn.description}</p>}
                      {conn.last_error && <p className="text-xs text-adv-red truncate mt-0.5">Last error: {conn.last_error}</p>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => handleTest(conn.id)} disabled={test?.running} title="Test connector"
                        className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-adv-gray hover:text-adv-teal disabled:opacity-50">
                        {test?.running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                        Test
                      </button>
                      <button onClick={() => handleDelete(conn.id)} title="Delete connector"
                        className="rounded-lg border border-border p-1.5 text-adv-gray hover:text-adv-red">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  {test && !test.running && test.text && (
                    <pre className={`mt-2 overflow-x-auto rounded-lg border px-3 py-2 text-xs ${
                      test.ok ? 'border-adv-green/20 bg-adv-green/5 text-adv-green' : 'border-adv-red/20 bg-adv-red/5 text-adv-red'
                    }`}>{test.text}</pre>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
