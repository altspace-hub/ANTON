/**
 * EngagementScopeAgreement.tsx
 * Phase 2: Scope Agreement
 * Review, edit, and confirm the extracted scope, deliverables, methodology, and boundaries.
 */

import { useState } from 'react';
import {
  CheckCircle, Edit2, Plus, Trash2, ChevronRight,
  AlertTriangle, FileText, Target, List, Shield
} from 'lucide-react';
import { getAuthHeader } from '@/lib/api';
import type { EngagementData, ScopeItem, Deliverable, Boundary } from '@/pages/EngagementWorkspacePage';

interface Props {
  engagement: EngagementData;
  onUpdate: (updates: Partial<EngagementData>) => void;
  onNext: () => void;
  onReload: () => void;
}

const SCOPE_CATEGORIES = ['Analysis', 'Gap Assessment', 'Validation', 'Product Development', 'Workshop', 'Training', 'Review', 'Implementation', 'Advisory'];

export default function EngagementScopeAgreement({ engagement, onUpdate, onNext, onReload }: Props) {
  const [activeTab, setActiveTab] = useState<'scope' | 'deliverables' | 'boundaries'>('scope');
  const [addingScope, setAddingScope] = useState(false);
  const [newScopeTitle, setNewScopeTitle] = useState('');
  const [newScopeDesc, setNewScopeDesc] = useState('');
  const [newScopeCat, setNewScopeCat] = useState('Analysis');
  const [saving, setSaving] = useState(false);

  const activeScope = engagement.scope_items.filter(si => si.status !== 'removed');
  const confirmed = activeScope.filter(si => si.status === 'confirmed').length;
  const allConfirmed = confirmed === activeScope.length && activeScope.length > 0;

  async function addScopeItem() {
    if (!newScopeTitle.trim()) return;
    setSaving(true);
    try {
      await fetch(`/api/engagements/${engagement.id}/scope-items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ title: newScopeTitle, description: newScopeDesc, category: newScopeCat }),
      });
      setNewScopeTitle(''); setNewScopeDesc(''); setAddingScope(false);
      onReload();
    } finally {
      setSaving(false);
    }
  }

  async function removeScopeItem(itemId: string) {
    await fetch(`/api/engagements/${engagement.id}/scope-items/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ status: 'removed' }),
    });
    onReload();
  }

  async function confirmAll() {
    // Update engagement status to scope_agreement confirmed
    await fetch(`/api/engagements/${engagement.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ scope_confirmed_at: new Date().toISOString() }),
    });
    onNext();
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
      {/* Header */}
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-adv-teal mb-1">Phase 2</p>
        <h2 className="text-xl font-bold text-adv-white">Scope Agreement</h2>
        <p className="mt-1 text-sm text-adv-gray">
          Review what was extracted from the engagement letter. Add, edit, or remove items. This confirmed scope becomes the reference point for everything that follows.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border gap-1">
        {(['scope', 'deliverables', 'boundaries'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-adv-teal text-adv-teal'
                : 'border-transparent text-adv-gray hover:text-adv-off-white'
            }`}
          >
            {tab === 'scope' && <><List className="h-3.5 w-3.5 inline mr-1.5" />Scope ({activeScope.length})</>}
            {tab === 'deliverables' && <><FileText className="h-3.5 w-3.5 inline mr-1.5" />Deliverables ({engagement.deliverables.length})</>}
            {tab === 'boundaries' && <><Shield className="h-3.5 w-3.5 inline mr-1.5" />Boundaries ({engagement.boundaries.length})</>}
          </button>
        ))}
      </div>

      {/* Scope Items Tab */}
      {activeTab === 'scope' && (
        <div className="space-y-3">
          {activeScope.length === 0 && (
            <div className="text-center py-8 text-adv-gray text-sm">
              No scope items yet. Add them manually or upload an engagement letter in Phase 1.
            </div>
          )}
          {activeScope.map((si, idx) => (
            <ScopeItemCard
              key={si.id}
              item={si}
              index={idx + 1}
              engagementId={engagement.id}
              onRemove={() => removeScopeItem(si.id)}
              onReload={onReload}
            />
          ))}

          {/* Add new scope item */}
          {addingScope ? (
            <div className="bg-adv-card border border-adv-teal/40 rounded-xl p-4 space-y-3">
              <input
                autoFocus
                value={newScopeTitle}
                onChange={e => setNewScopeTitle(e.target.value)}
                placeholder="Scope item title"
                className="w-full bg-adv-dark-2 border border-border rounded-lg px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray-med focus:outline-none focus:border-adv-teal"
              />
              <textarea
                value={newScopeDesc}
                onChange={e => setNewScopeDesc(e.target.value)}
                placeholder="Description (optional)"
                rows={2}
                className="w-full bg-adv-dark-2 border border-border rounded-lg px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray-med focus:outline-none focus:border-adv-teal resize-none"
              />
              <div className="flex items-center gap-3">
                <select
                  value={newScopeCat}
                  onChange={e => setNewScopeCat(e.target.value)}
                  className="bg-adv-dark-2 border border-border rounded-lg px-3 py-2 text-sm text-adv-off-white focus:outline-none focus:border-adv-teal"
                >
                  {SCOPE_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
                <div className="flex gap-2 ml-auto">
                  <button onClick={() => setAddingScope(false)} className="px-3 py-1.5 text-sm text-adv-gray hover:text-adv-off-white">Cancel</button>
                  <button
                    onClick={addScopeItem}
                    disabled={!newScopeTitle.trim() || saving}
                    className="px-3 py-1.5 rounded-lg bg-adv-teal text-adv-dark text-sm font-medium hover:bg-adv-teal-dark disabled:opacity-50 transition-colors"
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setAddingScope(true)}
              className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-border hover:border-adv-teal/50 rounded-xl py-3 text-sm text-adv-gray hover:text-adv-teal transition-colors"
            >
              <Plus className="h-4 w-4" />
              Add scope item
            </button>
          )}
        </div>
      )}

      {/* Deliverables Tab */}
      {activeTab === 'deliverables' && (
        <div className="space-y-2">
          {engagement.deliverables.length === 0 && (
            <p className="text-sm text-adv-gray py-8 text-center">No deliverables extracted. They'll be populated when you upload and extract the engagement letter.</p>
          )}
          {engagement.deliverables.map(d => (
            <div key={d.id} className="bg-adv-card border border-border rounded-lg px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-adv-off-white">{d.title}</p>
                  {d.format && <p className="text-xs text-adv-gray-med mt-0.5">{d.format}{d.delivery_date && ` · Due: ${d.delivery_date}`}</p>}
                </div>
                <span className="text-[10px] bg-adv-teal-dim text-adv-teal border border-adv-teal/20 rounded-full px-2 py-0.5">{d.status}</span>
              </div>
              {d.description && <p className="text-xs text-adv-gray mt-1">{d.description}</p>}
            </div>
          ))}
        </div>
      )}

      {/* Boundaries Tab */}
      {activeTab === 'boundaries' && (
        <div className="space-y-2">
          {engagement.boundaries.length === 0 && (
            <p className="text-sm text-adv-gray py-8 text-center">No assumptions or exclusions extracted yet.</p>
          )}
          {engagement.boundaries.map(b => (
            <div key={b.id} className={`border rounded-lg px-4 py-3 ${
              b.boundary_type === 'exclusion' ? 'bg-adv-red/5 border-adv-red/20' :
              b.boundary_type === 'assumption' ? 'bg-adv-gold/5 border-adv-gold/20' :
              'bg-adv-card border-border'
            }`}>
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-[10px] font-medium uppercase rounded-full px-2 py-0.5 ${
                  b.boundary_type === 'exclusion' ? 'bg-adv-red/20 text-adv-red' :
                  b.boundary_type === 'assumption' ? 'bg-adv-gold/20 text-adv-gold' :
                  'bg-adv-blue/20 text-adv-blue'
                }`}>{b.boundary_type}</span>
                {b.source && <span className="text-[10px] text-adv-gray-med">{b.source}</span>}
              </div>
              <p className="text-sm text-adv-off-white">{b.description}</p>
            </div>
          ))}
        </div>
      )}

      {/* Scope confirmation banner */}
      {activeScope.length > 0 && (
        <div className={`rounded-xl p-4 border ${allConfirmed ? 'bg-adv-green/10 border-adv-green/30' : 'bg-adv-gold/5 border-adv-gold/20'}`}>
          <div className="flex items-center gap-2">
            {allConfirmed
              ? <CheckCircle className="h-4 w-4 text-adv-green" />
              : <AlertTriangle className="h-4 w-4 text-adv-gold" />
            }
            <p className="text-sm font-medium text-adv-off-white">
              {allConfirmed
                ? `All ${activeScope.length} scope items confirmed.`
                : `${activeScope.length} scope items — review and confirm before proceeding.`
              }
            </p>
          </div>
        </div>
      )}

      {/* Next */}
      <div className="flex justify-end pt-2">
        <button
          onClick={confirmAll}
          className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-adv-teal text-adv-dark text-sm font-medium hover:bg-adv-teal-dark transition-colors"
        >
          Confirm Scope & Continue
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ── ScopeItemCard ────────────────────────────────────────────────────────────

function ScopeItemCard({
  item, index, engagementId, onRemove, onReload
}: { item: ScopeItem; index: number; engagementId: string; onRemove: () => void; onReload: () => void }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(item.title);
  const [desc, setDesc] = useState(item.description || '');

  async function save() {
    await fetch(`/api/engagements/${engagementId}/scope-items/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ title, description: desc }),
    });
    setEditing(false);
    onReload();
  }

  const categoryColor: Record<string, string> = {
    'Analysis': 'text-adv-blue bg-adv-blue/10', 'Gap Assessment': 'text-adv-teal bg-adv-teal-dim',
    'Review': 'text-adv-gold bg-adv-gold/10', 'Implementation': 'text-adv-green bg-adv-green/10',
    'Advisory': 'text-adv-blue bg-adv-blue/10', 'Training': 'text-adv-gold bg-adv-gold/10',
  };

  return (
    <div className="bg-adv-card border border-border rounded-xl p-4">
      {editing ? (
        <div className="space-y-2">
          <input value={title} onChange={e => setTitle(e.target.value)} className="w-full bg-adv-dark-2 border border-border rounded px-3 py-1.5 text-sm text-adv-off-white focus:outline-none focus:border-adv-teal" />
          <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2} className="w-full bg-adv-dark-2 border border-border rounded px-3 py-1.5 text-sm text-adv-off-white focus:outline-none focus:border-adv-teal resize-none" />
          <div className="flex gap-2 justify-end">
            <button onClick={() => setEditing(false)} className="text-xs text-adv-gray hover:text-adv-off-white">Cancel</button>
            <button onClick={save} className="px-3 py-1 rounded bg-adv-teal text-adv-dark text-xs font-medium hover:bg-adv-teal-dark">Save</button>
          </div>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <span className="mt-0.5 text-xs text-adv-teal font-mono shrink-0">{index}.</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-medium text-adv-off-white">{item.title}</p>
                {item.category && (
                  <span className={`text-[10px] rounded-full px-2 py-0.5 ${categoryColor[item.category] || 'text-adv-gray-med bg-adv-dark'}`}>
                    {item.category}
                  </span>
                )}
                {item.status === 'added' && (
                  <span className="text-[10px] text-adv-green bg-adv-green/10 border border-adv-green/30 rounded-full px-2 py-0.5">Added</span>
                )}
              </div>
              {item.description && <p className="text-xs text-adv-gray mt-1 leading-relaxed">{item.description}</p>}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => setEditing(true)} className="p-1 rounded text-adv-gray-med hover:text-adv-teal hover:bg-adv-teal-dim transition-colors">
              <Edit2 className="h-3.5 w-3.5" />
            </button>
            <button onClick={onRemove} className="p-1 rounded text-adv-gray-med hover:text-adv-red hover:bg-adv-red/10 transition-colors">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
