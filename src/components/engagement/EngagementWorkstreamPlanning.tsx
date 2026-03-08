/**
 * EngagementWorkstreamPlanning.tsx
 * Phase 5: Workstream Planning
 * Define and configure workstreams before execution — titles, descriptions,
 * expert focus, timelines, and execution order.
 */

import { useState } from 'react';
import {
  GitBranch, Plus, Trash2, ChevronRight, ChevronDown, ChevronUp,
  Loader2, CheckCircle, Calendar, Brain, Edit3, GripVertical, AlertCircle
} from 'lucide-react';
import { fetchWithAuth } from '@/lib/api';
import type { EngagementData, Workstream } from '@/pages/EngagementWorkspacePage';

interface Props {
  engagement: EngagementData;
  onUpdate: (updates: Partial<EngagementData>) => void;
  onNext: () => void;
  onReload: () => void;
}

type ThinkingLevel = 'quick' | 'think' | 'think_hard' | 'investigate';

const THINKING_LABELS: Record<string, string> = {
  quick: 'Quick', think: 'Think', think_hard: 'Think Hard', investigate: 'Investigate',
};

const STATUS_COLORS: Record<string, string> = {
  pending:   'text-adv-gray bg-adv-dark border-border',
  blocked:   'text-adv-red bg-adv-red/10 border-adv-red/20',
  ready:     'text-adv-teal bg-adv-teal-dim border-adv-teal/20',
  executing: 'text-adv-gold bg-adv-gold/10 border-adv-gold/20',
  review:    'text-adv-blue bg-adv-blue/10 border-adv-blue/20',
  completed: 'text-adv-green bg-adv-green/10 border-adv-green/20',
};

interface NewWsForm {
  title: string;
  description: string;
  thinking_level: ThinkingLevel;
  timeline_start: string;
  timeline_end: string;
}

const DEFAULT_FORM: NewWsForm = {
  title: '',
  description: '',
  thinking_level: 'investigate',
  timeline_start: '',
  timeline_end: '',
};

