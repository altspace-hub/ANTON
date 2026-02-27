/**
 * ChannelBridgeManager.tsx
 * Manage channel bridges — list, approve, edit, deactivate.
 * Displayed in Settings → Connections → Channel Bridges section.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  MessageSquare,
  Send,
  Phone,
  Mic,
  Globe,
  Check,
  Clock,
  XCircle,
  Copy,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  ExternalLink,
  Trash2,
  Settings2,
  AlertTriangle,
} from 'lucide-react';
import type { ChannelBridge, ChannelType } from './types';
import { ChannelBridgeWizard } from './ChannelBridgeWizard';

// ── Icons by channel type ─────────────────────────────────

const CHANNEL_ICONS: Record<ChannelType, React.ReactNode> = {
  whatsapp:     <MessageSquare className="w-4 h-4" />,
  telegram:     <Send className="w-4 h-4" />,
  sms:          <Phone className="w-4 h-4" />,
  voice:        <Mic className="w-4 h-4" />,
  generic_http: <Globe className="w-4 h-4" />,
};

const CHANNEL_LABELS: Record<ChannelType, string> = {
  whatsapp:     'WhatsApp',
  telegram:     'Telegram',
  sms:          'SMS',
  voice:        'Voice',
  generic_http: 'HTTP',
};

// ── Status badge ──────────────────────────────────────────

function StatusBadge({ status }: { status: ChannelBridge['status'] }) {
  const variants = {
    pending:  'text-adv-gold  bg-adv-gold/10  border-adv-gold/30',
    active:   'text-adv-green bg-adv-green/10 border-adv-green/30',
    disabled: 'text-adv-gray  bg-adv-dark     border-border',
    error:    'text-adv-red   bg-adv-red/10   border-adv-red/30',
  };
  const icons = {
    pending:  <Clock className="w-3 h-3" />,
    active:   <Check className="w-3 h-3" />,
    disabled: <XCircle className="w-3 h-3" />,
    error:    <AlertTriangle className="w-3 h-3" />,
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${variants[status]}`}
    >
      {icons[status]}
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

// ── Single bridge row ─────────────────────────────────────

interface BridgeRowProps {
  bridge: ChannelBridge;
  onRefresh: () => void;
}

function BridgeRow({ bridge, onRefresh }: BridgeRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [endpointCopied, setEndpointCopied] = useState(false);
  const [approving, setApproving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editRpm, setEditRpm] = useState(bridge.config.rate_limit_rpm);
  const [editMaxLen, setEditMaxLen] = useState(bridge.config.max_response_length);
  const [saving, setSaving] = useState(false);

  async function copyEndpoint() {
    await navigator.clipboard.writeText(bridge.endpoint_url);
    setEndpointCopied(true);
    setTimeout(() => setEndpointCopied(false), 2000);
  }

  async function approveBridge() {
    setApproving(true);
    try {
      await fetch(`/api/bridges/${bridge.id}/approve`, { method: 'POST' });
      onRefresh();
    } finally {
      setApproving(false);
    }
  }

  async function deleteBridge() {
    if (!confirm(`Deactivate bridge "${bridge.display_name}"? Partners using it will lose access.`))
      return;
    setDeleting(true);
    try {
      await fetch(`/api/bridges/${bridge.id}`, { method: 'DELETE' });
      onRefresh();
    } finally {
      setDeleting(false);
    }
  }

  async function saveLimits() {
    setSaving(true);
    try {
      await fetch(`/api/bridges/${bridge.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rate_limit_rpm: editRpm, max_response_length: editMaxLen }),
      });
      setEditMode(false);
      onRefresh();
    } finally {
      setSaving(false);
    }
  }

  const channelType = bridge.config.channel_type as ChannelType;

  return (
    <div className="rounded-lg border border-border bg-adv-dark overflow-hidden">
      {/* Row header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="text-adv-teal">{CHANNEL_ICONS[channelType] ?? <Globe className="w-4 h-4" />}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-adv-off-white truncate">
              {bridge.display_name}
            </span>
            <span className="text-[10px] text-adv-gray-med uppercase tracking-wide">
              {CHANNEL_LABELS[channelType] ?? channelType}
            </span>
          </div>
          <div className="text-[11px] text-adv-gray-med mt-0.5 font-mono truncate">
            {bridge.endpoint_url}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <StatusBadge status={bridge.status} />

          {/* Usage chip */}
          <span className="text-[10px] text-adv-gray bg-adv-card rounded-full px-2 py-0.5 border border-border">
            {bridge.config.call_count ?? 0} calls
          </span>

          {/* Copy endpoint */}
          <button
            onClick={copyEndpoint}
            className={`rounded p-1.5 transition-colors ${
              endpointCopied
                ? 'text-adv-green'
                : 'text-adv-gray hover:text-adv-off-white'
            }`}
            title="Copy endpoint URL"
          >
            {endpointCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          </button>

          {/* Expand toggle */}
          <button
            onClick={() => setExpanded((p) => !p)}
            className="rounded p-1.5 text-adv-gray hover:text-adv-off-white transition-colors"
            title={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-border px-4 py-3 space-y-3">
          {/* Pending approval banner */}
          {bridge.status === 'pending' && (
            <div className="flex items-center justify-between rounded-lg border border-adv-gold/30 bg-adv-gold/10 px-3 py-2">
              <div className="flex items-center gap-2 text-xs text-adv-gold">
                <Clock className="w-3.5 h-3.5" />
                Awaiting approval before partners can use this bridge.
              </div>
              <button
                onClick={approveBridge}
                disabled={approving}
                className="rounded bg-adv-teal px-3 py-1 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors disabled:opacity-40"
              >
                {approving ? 'Approving…' : 'Approve'}
              </button>
            </div>
          )}

          {/* Config grid */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
            <div>
              <span className="text-adv-gray-med">Allowed modules: </span>
              <span className="text-adv-off-white">
                {(bridge.config.allowed_modules ?? []).includes('*')
                  ? 'All modules'
                  : (bridge.config.allowed_modules ?? []).join(', ')}
              </span>
            </div>
            <div>
              <span className="text-adv-gray-med">Default module: </span>
              <span className="text-adv-off-white">{bridge.config.default_module}</span>
            </div>
            <div>
              <span className="text-adv-gray-med">Rate limit: </span>
              <span className="text-adv-off-white">{bridge.config.rate_limit_rpm} rpm</span>
            </div>
            <div>
              <span className="text-adv-gray-med">Max response: </span>
              <span className="text-adv-off-white">{bridge.config.max_response_length} chars</span>
            </div>
            <div>
              <span className="text-adv-gray-med">Language hint: </span>
              <span className="text-adv-off-white">{bridge.config.language_hint}</span>
            </div>
            <div>
              <span className="text-adv-gray-med">Last called: </span>
              <span className="text-adv-off-white">
                {bridge.config.last_called_at
                  ? new Date(bridge.config.last_called_at).toLocaleString()
                  : 'Never'}
              </span>
            </div>
          </div>

          {/* Endpoint row */}
          <div>
            <div className="text-[10px] text-adv-gray-med mb-1">Endpoint URL</div>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded border border-border bg-adv-card px-2 py-1.5 text-xs text-adv-teal font-mono break-all">
                {bridge.endpoint_url}
              </code>
              <button
                onClick={() => window.open(bridge.endpoint_url, '_blank')}
                className="flex-shrink-0 text-adv-gray hover:text-adv-off-white transition-colors"
                title="Open in browser"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Edit limits */}
          {editMode ? (
            <div className="space-y-2 rounded-lg border border-adv-teal/30 bg-adv-teal-soft p-3">
              <div className="text-xs font-medium text-adv-off-white mb-2">Edit limits</div>
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <label className="text-[10px] text-adv-gray-med">Rate limit (rpm)</label>
                  <input
                    type="number"
                    min={1}
                    max={300}
                    value={editRpm}
                    onChange={(e) => setEditRpm(Number(e.target.value))}
                    className="mt-1 w-full rounded border border-border bg-adv-dark px-2 py-1 text-xs text-adv-off-white focus:border-adv-teal focus:outline-none"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-[10px] text-adv-gray-med">Max response (chars)</label>
                  <input
                    type="number"
                    min={100}
                    max={3000}
                    value={editMaxLen}
                    onChange={(e) => setEditMaxLen(Number(e.target.value))}
                    className="mt-1 w-full rounded border border-border bg-adv-dark px-2 py-1 text-xs text-adv-off-white focus:border-adv-teal focus:outline-none"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={saveLimits}
                  disabled={saving}
                  className="rounded bg-adv-teal px-3 py-1 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-40 transition-colors"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button
                  onClick={() => setEditMode(false)}
                  className="rounded border border-border px-3 py-1 text-xs text-adv-gray hover:text-adv-off-white transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setEditMode(true)}
                className="flex items-center gap-1.5 rounded border border-border px-2 py-1.5 text-xs text-adv-gray hover:text-adv-off-white transition-colors"
              >
                <Settings2 className="w-3 h-3" />
                Edit limits
              </button>

              {bridge.status !== 'disabled' && (
                <button
                  onClick={deleteBridge}
                  disabled={deleting}
                  className="flex items-center gap-1.5 rounded border border-adv-red/30 px-2 py-1.5 text-xs text-adv-red hover:bg-adv-red/10 transition-colors disabled:opacity-40"
                >
                  <Trash2 className="w-3 h-3" />
                  {deleting ? 'Deactivating…' : 'Deactivate'}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────

export function ChannelBridgeManager() {
  const [bridges, setBridges] = useState<ChannelBridge[]>([]);
  const [loading, setLoading] = useState(true);
  const [showWizard, setShowWizard] = useState(false);
  const [error, setError] = useState('');

  const fetchBridges = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/bridges');
      if (!res.ok) throw new Error('Failed to load bridges');
      const data = await res.json() as ChannelBridge[];
      setBridges(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchBridges();
  }, [fetchBridges]);

  function handleCreated(bridge: ChannelBridge) {
    setShowWizard(false);
    void fetchBridges();
    void bridge; // bridge is already in DB; fetchBridges will reload
  }

  if (showWizard) {
    return (
      <ChannelBridgeWizard
        onCreated={handleCreated}
        onCancel={() => setShowWizard(false)}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-adv-off-white">Channel Bridges</h3>
          <p className="text-xs text-adv-gray-med mt-0.5">
            Secure HTTP endpoints for WhatsApp bots, SMS gateways, and other messaging channels.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchBridges}
            disabled={loading}
            className="rounded border border-border p-1.5 text-adv-gray hover:text-adv-off-white transition-colors disabled:opacity-40"
            title="Refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setShowWizard(true)}
            className="flex items-center gap-1.5 rounded-lg bg-adv-teal px-3 py-1.5 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            New Bridge
          </button>
        </div>
      </div>

      {/* How it works */}
      <div className="rounded-lg border border-border bg-adv-teal-soft px-4 py-3 text-xs text-adv-gray space-y-1">
        <div className="font-medium text-adv-off-white">How channel bridges work</div>
        <div>
          Each bridge generates a unique HTTP endpoint and bearer token. Share these with your
          NGO partners or bot developers — they call the endpoint, ANTON calls Claude, and the
          plain-text response goes back to the user's WhatsApp, SMS, or Telegram.
        </div>
        <div className="pt-1">
          <a
            href="https://github.com/altspace-hub/ANTON/tree/main/reference-bots/whatsapp-bot"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-adv-teal hover:text-adv-teal-dark transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
            Download reference WhatsApp bot
          </a>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-adv-red/30 bg-adv-red/10 px-3 py-2 text-xs text-adv-red">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-6">
          <RefreshCw className="w-5 h-5 animate-spin text-adv-gray" />
        </div>
      )}

      {/* Bridge list */}
      {!loading && bridges.length === 0 && (
        <div className="rounded-lg border border-border bg-adv-dark px-4 py-8 text-center">
          <Globe className="w-8 h-8 text-adv-gray mx-auto mb-2" />
          <p className="text-sm text-adv-off-white mb-1">No channel bridges yet</p>
          <p className="text-xs text-adv-gray-med mb-4">
            Create your first bridge to connect a WhatsApp bot or SMS gateway to ANTON.
          </p>
          <button
            onClick={() => setShowWizard(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-adv-teal px-4 py-2 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Create First Bridge
          </button>
        </div>
      )}

      {!loading && bridges.length > 0 && (
        <div className="space-y-2">
          {bridges.map((bridge) => (
            <BridgeRow key={bridge.id} bridge={bridge} onRefresh={fetchBridges} />
          ))}
        </div>
      )}
    </div>
  );
}
