/**
 * EventTriggersPage.tsx
 * Management UI for event-driven workflow triggers.
 * Sub-navigation under Workflows section.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Zap, Plus, Play, Pause, Trash2, RefreshCw, Eye, GitBranch, MessageSquare, Webhook, Cpu, AlertCircle, CheckCircle, Clock, ChevronRight, X } from 'lucide-react';
import { fetchWithAuth } from '@/lib/api';

type TriggerType = 'webhook' | 'git_push' | 'slack_event' | 'teams_event' | 'mcp_event' | 'internal';
type TriggerStatus = 'active' | 'paused' | 'error';

interface TriggerMetrics {
  events_received: number;
  events_triggered: number;
  events_filtered: number;
  events_failed: number;
  avg_processing_ms: number;
}

interface Trigger {
  id: string;
  name: string;
  description: string | null;
  trigger_type: TriggerType;
  workflow_id: string;
  endpoint_path: string;
  status: TriggerStatus;
  created_at: string;
  updated_at: string;
  metrics: TriggerMetrics;
}

interface WebhookEvent {
  id: string;
  received_at: string;
  status: string;
  workflow_run_id: string | null;
  error_message: string | null;
  processing_ms: number | null;
}

const TRIGGER_TYPE_ICONS: Record<TriggerType, React.ComponentType<{ className?: string }>> = {
  git_push: GitBranch,
  slack_event: MessageSquare,
  teams_event: MessageSquare,
  webhook: Webhook,
  mcp_event: Cpu,
  internal: Zap,
};

const TRIGGER_TYPE_LABELS: Record<TriggerType, string> = {
  git_push: 'Git Push',
  slack_event: 'Slack',
  teams_event: 'Teams',
  webhook: 'Webhook',
  mcp_event: 'MCP Event',
  internal: 'Internal',
};

const STATUS_STYLES: Record<TriggerStatus, string> = {
  active: 'bg-adv-green/15 text-adv-green',
  paused: 'bg-adv-gray/15 text-adv-gray',
  error: 'bg-red-500/15 text-red-400',
};

const EVENT_STATUS_STYLES: Record<string, string> = {
  triggered: 'bg-adv-teal/15 text-adv-teal',
  filtered_out: 'bg-adv-gray/15 text-adv-gray',
  rate_limited: 'bg-adv-gold/15 text-adv-gold',
  deduplicated: 'bg-adv-blue/15 text-adv-blue',
  failed: 'bg-red-500/15 text-red-400',
  received: 'bg-white/10 text-adv-off-white',
  validated: 'bg-adv-blue/15 text-adv-blue',
};

export default function EventTriggersPage() {
  const [triggers, setTriggers] = useState<Trigger[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTrigger, setSelectedTrigger] = useState<Trigger | null>(null);
  const [eventLog, setEventLog] = useState<WebhookEvent[]>([]);
  const [eventLogLoading, setEventLogLoading] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const loadTriggers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/triggers');
      if (res.ok) {
        const data = await res.json() as { triggers: Trigger[] };
        setTriggers(data.triggers);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTriggers();
  }, [loadTriggers]);

  async function loadEventLog(triggerId: string) {
    setEventLogLoading(true);
    try {
      const res = await fetch(`/api/triggers/${triggerId}/events?limit=30`);
      if (res.ok) {
        const data = await res.json() as { events: WebhookEvent[] };
        setEventLog(data.events);
      }
    } finally {
      setEventLogLoading(false);
    }
  }

  async function handleSelectTrigger(trigger: Trigger) {
    setSelectedTrigger(trigger);
    await loadEventLog(trigger.id);
  }

  async function handleToggleStatus(trigger: Trigger) {
    const newStatus = trigger.status === 'active' ? 'paused' : 'active';
    await fetchWithAuth(`/api/triggers/${trigger.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    await loadTriggers();
    if (selectedTrigger?.id === trigger.id) {
      setSelectedTrigger((prev) => prev ? { ...prev, status: newStatus } : null);
    }
  }

  async function handleDelete(triggerId: string) {
    if (!confirm('Delete this trigger? All event history will also be deleted.')) return;
    await fetchWithAuth(`/api/triggers/${triggerId}`, { method: 'DELETE' });
    if (selectedTrigger?.id === triggerId) {
      setSelectedTrigger(null);
      setEventLog([]);
    }
    await loadTriggers();
  }

  async function handleReplay(eventId: string) {
    if (!selectedTrigger) return;
    await fetchWithAuth(`/api/triggers/${selectedTrigger.id}/events/${eventId}/replay`, { method: 'POST' });
    await loadEventLog(selectedTrigger.id);
  }

  // Summary stats
  const activeTriggers = triggers.filter((t) => t.status === 'active').length;
  const totalReceived24h = triggers.reduce((sum, t) => sum + (t.metrics?.events_received ?? 0), 0);
  const totalTriggered24h = triggers.reduce((sum, t) => sum + (t.metrics?.events_triggered ?? 0), 0);

  return (
    <div className="min-h-screen bg-adv-dark p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-adv-off-white flex items-center gap-2">
              <Zap className="w-6 h-6 text-adv-teal" />
              Event Triggers
            </h1>
            <p className="text-adv-gray mt-1">Automatically start workflows when external events occur</p>
          </div>
          <button
            onClick={() => setShowCreateForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-adv-teal text-adv-dark font-medium rounded-lg hover:bg-adv-teal-dark transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create Trigger
          </button>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-3 gap-4 mt-4">
          {[
            { label: 'Active Triggers', value: activeTriggers, icon: CheckCircle, color: 'text-adv-teal' },
            { label: 'Events Received (24h)', value: totalReceived24h, icon: Clock, color: 'text-adv-blue' },
            { label: 'Workflows Triggered (24h)', value: totalTriggered24h, icon: Zap, color: 'text-adv-gold' },
          ].map((stat) => (
            <div key={stat.label} className="bg-adv-card border border-white/10 rounded-lg p-4 flex items-center gap-3">
              <stat.icon className={`w-5 h-5 ${stat.color}`} />
              <div>
                <p className="text-xl font-bold text-adv-off-white">{stat.value}</p>
                <p className="text-xs text-adv-gray">{stat.label}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-4">
        {/* Trigger list */}
        <div className="flex-1 space-y-3">
          {loading && (
            <div className="space-y-3">
              {[0,1,2].map((i) => <div key={i} className="animate-pulse bg-adv-card rounded-xl h-24 border border-white/10" />)}
            </div>
          )}

          {!loading && triggers.length === 0 && (
            <div className="bg-adv-card border border-white/10 rounded-xl p-8 text-center">
              <Zap className="w-10 h-10 text-adv-gray mx-auto mb-3 opacity-50" />
              <p className="text-adv-off-white font-medium mb-1">No triggers yet</p>
              <p className="text-sm text-adv-gray">Create your first event trigger to automate workflow execution</p>
            </div>
          )}

          {!loading && triggers.map((trigger) => {
            const Icon = TRIGGER_TYPE_ICONS[trigger.trigger_type] || Webhook;
            const isSelected = selectedTrigger?.id === trigger.id;

            return (
              <div
                key={trigger.id}
                className={`bg-adv-card border rounded-xl p-4 cursor-pointer transition-all ${
                  isSelected ? 'border-adv-teal/50' : 'border-white/10 hover:border-white/20'
                }`}
                onClick={() => handleSelectTrigger(trigger)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="p-2 bg-white/5 rounded-lg shrink-0">
                      <Icon className="w-4 h-4 text-adv-teal" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-adv-off-white">{trigger.name}</span>
                        <span className="text-xs px-1.5 py-0.5 bg-white/5 text-adv-gray rounded">
                          {TRIGGER_TYPE_LABELS[trigger.trigger_type]}
                        </span>
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${STATUS_STYLES[trigger.status]}`}>
                          {trigger.status}
                        </span>
                      </div>
                      {trigger.description && (
                        <p className="text-sm text-adv-gray mt-0.5 truncate">{trigger.description}</p>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => handleToggleStatus(trigger)}
                      title={trigger.status === 'active' ? 'Pause' : 'Activate'}
                      className="p-1.5 rounded hover:bg-white/10 text-adv-gray hover:text-adv-off-white transition-colors"
                    >
                      {trigger.status === 'active' ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => handleSelectTrigger(trigger)}
                      title="View event log"
                      className="p-1.5 rounded hover:bg-white/10 text-adv-gray hover:text-adv-off-white transition-colors"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(trigger.id)}
                      title="Delete trigger"
                      className="p-1.5 rounded hover:bg-red-500/10 text-adv-gray hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Metrics */}
                <div className="mt-3 flex items-center gap-4 text-xs text-adv-gray">
                  <span className="flex items-center gap-1">
                    <span className="text-adv-off-white font-medium">{trigger.metrics?.events_received ?? 0}</span> received
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="text-adv-teal font-medium">{trigger.metrics?.events_triggered ?? 0}</span> triggered
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="text-adv-gray font-medium">{trigger.metrics?.events_filtered ?? 0}</span> filtered
                  </span>
                  {(trigger.metrics?.events_failed ?? 0) > 0 && (
                    <span className="flex items-center gap-1 text-red-400">
                      <AlertCircle className="w-3 h-3" />
                      <span className="font-medium">{trigger.metrics.events_failed}</span> failed
                    </span>
                  )}
                  <span className="ml-auto flex items-center gap-1">
                    <ChevronRight className="w-3 h-3" />
                    {trigger.endpoint_path}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Event log panel */}
        {selectedTrigger && (
          <div className="w-96 bg-adv-card border border-white/10 rounded-xl flex flex-col max-h-[calc(100vh-200px)]">
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <div>
                <p className="font-medium text-adv-off-white text-sm">{selectedTrigger.name}</p>
                <p className="text-xs text-adv-gray">Event Log</p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => loadEventLog(selectedTrigger.id)}
                  className="p-1.5 rounded hover:bg-white/10 text-adv-gray hover:text-adv-off-white transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
                <button
                  onClick={() => { setSelectedTrigger(null); setEventLog([]); }}
                  className="p-1.5 rounded hover:bg-white/10 text-adv-gray hover:text-adv-off-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {eventLogLoading && (
                <div className="space-y-2">
                  {[0,1,2,3].map((i) => <div key={i} className="animate-pulse bg-white/5 rounded h-12" />)}
                </div>
              )}

              {!eventLogLoading && eventLog.length === 0 && (
                <div className="text-center py-8">
                  <Clock className="w-8 h-8 text-adv-gray mx-auto mb-2 opacity-50" />
                  <p className="text-sm text-adv-gray">No events received yet</p>
                </div>
              )}

              {!eventLogLoading && eventLog.map((event) => (
                <div key={event.id} className="bg-white/3 border border-white/5 rounded-lg p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${EVENT_STATUS_STYLES[event.status] || 'bg-white/5 text-adv-gray'}`}>
                      {event.status}
                    </span>
                    <span className="text-xs text-adv-gray">
                      {new Date(event.received_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  </div>
                  {event.error_message && (
                    <p className="text-xs text-red-400 mt-1 truncate">{event.error_message}</p>
                  )}
                  {event.processing_ms !== null && (
                    <p className="text-xs text-adv-gray/60 mt-0.5">{event.processing_ms}ms</p>
                  )}
                  <div className="flex gap-1 mt-1.5">
                    {event.workflow_run_id && (
                      <span className="text-xs text-adv-teal flex items-center gap-0.5">
                        <Zap className="w-2.5 h-2.5" />
                        Run created
                      </span>
                    )}
                    <button
                      onClick={() => handleReplay(event.id)}
                      className="ml-auto text-xs text-adv-gray hover:text-adv-off-white flex items-center gap-0.5 transition-colors"
                    >
                      <RefreshCw className="w-2.5 h-2.5" />
                      Replay
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Create Trigger Modal (simplified) */}
      {showCreateForm && (
        <CreateTriggerModal
          onClose={() => setShowCreateForm(false)}
          onCreated={() => { setShowCreateForm(false); void loadTriggers(); }}
        />
      )}
    </div>
  );
}

// ── Create Trigger Modal ───────────────────────────────────────────────────────

function CreateTriggerModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [step, setStep] = useState(1);
  const [triggerType, setTriggerType] = useState<TriggerType>('webhook');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [workflowId, setWorkflowId] = useState('');
  const [authMethod, setAuthMethod] = useState<'hmac_sha256' | 'signing_secret' | 'bearer_token' | 'none'>('hmac_sha256');
  const [secret, setSecret] = useState('');
  const [workflows, setWorkflows] = useState<Array<{ id: string; name: string }>>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadWorkflows() {
      const res = await fetch('/api/workflows');
      if (res.ok) {
        const data = await res.json() as { workflows: Array<{ id: string; name: string }> };
        setWorkflows(data.workflows || []);
      }
    }
    void loadWorkflows();
  }, []);

  // Auto-generate a secret for webhook triggers
  useEffect(() => {
    if (triggerType !== 'internal' && !secret) {
      const randomSecret = Array.from(crypto.getRandomValues(new Uint8Array(24)))
        .map((b) => b.toString(16).padStart(2, '0')).join('');
      setSecret(randomSecret);
    }
  }, [triggerType]);

  async function handleSubmit() {
    if (!name || !workflowId) { setError('Name and workflow are required'); return; }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetchWithAuth('/api/triggers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, description, trigger_type: triggerType, workflow_id: workflowId,
          auth_config: {
            method: triggerType === 'internal' ? 'none' : authMethod,
            secret: secret || undefined,
          },
        }),
      });
      if (!res.ok) {
        const data = await res.json() as { error: string };
        setError(data.error);
        return;
      }
      onCreated();
    } finally {
      setSubmitting(false);
    }
  }

  const TRIGGER_TYPES: Array<{ type: TriggerType; label: string; desc: string; icon: React.ComponentType<{ className?: string }> }> = [
    { type: 'webhook', label: 'Generic Webhook', desc: 'Any HTTP webhook from any service', icon: Webhook },
    { type: 'git_push', label: 'Git Push', desc: 'GitHub, GitLab, Bitbucket push events', icon: GitBranch },
    { type: 'slack_event', label: 'Slack Message', desc: 'Trigger on Slack channel messages', icon: MessageSquare },
    { type: 'teams_event', label: 'Teams Message', desc: 'Trigger on Microsoft Teams messages', icon: MessageSquare },
    { type: 'mcp_event', label: 'MCP Event', desc: 'Events from connected MCP servers', icon: Cpu },
    { type: 'internal', label: 'Internal (ANTON)', desc: 'Regulatory Radar, Compliance Rules, File Watcher', icon: Zap },
  ];

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-adv-card border border-white/10 rounded-xl w-full max-w-lg">
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div>
            <p className="font-semibold text-adv-off-white">Create Event Trigger</p>
            <p className="text-xs text-adv-gray">Step {step} of 3</p>
          </div>
          <button onClick={onClose} className="text-adv-gray hover:text-adv-off-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4">
          {step === 1 && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-adv-off-white">Select trigger type</p>
              <div className="grid grid-cols-2 gap-2">
                {TRIGGER_TYPES.map(({ type, label, desc, icon: Icon }) => (
                  <button
                    key={type}
                    onClick={() => { setTriggerType(type); if (type === 'internal') setAuthMethod('none'); }}
                    className={`text-left p-3 rounded-lg border transition-all ${
                      triggerType === type
                        ? 'border-adv-teal bg-adv-teal/10 text-adv-off-white'
                        : 'border-white/10 hover:border-white/20 text-adv-off-white'
                    }`}
                  >
                    <Icon className={`w-4 h-4 mb-1 ${triggerType === type ? 'text-adv-teal' : 'text-adv-gray'}`} />
                    <p className="text-xs font-medium">{label}</p>
                    <p className="text-xs text-adv-gray mt-0.5">{desc}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-adv-off-white">Configuration</p>
              <div>
                <label className="block text-xs text-adv-gray mb-1">Trigger Name *</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. GitHub Code Review Trigger"
                  className="w-full bg-adv-dark border border-white/10 rounded px-2.5 py-2 text-sm text-adv-off-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 focus:border-adv-teal/50"
                />
              </div>
              <div>
                <label className="block text-xs text-adv-gray mb-1">Description</label>
                <input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What does this trigger do?"
                  className="w-full bg-adv-dark border border-white/10 rounded px-2.5 py-2 text-sm text-adv-off-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 focus:border-adv-teal/50"
                />
              </div>
              <div>
                <label className="block text-xs text-adv-gray mb-1">Workflow to trigger *</label>
                <select
                  value={workflowId}
                  onChange={(e) => setWorkflowId(e.target.value)}
                  className="w-full bg-adv-dark border border-white/10 rounded px-2.5 py-2 text-sm text-adv-off-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 focus:border-adv-teal/50"
                >
                  <option value="">Select workflow…</option>
                  {workflows.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-adv-off-white">Authentication</p>
              {triggerType === 'internal' ? (
                <p className="text-sm text-adv-gray">Internal triggers don't require external authentication.</p>
              ) : (
                <>
                  <div>
                    <label className="block text-xs text-adv-gray mb-1">Authentication Method</label>
                    <select
                      value={authMethod}
                      onChange={(e) => setAuthMethod(e.target.value as typeof authMethod)}
                      className="w-full bg-adv-dark border border-white/10 rounded px-2.5 py-2 text-sm text-adv-off-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 focus:border-adv-teal/50"
                    >
                      <option value="hmac_sha256">HMAC SHA-256 (GitHub, GitLab)</option>
                      <option value="signing_secret">Signing Secret (Slack)</option>
                      <option value="bearer_token">Bearer Token (Teams, generic)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-adv-gray mb-1">Secret</label>
                    <input
                      value={secret}
                      onChange={(e) => setSecret(e.target.value)}
                      type="text"
                      className="w-full font-mono bg-adv-dark border border-white/10 rounded px-2.5 py-2 text-sm text-adv-off-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 focus:border-adv-teal/50"
                    />
                    <p className="text-xs text-adv-gray/60 mt-1">Store this secret in your webhook provider settings</p>
                  </div>
                </>
              )}
              {error && <p className="text-sm text-red-400">{error}</p>}
            </div>
          )}
        </div>

        <div className="flex gap-2 p-4 border-t border-white/10">
          {step > 1 && (
            <button onClick={() => setStep(step - 1)} className="px-3 py-2 text-sm text-adv-gray hover:text-adv-off-white transition-colors">
              Back
            </button>
          )}
          <div className="flex-1" />
          {step < 3 ? (
            <button
              onClick={() => setStep(step + 1)}
              className="px-4 py-2 bg-adv-teal text-adv-dark font-medium text-sm rounded-lg hover:bg-adv-teal-dark transition-colors"
            >
              Next
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="px-4 py-2 bg-adv-teal text-adv-dark font-medium text-sm rounded-lg hover:bg-adv-teal-dark transition-colors disabled:opacity-50"
            >
              {submitting ? 'Creating…' : 'Create & Activate'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