export default function EngagementWorkstreamPlanning({ engagement, onUpdate, onNext, onReload }: Props) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState<NewWsForm>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<NewWsForm>>({});

  const workstreams = engagement.workstreams;

  async function addWorkstream() {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      await fetchWithAuth(`/api/engagements/${engagement.id}/workstreams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim() || null,
          thinking_level: form.thinking_level,
          timeline_start: form.timeline_start || null,
          timeline_end: form.timeline_end || null,
          sort_order: workstreams.length,
        }),
      });
      setForm(DEFAULT_FORM);
      setShowAddForm(false);
      onReload();
    } finally {
      setSaving(false);
    }
  }

  async function deleteWorkstream(wsId: string) {
    await fetchWithAuth(`/api/engagements/${engagement.id}/workstreams/${wsId}`, {
      method: 'DELETE',
    });
    onReload();
  }

  async function saveEdit(wsId: string) {
    setSaving(true);
    try {
      await fetchWithAuth(`/api/engagements/${engagement.id}/workstreams/${wsId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      setEditingId(null);
      onReload();
    } finally {
      setSaving(false);
    }
  }

  async function confirmPlanning() {
    setConfirming(true);
    try {
      await fetchWithAuth(`/api/engagements/${engagement.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workstream_plan_confirmed: true }),
      });
      onNext();
    } finally {
      setConfirming(false);
    }
  }

  const allReady = workstreams.length > 0;

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
      {/* Header */}
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-adv-teal mb-1">Phase 5</p>
        <h2 className="text-xl font-bold text-adv-white">Workstream Planning</h2>
        <p className="mt-1 text-sm text-adv-gray">
          Define the workstreams that make up this engagement. Each workstream can be executed independently with its own expert focus and thinking depth.
        </p>
      </div>

      {/* Scope-derived suggestion */}
      {engagement.scope_items.length > 0 && workstreams.length === 0 && (
        <div className="bg-adv-teal-soft border border-adv-teal/20 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="h-4 w-4 text-adv-teal shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-adv-teal">No workstreams defined yet</p>
            <p className="text-xs text-adv-gray mt-0.5">
              You have {engagement.scope_items.length} scope items. Consider grouping related items into workstreams below, or add a single "Full Engagement" workstream to execute everything together.
            </p>
          </div>
        </div>
      )}

      {/* Workstream list */}
      <div className="space-y-3">
        {workstreams.map(ws => (
          <WorkstreamCard
            key={ws.id}
            ws={ws}
            engagementId={engagement.id}
            isEditing={editingId === ws.id}
            editForm={editForm}
            saving={saving}
            onEdit={() => {
              setEditingId(ws.id);
              setEditForm({
                title: ws.title,
                description: ws.description || '',
                thinking_level: (ws.thinking_level as ThinkingLevel) || 'investigate',
                timeline_start: ws.timeline_start || '',
                timeline_end: ws.timeline_end || '',
              });
            }}
            onEditChange={setEditForm}
            onSave={() => saveEdit(ws.id)}
            onCancel={() => setEditingId(null)}
            onDelete={() => deleteWorkstream(ws.id)}
          />
        ))}

        {workstreams.length === 0 && (
          <div className="text-center py-8 text-sm text-adv-gray border border-dashed border-border rounded-xl">
            No workstreams yet — add one below
          </div>
        )}
      </div>

      {/* Add workstream */}
      {!showAddForm ? (
        <button
          onClick={() => setShowAddForm(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 border-dashed border-border text-sm text-adv-gray hover:border-adv-teal/50 hover:text-adv-teal transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Workstream
        </button>
      ) : (
        <div className="bg-adv-card border border-adv-teal/30 rounded-xl p-5 space-y-4">
          <h4 className="text-sm font-semibold text-adv-off-white flex items-center gap-2">
            <Plus className="h-4 w-4 text-adv-teal" />
            New Workstream
          </h4>

          <div className="space-y-3">
            <input
              autoFocus
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Workstream title (e.g. TM Programme Review)"
              className="w-full bg-adv-dark-2 border border-border rounded-lg px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray-med focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 focus:border-adv-teal"
            />
            <textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Description / scope of this workstream (optional)"
              rows={2}
              className="w-full bg-adv-dark-2 border border-border rounded-lg px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray-med focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 focus:border-adv-teal resize-none"
            />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-adv-gray mb-1 block">Thinking Level</label>
                <select
                  value={form.thinking_level}
                  onChange={e => setForm(f => ({ ...f, thinking_level: e.target.value as ThinkingLevel }))}
                  className="w-full bg-adv-dark-2 border border-border rounded-lg px-3 py-2 text-sm text-adv-off-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 focus:border-adv-teal"
                >
                  {Object.entries(THINKING_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-adv-gray mb-1 block">Start</label>
                  <input
                    type="date"
                    value={form.timeline_start}
                    onChange={e => setForm(f => ({ ...f, timeline_start: e.target.value }))}
                    className="w-full bg-adv-dark-2 border border-border rounded-lg px-2 py-2 text-sm text-adv-off-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 focus:border-adv-teal"
                  />
                </div>
                <div>
                  <label className="text-xs text-adv-gray mb-1 block">End</label>
                  <input
                    type="date"
                    value={form.timeline_end}
                    onChange={e => setForm(f => ({ ...f, timeline_end: e.target.value }))}
                    className="w-full bg-adv-dark-2 border border-border rounded-lg px-2 py-2 text-sm text-adv-off-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 focus:border-adv-teal"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            <button onClick={() => { setShowAddForm(false); setForm(DEFAULT_FORM); }} className="text-xs text-adv-gray hover:text-adv-off-white px-3 py-1.5">Cancel</button>
            <button
              onClick={addWorkstream}
              disabled={!form.title.trim() || saving}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-adv-teal text-adv-dark text-xs font-medium hover:bg-adv-teal-dark disabled:opacity-50 transition-colors"
            >
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
              Add
            </button>
          </div>
        </div>
      )}

      {/* Planning summary */}
      {workstreams.length > 0 && (
        <div className="bg-adv-card border border-border rounded-xl px-5 py-4">
          <div className="flex items-center gap-3 flex-wrap">
            <GitBranch className="h-4 w-4 text-adv-teal shrink-0" />
            <span className="text-sm text-adv-off-white">{workstreams.length} workstream{workstreams.length !== 1 ? 's' : ''} defined</span>
            <span className="text-adv-gray">·</span>
            <span className="text-xs text-adv-gray">
              {workstreams.filter(ws => ws.timeline_start).length}/{workstreams.length} with dates
            </span>
            <span className="text-adv-gray">·</span>
            <span className="text-xs text-adv-gray">
              Deepest: {workstreams.some(ws => ws.thinking_level === 'investigate') ? 'Investigate' : workstreams.some(ws => ws.thinking_level === 'think_hard') ? 'Think Hard' : 'Think'}
            </span>
          </div>
        </div>
      )}

      {/* Continue */}
      <div className="flex justify-end pt-2">
        <button
          onClick={confirmPlanning}
          disabled={!allReady || confirming}
          className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-adv-teal text-adv-dark text-sm font-medium hover:bg-adv-teal-dark transition-colors disabled:opacity-50"
          title={!allReady ? 'Add at least one workstream to continue' : ''}
        >
          {confirming ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
          {confirming ? 'Confirming…' : 'Confirm Plan & Continue to Execution'}
        </button>
      </div>
    </div>
  );
}

// ── WorkstreamCard ────────────────────────────────────────────────────────────

function WorkstreamCard({
  ws, engagementId, isEditing, editForm, saving,
  onEdit, onEditChange, onSave, onCancel, onDelete
}: {
  ws: Workstream;
  engagementId: string;
  isEditing: boolean;
  editForm: Partial<NewWsForm>;
  saving: boolean;
  onEdit: () => void;
  onEditChange: (v: Partial<NewWsForm>) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const sc = STATUS_COLORS[ws.execution_status] || STATUS_COLORS.pending;

  if (isEditing) {
    return (
      <div className="bg-adv-card border border-adv-teal/30 rounded-xl p-4 space-y-3">
        <input
          autoFocus
          value={editForm.title ?? ''}
          onChange={e => onEditChange({ ...editForm, title: e.target.value })}
          className="w-full bg-adv-dark-2 border border-border rounded-lg px-3 py-2 text-sm text-adv-off-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 focus:border-adv-teal"
        />
        <textarea
          value={editForm.description ?? ''}
          onChange={e => onEditChange({ ...editForm, description: e.target.value })}
          rows={2}
          className="w-full bg-adv-dark-2 border border-border rounded-lg px-3 py-2 text-sm text-adv-off-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 focus:border-adv-teal resize-none"
        />
        <div className="grid grid-cols-3 gap-2">
          <select
            value={editForm.thinking_level ?? 'investigate'}
            onChange={e => onEditChange({ ...editForm, thinking_level: e.target.value as 'quick' | 'think' | 'think_hard' | 'investigate' })}
            className="bg-adv-dark-2 border border-border rounded-lg px-2 py-1.5 text-sm text-adv-off-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 focus:border-adv-teal"
          >
            {Object.entries(THINKING_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <input type="date" value={editForm.timeline_start ?? ''} onChange={e => onEditChange({ ...editForm, timeline_start: e.target.value })}
            className="bg-adv-dark-2 border border-border rounded-lg px-2 py-1.5 text-sm text-adv-off-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 focus:border-adv-teal" />
          <input type="date" value={editForm.timeline_end ?? ''} onChange={e => onEditChange({ ...editForm, timeline_end: e.target.value })}
            className="bg-adv-dark-2 border border-border rounded-lg px-2 py-1.5 text-sm text-adv-off-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 focus:border-adv-teal" />
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="text-xs text-adv-gray hover:text-adv-off-white px-3 py-1.5">Cancel</button>
          <button
            onClick={onSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-adv-teal text-adv-dark text-xs font-medium hover:bg-adv-teal-dark disabled:opacity-50 transition-colors"
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
            Save
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-adv-card border border-border rounded-xl px-4 py-3 flex items-center gap-3">
      <GripVertical className="h-4 w-4 text-adv-gray shrink-0 cursor-grab opacity-40" />
      <GitBranch className="h-4 w-4 text-adv-teal shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-adv-off-white">{ws.title}</p>
        {ws.description && <p className="text-xs text-adv-gray mt-0.5 truncate">{ws.description}</p>}
        <div className="flex items-center gap-3 mt-1">
          {ws.thinking_level && (
            <span className="text-xs text-adv-gray flex items-center gap-0.5">
              <Brain className="h-3 w-3" /> {THINKING_LABELS[ws.thinking_level] || ws.thinking_level}
            </span>
          )}
          {(ws.timeline_start || ws.timeline_end) && (
            <span className="text-xs text-adv-gray flex items-center gap-0.5">
              <Calendar className="h-3 w-3" />
              {ws.timeline_start ? ws.timeline_start.slice(0, 10) : '—'}
              {ws.timeline_end && ` → ${ws.timeline_end.slice(0, 10)}`}
            </span>
          )}
        </div>
      </div>
      <span className={`text-xs border rounded-full px-2 py-0.5 shrink-0 ${sc}`}>
        {ws.execution_status}
      </span>
      <button onClick={onEdit} className="text-adv-gray hover:text-adv-teal transition-colors p-1">
        <Edit3 className="h-3.5 w-3.5" />
      </button>
      <button onClick={onDelete} className="text-adv-gray hover:text-adv-red transition-colors p-1">
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
