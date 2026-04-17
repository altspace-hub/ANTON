// MaintenanceTab — review cycles + escalation triggers.
// Per spec §2.1 maintenance cycle table — Full review (annual), Threat
// catalogue update (semi-annual), Control effectiveness check (quarterly),
// Residual rescore (quarterly), Appetite review (annual), Regulatory
// alignment check (on new regulation).

import { useEffect, useState, useCallback } from 'react';
import { Plus, AlertCircle, RefreshCcw, CalendarClock, Bell, Loader2 } from 'lucide-react';
import { fetchWithAuth, getAuthHeader } from '../../lib/api';

interface Props { atlasId: string }

interface ReviewCycleRow {
  id: string;
  activity: string;
  frequency: string;
  next_due_at: string | null;
  last_run_at: string | null;
}

interface TriggerRow {
  id: string;
  trigger_event: string;
  required_action: string;
  timeline: string | null;
  source: 'user' | 'pack' | 'regulatory';
}

const ACTIVITY_LABEL: Record<string, string> = {
  full_review:       'Full Atlas review',
  threat_update:     'Threat catalogue update',
  control_test:      'Control effectiveness check',
  residual_rescore:  'Residual re-scoring',
  appetite:          'Appetite review',
  regulatory_check:  'Regulatory alignment',
};

