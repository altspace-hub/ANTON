/**
 * AgentKnowledgePage — knowledge attachments + prompt overlays per agent.
 *
 * For each agent, shows the knowledge packs it's grounded in + the
 * prompt overlays it can apply. Operators can attach/detach packs and
 * reorder priorities here.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, BookOpen, Layers, Bot, ShieldCheck } from 'lucide-react';
import { getAuthHeader } from '../../lib/api';

interface KnowledgeAttachment {
  id: string;
  agent_id: string;
  attachment_kind: 'knowledge_pack' | 'risk_atlas_pack' | 'framework_pack' | 'document_set' | 'rag_collection' | 'community_pack';
  source_id: string;
  source_label: string | null;
  attached_at: string;
  priority: number;
  scope: 'always' | 'on_demand' | 'on_keyword' | null;
  scope_keywords: string[];
  is_active: boolean;
}

interface PromptOverlay {
  id: string;
  agent_id: string;
  overlay_name: string;
  overlay_kind: 'jurisdiction' | 'tone' | 'product' | 'persona' | 'escalation' | 'compliance';
  trigger_condition: Record<string, unknown> | null;
  prompt_md: string;
  priority: number;
  is_active: boolean;
}

interface AgentInfo {
  id: string;
  name: string;
  slug: string;
}

const KIND_META: Record<KnowledgeAttachment['attachment_kind'], { classes: string; label: string }> = {
  knowledge_pack:    { classes: 'text-adv-teal',  label: 'Knowledge pack' },
  risk_atlas_pack:   { classes: 'text-adv-red',   label: 'Risk Atlas pack' },
  framework_pack:    { classes: 'text-adv-blue',  label: 'Framework' },
  document_set:      { classes: 'text-adv-gold',  label: 'Document set' },
  rag_collection:    { classes: 'text-adv-green', label: 'RAG collection' },
  community_pack:    { classes: 'text-adv-blue',  label: 'Community pack' },
};

export default function AgentKnowledgePage() {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string>('');
  const [attachments, setAttachments] = useState<KnowledgeAttachment[]>([]);
  const [overlays, setOverlays] = useState<PromptOverlay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/agents', { headers: getAuthHeader() })
      .then(r => r.json())
      .then((data: { agents?: AgentInfo[] }) => {
        const list = data.agents ?? [];
        setAgents(list);
        if (list.length > 0) setSelectedAgent(list[0].id);
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load agents'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedAgent) return;
    Promise.all([
      fetch(`/api/agents/${selectedAgent}/knowledge`, { headers: getAuthHeader() }).then(r => r.json()).catch(() => ({ attachments: [] })),
      fetch(`/api/agents/${selectedAgent}/overlays`, { headers: getAuthHeader() }).then(r => r.json()).catch(() => ({ overlays: [] })),
    ])
      .then(([k, o]: [{ attachments?: KnowledgeAttachment[] }, { overlays?: PromptOverlay[] }]) => {
        setAttachments(k.attachments ?? []);
        setOverlays(o.overlays ?? []);
      })
      .catch(() => { setAttachments([]); setOverlays([]); });
  }, [selectedAgent]);

  return (
    <div className="min-h-screen bg-adv-dark text-adv-off-white">
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <Link to="/agents" className="text-adv-gray hover:text-adv-teal" aria-label="Back"><ChevronLeft size={20} /></Link>
          <BookOpen className="text-adv-teal" size={24} />
          <div>
            <h1 className="text-2xl font-semibold">Knowledge & overlays</h1>
            <p className="text-adv-gray text-sm">What each agent knows + the prompt overlays it can apply per context.</p>
          </div>
        </div>

        {error && <div className="bg-adv-red/10 text-adv-red p-3 rounded mb-3">{error}</div>}

        <div className="flex gap-2 mb-4">
          <select value={selectedAgent} onChange={e => setSelectedAgent(e.target.value)}
            className="bg-adv-card border border-adv-card px-3 py-2 rounded text-sm">
            <option value="">Pick an agent</option>
            {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="text-center text-adv-gray py-12">Loading…</div>
        ) : !selectedAgent ? (
          <div className="bg-adv-card rounded-lg p-8 text-center text-adv-gray">
            <Bot className="mx-auto mb-2 text-adv-gray/40" size={32} />
            Select an agent to view its knowledge attachments + prompt overlays.
          </div>
        ) : (
          <div className="space-y-6">
            <section>
              <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
                <Layers size={16} /> Knowledge attachments ({attachments.filter(a => a.is_active).length} active)
              </h2>
              {attachments.length === 0 ? (
                <div className="bg-adv-card rounded-lg p-4 text-sm text-adv-gray">No knowledge attached.</div>
              ) : (
                <ul className="space-y-2">
                  {attachments.filter(a => a.is_active).sort((x, y) => y.priority - x.priority).map(a => {
                    const km = KIND_META[a.attachment_kind];
                    return (
                      <li key={a.id} className="bg-adv-card rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs font-medium ${km.classes}`}>{km.label}</span>
                          <span className="text-xs text-adv-gray">priority {a.priority}</span>
                          <code className="text-xs text-adv-teal">{a.scope ?? 'always'}</code>
                        </div>
                        <div className="font-medium text-sm">{a.source_label ?? a.source_id}</div>
                        {a.scope === 'on_keyword' && a.scope_keywords.length > 0 && (
                          <div className="text-xs text-adv-gray mt-1">Triggers on: {a.scope_keywords.join(', ')}</div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
                <ShieldCheck size={16} /> Prompt overlays ({overlays.filter(o => o.is_active).length} active)
              </h2>
              {overlays.length === 0 ? (
                <div className="bg-adv-card rounded-lg p-4 text-sm text-adv-gray">No prompt overlays configured.</div>
              ) : (
                <ul className="space-y-2">
                  {overlays.filter(o => o.is_active).sort((x, y) => y.priority - x.priority).map(o => (
                    <li key={o.id} className="bg-adv-card rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <code className="text-xs text-adv-teal">{o.overlay_kind}</code>
                        <span className="text-xs text-adv-gray">priority {o.priority}</span>
                      </div>
                      <div className="font-medium text-sm">{o.overlay_name}</div>
                      {o.trigger_condition && (
                        <pre className="text-xs text-adv-gray mt-1 bg-adv-dark p-2 rounded">
                          Trigger: {JSON.stringify(o.trigger_condition)}
                        </pre>
                      )}
                      <p className="text-xs text-adv-off-white mt-2 line-clamp-3">{o.prompt_md}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
