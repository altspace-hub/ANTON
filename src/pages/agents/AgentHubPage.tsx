/**
 * AgentHubPage.tsx — Manage specialized AI agents
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot, Plus, Search, Loader2, Play, Pause, Settings, MessageCircle, Sparkles } from 'lucide-react';
import { fetchWithAuth } from '@/lib/api';

interface Agent {
  id: string; name: string; slug: string; role_description: string;
  avatar: string; status: string; total_conversations: number;
  total_messages_handled: number; routing_keywords: string; created_at: string;
}

interface Template {
  id: string; name: string; category: string; description: string; icon: string;
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-adv-green/15 text-adv-green border-adv-green/20',
  draft: 'bg-adv-gray/15 text-adv-gray border-adv-gray/20',
  paused: 'bg-adv-gold/15 text-adv-gold border-adv-gold/20',
  archived: 'bg-adv-red/15 text-adv-red border-adv-red/20',
};

export default function AgentHubPage() {
  const navigate = useNavigate();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showBuilder, setShowBuilder] = useState(false);
  const [buildDescription, setBuildDescription] = useState('');
  const [building, setBuilding] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [agentsRes, templatesRes] = await Promise.all([
          fetchWithAuth('/api/agents'),
          fetchWithAuth('/api/agents/templates'),
        ]);
        if (agentsRes.ok) { const d = await agentsRes.json(); setAgents(d.agents ?? []); }
        if (templatesRes.ok) { const d = await templatesRes.json(); setTemplates(d.templates ?? []); }
      } finally { setLoading(false); }
    }
    load();
  }, []);

  async function handleBuild() {
    if (!buildDescription.trim()) return;
    setBuilding(true);
    try {
      // Step 1: AI generates config
      const genRes = await fetchWithAuth('/api/agents/builder/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: buildDescription }),
      });
      if (!genRes.ok) return;
      const { config } = await genRes.json();

      // Step 2: Create the agent
      const createRes = await fetchWithAuth('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (createRes.ok) {
        const { id } = await createRes.json();
        navigate(`/agents/${id}`);
      }
    } finally { setBuilding(false); }
  }

  async function handleCreateFromTemplate(template: Template) {
    try {
      const defaults = typeof (template as Record<string, unknown>).default_config === 'string'
        ? JSON.parse((template as Record<string, unknown>).default_config as string)
        : (template as Record<string, unknown>).default_config ?? {};

      const res = await fetchWithAuth('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: template.name,
          roleDescription: template.description,
          systemPrompt: `You are ${template.name}. ${template.description}\n\nBe professional, helpful, and stay within your domain.`,
          avatar: template.icon,
          templateId: template.id,
          routingKeywords: defaults.routing_keywords ?? [],
          escalationPolicy: defaults.escalation_policy ?? 'notify',
          defaultThinking: defaults.default_thinking ?? 'think',
        }),
      });
      if (res.ok) {
        const { id } = await res.json();
        navigate(`/agents/${id}`);
      }
    } catch { /* ignore */ }
  }

  async function toggleStatus(agentId: string, currentStatus: string) {
    const action = currentStatus === 'active' ? 'pause' : 'activate';
    await fetchWithAuth(`/api/agents/${agentId}/${action}`, { method: 'POST' });
    setAgents(prev => prev.map(a => a.id === agentId ? { ...a, status: action === 'activate' ? 'active' : 'paused' } : a));
  }

  const filtered = agents.filter(a =>
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    a.role_description.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-adv-dark">
      <div className="border-b border-border bg-adv-dark-2 px-6 py-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10">
              <Bot className="h-5 w-5 text-purple-400" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-adv-off-white">Specialized Agents</h1>
              <p className="text-sm text-adv-gray">AI personas for autonomous business functions</p>
            </div>
          </div>
          <button onClick={() => setShowBuilder(true)}
            className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark">
            <Plus className="h-4 w-4" /> Create Agent
          </button>
        </div>
      </div>

      <div className="flex-1 px-6 py-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-xl border border-border bg-adv-card px-4 py-3">
            <div className="text-2xl font-bold text-adv-off-white">{agents.length}</div>
            <div className="text-xs text-adv-gray">Total Agents</div>
          </div>
          <div className="rounded-xl border border-border bg-adv-card px-4 py-3">
            <div className="text-2xl font-bold text-adv-green">{agents.filter(a => a.status === 'active').length}</div>
            <div className="text-xs text-adv-gray">Active</div>
          </div>
          <div className="rounded-xl border border-border bg-adv-card px-4 py-3">
            <div className="text-2xl font-bold text-adv-teal">{agents.reduce((s, a) => s + a.total_conversations, 0)}</div>
            <div className="text-xs text-adv-gray">Conversations</div>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-adv-gray" />
          <input type="text" placeholder="Search agents..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full rounded-lg border border-border bg-adv-card py-2 pl-10 pr-4 text-sm text-adv-off-white placeholder:text-adv-gray/50 focus:border-adv-teal focus:outline-none" />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-adv-teal" /></div>
        ) : filtered.length === 0 && agents.length === 0 ? (
          <div className="space-y-6">
            <div className="text-center py-8">
              <Bot className="h-12 w-12 text-adv-gray/40 mx-auto mb-3" />
              <h3 className="text-lg font-medium text-adv-off-white">No agents yet</h3>
              <p className="text-sm text-adv-gray mt-1">Create a specialized agent from a template or describe what you need</p>
            </div>

            {/* Templates */}
            <div>
              <h3 className="text-sm font-medium text-adv-off-white mb-3">Quick Start Templates</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {templates.map(t => (
                  <button key={t.id} onClick={() => handleCreateFromTemplate(t)}
                    className="rounded-xl border border-border bg-adv-card p-4 text-left hover:border-adv-teal/40 transition">
                    <div className="text-sm font-medium text-adv-off-white mb-1">{t.name}</div>
                    <p className="text-xs text-adv-gray line-clamp-2">{t.description}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(agent => (
              <div key={agent.id} className="flex items-center gap-4 rounded-xl border border-border bg-adv-card px-5 py-4 hover:border-adv-teal/40 transition">
                <button onClick={() => navigate(`/agents/${agent.id}`)} className="flex-1 min-w-0 text-left">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-base font-medium text-adv-off-white">{agent.name}</span>
                    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[agent.status] ?? STATUS_COLORS.draft}`}>
                      {agent.status}
                    </span>
                  </div>
                  <p className="text-sm text-adv-gray truncate">{agent.role_description}</p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-adv-gray">
                    <span>{agent.total_conversations} conversations</span>
                    <span>{agent.total_messages_handled} messages</span>
                  </div>
                </button>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => navigate(`/agents/${agent.id}`)} title="Chat" className="rounded-lg border border-border p-2 text-adv-gray hover:text-adv-teal">
                    <MessageCircle className="h-4 w-4" />
                  </button>
                  <button onClick={() => toggleStatus(agent.id, agent.status)} title={agent.status === 'active' ? 'Pause' : 'Activate'}
                    className="rounded-lg border border-border p-2 text-adv-gray hover:text-adv-teal">
                    {agent.status === 'active' ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* AI Builder Modal */}
      {showBuilder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowBuilder(false)}>
          <div className="w-full max-w-lg rounded-xl border border-border bg-adv-dark-2 p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="h-5 w-5 text-adv-teal" />
              <h2 className="text-lg font-bold text-adv-off-white">AI Agent Builder</h2>
            </div>
            <p className="text-sm text-adv-gray mb-4">Describe the kind of agent you need and AI will generate the configuration.</p>
            <textarea value={buildDescription} onChange={e => setBuildDescription(e.target.value)}
              placeholder="e.g., I need a customer support agent for our SaaS product that can answer billing questions, troubleshoot common issues, and escalate complex problems to our engineering team."
              rows={5} autoFocus
              className="w-full rounded-lg border border-border bg-adv-card px-3 py-2 text-sm text-adv-off-white placeholder:text-adv-gray/50 focus:border-adv-teal focus:outline-none resize-none" />

            {templates.length > 0 && (
              <div className="mt-4">
                <p className="text-xs text-adv-gray mb-2">Or start from a template:</p>
                <div className="flex flex-wrap gap-2">
                  {templates.slice(0, 6).map(t => (
                    <button key={t.id} onClick={() => { setShowBuilder(false); handleCreateFromTemplate(t); }}
                      className="rounded-lg border border-border bg-adv-card px-3 py-1.5 text-xs text-adv-gray hover:border-adv-teal/40 hover:text-adv-teal transition">
                      {t.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-6 flex items-center justify-end gap-3">
              <button onClick={() => setShowBuilder(false)} className="rounded-lg border border-border px-4 py-2 text-sm text-adv-gray hover:text-adv-off-white">Cancel</button>
              <button onClick={handleBuild} disabled={!buildDescription.trim() || building}
                className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50">
                {building ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {building ? 'Generating...' : 'Generate Agent'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
