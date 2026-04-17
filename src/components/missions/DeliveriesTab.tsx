// Mission Deliveries tab — list deliveries + new-delivery form + retry.
// Channels: in_app | webhook | filesystem (others Phase 3.5).

import { useEffect, useState, useCallback } from 'react';
import { Send, RefreshCcw, AlertCircle, CheckCircle2, Clock, Plus } from 'lucide-react';
import { fetchWithAuth, getAuthHeader } from '../../lib/api';

type DeliveryStatus = 'pending' | 'delivering' | 'delivered' | 'failed';
type Channel = 'in_app' | 'webhook' | 'filesystem' | 'email' | 'slack' | 'google_drive' | 'sharepoint';

interface Delivery {
  id: number;
  channel: Channel;
  status: DeliveryStatus;
  delivered_at: string | null;
  error_message: string | null;
  created_at: string;
}

const STATUS_META: Record<DeliveryStatus, { label: string; classes: string; icon: typeof CheckCircle2 }> = {
  pending:    { label: 'Pending',    classes: 'text-adv-gray border-border bg-adv-dark', icon: Clock },
  delivering: { label: 'Delivering', classes: 'text-adv-blue border-adv-blue/40 bg-adv-blue/10', icon: Send },
  delivered:  { label: 'Delivered',  classes: 'text-adv-green border-adv-green/40 bg-adv-green/10', icon: CheckCircle2 },
  failed:     { label: 'Failed',     classes: 'text-adv-red border-adv-red/40 bg-adv-red/10', icon: AlertCircle },
};

export default function DeliveriesTab({ missionId }: { missionId: string }) {
  const [items, setItems] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [retrying, setRetrying] = useState(false);

  // Form state
  const [channel, setChannel] = useState<Channel>('in_app');
  const [body, setBody] = useState('');
  const [subject, setSubject] = useState('');
  const [destinationJson, setDestinationJson] = useState('{}');

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetchWithAuth(`/api/missions/${missionId}/deliveries`, { headers: getAuthHeader() });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setItems(data.deliveries ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [missionId]);

  useEffect(() => { void load(); }, [load]);

  async function submitDelivery(): Promise<void> {
    setSubmitting(true);
    setError(null);
    try {
      let destination: Record<string, unknown> = {};
      if (destinationJson.trim()) {
        try { destination = JSON.parse(destinationJson); }
        catch { throw new Error('Destination must be valid JSON'); }
      }
      const res = await fetchWithAuth(`/api/missions/${missionId}/deliver`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ channel, destination, body: body || undefined, subject: subject || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setShowForm(false); setBody(''); setSubject(''); setDestinationJson('{}'); setChannel('in_app');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  async function retryAll(): Promise<void> {
    setRetrying(true);
    setError(null);
    try {
      const res = await fetchWithAuth(`/api/missions/deliveries/retry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRetrying(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-sm font-semibold text-adv-off-white">Deliveries</h2>
          <p className="text-[11px] text-adv-gray">Mission outputs sent to configured channels.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void retryAll()}
            disabled={retrying}
            className="rounded-lg border border-border px-3 py-1.5 text-xs text-adv-gray hover:text-adv-off-white inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <RefreshCcw className={`h-3.5 w-3.5 ${retrying ? 'animate-spin' : ''}`} />
            Retry pending
          </button>
          <button
            onClick={() => setShowForm(s => !s)}
            className="rounded-lg bg-adv-teal px-3 py-1.5 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark inline-flex items-center gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            New delivery
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded border border-adv-red/30 bg-adv-red/10 px-3 py-2 text-[12px] text-adv-red flex items-center gap-2">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      )}

      {showForm && (
        <div className="rounded-xl border border-border bg-adv-card p-4 space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-adv-teal">New delivery</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="text-[11px] text-adv-gray">
              Channel
              <select
                value={channel}
                onChange={e => setChannel(e.target.value as Channel)}
                className="mt-1 w-full rounded border border-border bg-adv-dark px-2 py-1.5 text-xs text-adv-off-white"
              >
                <option value="in_app">In-app (dashboard)</option>
                <option value="webhook">Webhook</option>
                <option value="filesystem">Filesystem</option>
                <option value="email" disabled>Email (Phase 3.5)</option>
                <option value="slack" disabled>Slack (Phase 3.5)</option>
                <option value="google_drive" disabled>Google Drive (Phase 3.5)</option>
                <option value="sharepoint" disabled>SharePoint (Phase 3.5)</option>
              </select>
            </label>
            <label className="text-[11px] text-adv-gray">
              Subject (optional)
              <input
                type="text"
                value={subject}
                onChange={e => setSubject(e.target.value)}
                maxLength={500}
                className="mt-1 w-full rounded border border-border bg-adv-dark px-2 py-1.5 text-xs text-adv-off-white"
              />
            </label>
          </div>
          <label className="block text-[11px] text-adv-gray">
            Destination (JSON)
            <p className="text-[10px] text-adv-gray/70 mb-1">
              Webhook: <code>{'{ "url": "https://..." }'}</code>. Filesystem: <code>{'{ "path": "report.md" }'}</code>. In-app: <code>{'{}'}</code>.
            </p>
            <textarea
              value={destinationJson}
              onChange={e => setDestinationJson(e.target.value)}
              rows={3}
              className="w-full rounded border border-border bg-adv-dark px-2 py-1.5 text-xs font-mono text-adv-off-white"
            />
          </label>
          <label className="block text-[11px] text-adv-gray">
            Body (optional)
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              maxLength={50000}
              rows={4}
              className="w-full rounded border border-border bg-adv-dark px-2 py-1.5 text-xs text-adv-off-white"
            />
          </label>
          <div className="flex items-center gap-2 justify-end">
            <button
              onClick={() => setShowForm(false)}
              className="rounded-lg border border-border px-3 py-1.5 text-xs text-adv-gray hover:text-adv-off-white"
            >
              Cancel
            </button>
            <button
              onClick={() => void submitDelivery()}
              disabled={submitting}
              className="rounded-lg bg-adv-teal px-3 py-1.5 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" />
              {submitting ? 'Sending…' : 'Send'}
            </button>
          </div>
        </div>
      )}

      {loading && items.length === 0 ? (
        <div className="text-center text-xs text-adv-gray py-8">Loading…</div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <p className="text-xs text-adv-gray">No deliveries yet.</p>
          <p className="text-[11px] text-adv-gray/70 mt-1">Send a mission output to a webhook, file, or in-app dashboard.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-adv-card divide-y divide-border">
          {items.map(d => {
            const meta = STATUS_META[d.status];
            const Icon = meta.icon;
            return (
              <div key={d.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-medium text-adv-off-white">{d.channel}</span>
                      <span className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-medium ${meta.classes}`}>
                        <Icon className="h-3 w-3" />
                        {meta.label}
                      </span>
                    </div>
                    {d.error_message && (
                      <p className="mt-1 text-[11px] text-adv-red">{d.error_message}</p>
                    )}
                  </div>
                  <div className="text-[10px] text-adv-gray text-right shrink-0">
                    <div>Created {new Date(d.created_at).toLocaleString()}</div>
                    {d.delivered_at && <div>Delivered {new Date(d.delivered_at).toLocaleString()}</div>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