export default function MaintenanceTab({ atlasId }: Props) {
  const [cycles, setCycles] = useState<ReviewCycleRow[]>([]);
  const [triggers, setTriggers] = useState<TriggerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCycle, setShowCycle] = useState(false);
  const [showTrigger, setShowTrigger] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [cRes, tRes] = await Promise.all([
        fetchWithAuth(`/api/atlas/${atlasId}/review-cycles`, { headers: getAuthHeader() }),
        fetchWithAuth(`/api/atlas/${atlasId}/triggers`, { headers: getAuthHeader() }),
      ]);
      const cd = await cRes.json();
      const td = await tRes.json();
      if (!cRes.ok) throw new Error(cd?.error || `HTTP ${cRes.status}`);
      if (!tRes.ok) throw new Error(td?.error || `HTTP ${tRes.status}`);
      setCycles(cd.cycles ?? []);
      setTriggers(td.triggers ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setLoading(false); }
  }, [atlasId]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-sm font-semibold text-adv-off-white">Maintenance</h2>
          <p className="text-[11px] text-adv-gray">Review cycles and escalation triggers — the Atlas is a living workspace, not an annual document.</p>
        </div>
        <button onClick={() => void load()} disabled={loading}
          className="rounded border border-border px-2 py-1 text-[11px] text-adv-gray hover:text-adv-off-white inline-flex items-center gap-1.5 disabled:opacity-50">
          <RefreshCcw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded border border-adv-red/30 bg-adv-red/10 px-3 py-2 text-[12px] text-adv-red flex items-center gap-2">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      )}

      {/* Review cycles */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-adv-off-white inline-flex items-center gap-1">
            <CalendarClock className="h-3.5 w-3.5 text-adv-teal" />
            Review cycles
          </h3>
          <button onClick={() => setShowCycle(s => !s)}
            className="rounded border border-border px-2 py-1 text-[11px] text-adv-gray hover:text-adv-off-white inline-flex items-center gap-1">
            <Plus className="h-3 w-3" /> New cycle
          </button>
        </div>
        {showCycle && (
          <NewCycleForm atlasId={atlasId} onSaved={() => { setShowCycle(false); void load(); }} onCancel={() => setShowCycle(false)} />
        )}
        {cycles.length === 0 ? (
          <div className="rounded border border-dashed border-border p-6 text-center text-[11px] text-adv-gray">
            No review cycles defined. Spec §2.1 recommends: full review (annual), threat update (semi-annual), control test (quarterly).
          </div>
        ) : (
          <div className="rounded border border-border bg-adv-card divide-y divide-border">
            {cycles.map(c => (
              <div key={c.id} className="px-3 py-2 text-[11px] flex items-center gap-3 flex-wrap">
                <span className="font-medium text-adv-off-white">{ACTIVITY_LABEL[c.activity] ?? c.activity}</span>
                <span className="text-adv-gray">· {c.frequency}</span>
                {c.next_due_at && <span className="text-adv-gold">· next due {new Date(c.next_due_at).toLocaleDateString()}</span>}
                {c.last_run_at && <span className="text-adv-gray">· last {new Date(c.last_run_at).toLocaleDateString()}</span>}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Escalation triggers */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-adv-off-white inline-flex items-center gap-1">
            <Bell className="h-3.5 w-3.5 text-adv-gold" />
            Escalation triggers
          </h3>
          <button onClick={() => setShowTrigger(s => !s)}
            className="rounded border border-border px-2 py-1 text-[11px] text-adv-gray hover:text-adv-off-white inline-flex items-center gap-1">
            <Plus className="h-3 w-3" /> New trigger
          </button>
        </div>
        {showTrigger && (
          <NewTriggerForm atlasId={atlasId} onSaved={() => { setShowTrigger(false); void load(); }} onCancel={() => setShowTrigger(false)} />
        )}
        {triggers.length === 0 ? (
          <div className="rounded border border-dashed border-border p-6 text-center text-[11px] text-adv-gray">
            No escalation triggers. Industry packs ship defaults; you can add bespoke ones for your business.
          </div>
        ) : (
          <div className="rounded border border-border bg-adv-card divide-y divide-border">
            {triggers.map(t => (
              <div key={t.id} className="px-3 py-2 text-[11px]">
                <div className="font-medium text-adv-off-white">{t.trigger_event}</div>
                <div className="text-adv-gray mt-0.5">→ {t.required_action}{t.timeline ? ` · ${t.timeline}` : ''} <span className="text-[10px]">[{t.source}]</span></div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function NewCycleForm({ atlasId, onSaved, onCancel }: { atlasId: string; onSaved: () => void; onCancel: () => void }) {
  const [activity, setActivity] = useState<string>('full_review');
  const [frequency, setFrequency] = useState<string>('annual');
  const [nextDue, setNextDue] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSubmitting(true); setError(null);
    try {
      const res = await fetchWithAuth(`/api/atlas/${atlasId}/review-cycles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({
          activity, frequency,
          next_due_at: nextDue ? new Date(nextDue).toISOString() : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded border border-adv-teal/30 bg-adv-teal/5 p-3 space-y-2">
      {error && <div className="text-[11px] text-adv-red flex items-center gap-1"><AlertCircle className="h-3 w-3" />{error}</div>}
      <div className="grid grid-cols-3 gap-2">
        <label className="text-[10px] text-adv-gray">
          Activity
          <select value={activity} onChange={e => setActivity(e.target.value)}
            className="mt-1 w-full rounded border border-border bg-adv-dark px-2 py-1 text-[11px] text-adv-off-white">
            {Object.entries(ACTIVITY_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className="text-[10px] text-adv-gray">
          Frequency
          <select value={frequency} onChange={e => setFrequency(e.target.value)}
            className="mt-1 w-full rounded border border-border bg-adv-dark px-2 py-1 text-[11px] text-adv-off-white">
            <option value="annual">Annual</option>
            <option value="semi-annual">Semi-annual</option>
            <option value="quarterly">Quarterly</option>
            <option value="monthly">Monthly</option>
            <option value="on_change">On change</option>
            <option value="on_new_regulation">On new regulation</option>
          </select>
        </label>
        <label className="text-[10px] text-adv-gray">
          Next due
          <input type="date" value={nextDue} onChange={e => setNextDue(e.target.value)}
            className="mt-1 w-full rounded border border-border bg-adv-dark px-2 py-1 text-[11px] text-adv-off-white" />
        </label>
      </div>
      <div className="flex items-center justify-end gap-2">
        <button onClick={onCancel} className="rounded border border-border px-2 py-1 text-[11px] text-adv-gray hover:text-adv-off-white">Cancel</button>
        <button onClick={() => void submit()} disabled={submitting}
          className="rounded bg-adv-teal px-2 py-1 text-[11px] font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50 inline-flex items-center gap-1">
          {submitting ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
          Add
        </button>
      </div>
    </div>
  );
}

function NewTriggerForm({ atlasId, onSaved, onCancel }: { atlasId: string; onSaved: () => void; onCancel: () => void }) {
  const [event, setEvent] = useState('');
  const [action, setAction] = useState('');
  const [timeline, setTimeline] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSubmitting(true); setError(null);
    try {
      const res = await fetchWithAuth(`/api/atlas/${atlasId}/triggers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({
          trigger_event: event.trim(),
          required_action: action.trim(),
          timeline: timeline.trim() || undefined,
          source: 'user',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded border border-adv-gold/30 bg-adv-gold/5 p-3 space-y-2">
      {error && <div className="text-[11px] text-adv-red flex items-center gap-1"><AlertCircle className="h-3 w-3" />{error}</div>}
      <input type="text" value={event} onChange={e => setEvent(e.target.value)} maxLength={500}
        placeholder="Event (e.g. Any path reaches residual 5)"
        className="w-full rounded border border-border bg-adv-dark px-2 py-1.5 text-[11px] text-adv-off-white" />
      <input type="text" value={action} onChange={e => setAction(e.target.value)} maxLength={1000}
        placeholder="Required action"
        className="w-full rounded border border-border bg-adv-dark px-2 py-1.5 text-[11px] text-adv-off-white" />
      <input type="text" value={timeline} onChange={e => setTimeline(e.target.value)} maxLength={200}
        placeholder="Timeline (e.g. within 5 business days)"
        className="w-full rounded border border-border bg-adv-dark px-2 py-1.5 text-[11px] text-adv-off-white" />
      <div className="flex items-center justify-end gap-2">
        <button onClick={onCancel} className="rounded border border-border px-2 py-1 text-[11px] text-adv-gray hover:text-adv-off-white">Cancel</button>
        <button onClick={() => void submit()} disabled={submitting || !event.trim() || !action.trim()}
          className="rounded bg-adv-gold px-2 py-1 text-[11px] font-medium text-adv-dark hover:bg-adv-gold/80 disabled:opacity-50 inline-flex items-center gap-1">
          {submitting ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
          Add trigger
        </button>
      </div>
    </div>
  );
}
