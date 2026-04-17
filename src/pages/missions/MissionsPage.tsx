/**
 * MissionsPage — dashboard for ANTON Missions.
 *
 * Lists missions grouped by status with a "Create Mission" CTA. Polls every
 * 10s while there are active missions.
 */

import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Target, Plus, RefreshCcw, AlertCircle } from 'lucide-react';
import { fetchWithAuth, getAuthHeader } from '../../lib/api';
import MissionCard, { type MissionSummary } from '../../components/missions/MissionCard';

interface LocalIdentity { contact_hash: string; display_name: string }

export default function MissionsPage() {
  const [missions, setMissions] = useState<MissionSummary[]>([]);
  const [identity, setIdentity] = useState<LocalIdentity | null>(null);
  const [identityChecked, setIdentityChecked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadIdentity = useCallback(async () => {
    try {
      const res = await fetchWithAuth('/api/missions/identity', { headers: getAuthHeader() });
      const data = await res.json();
      setIdentity(data.identity ?? null);
    } catch { /* silent */ }
    finally { setIdentityChecked(true); }
  }, []);

  const loadMissions = useCallback(async () => {
    setError(null);
    try {
      const res = await fetchWithAuth('/api/missions?status=draft,briefed,active,paused,review,completed', { headers: getAuthHeader() });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setMissions(data.missions ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadIdentity(); void loadMissions(); }, [loadIdentity, loadMissions]);

  // Poll while there's anything live
  useEffect(() => {
    const hasLive = missions.some(m => m.status === 'active' || m.status === 'briefed');
    if (!hasLive) return;
    const id = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      void loadMissions();
    }, 10_000);
    return () => clearInterval(id);
  }, [missions, loadMissions]);

  const grouped = {
    needs_attention: missions.filter(m => m.status === 'review' || m.status === 'briefed'),
    active:          missions.filter(m => m.status === 'active'),
    paused:          missions.filter(m => m.status === 'paused'),
    draft:           missions.filter(m => m.status === 'draft'),
    completed:       missions.filter(m => m.status === 'completed'),
  };

  return (
    <div className="mx-auto max-w-5xl p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-3">
            <Target className="h-7 w-7 text-adv-teal" />
            <h1 className="text-2xl font-semibold text-adv-off-white">Missions</h1>
          </div>
          <p className="mt-1 text-sm text-adv-gray max-w-2xl">
            Brief ANTON on a goal. It decomposes the work into a task graph, executes autonomously
            with budget + governance, and returns when done — or when it needs your decision.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void loadMissions()}
            disabled={loading}
            className="rounded-lg border border-border px-3 py-1.5 text-xs text-adv-gray hover:text-adv-off-white inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <RefreshCcw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <Link
            to="/missions/new"
            className={`rounded-lg bg-adv-teal px-4 py-1.5 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark inline-flex items-center gap-1.5 ${!identity ? 'pointer-events-none opacity-50' : ''}`}
          >
            <Plus className="h-4 w-4" />
            Create Mission
          </Link>
        </div>
      </div>

      {identityChecked && !identity && (
        <div className="rounded-xl border border-adv-gold/30 bg-adv-gold/10 px-4 py-3 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-adv-gold shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-adv-gold font-medium">Activate your ANTON identity to create missions</p>
            <p className="mt-1 text-xs text-adv-gold/80">
              Missions need a creator identity. Activate your contact hash on the Identity page first.
            </p>
            <Link to="/community/identity" className="mt-2 inline-block text-xs text-adv-teal hover:underline">
              Go to My Identity →
            </Link>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-adv-red/30 bg-adv-red/10 px-4 py-3 text-sm text-adv-red flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {loading && missions.length === 0 ? (
        <div className="text-center py-12 text-sm text-adv-gray">Loading missions…</div>
      ) : missions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-adv-card/50 p-10 text-center">
          <Target className="h-10 w-10 text-adv-teal/40 mx-auto" />
          <p className="mt-3 text-sm text-adv-off-white font-medium">No missions yet</p>
          <p className="mt-1 text-xs text-adv-gray max-w-md mx-auto">
            Brief ANTON on your first mission. Pick a template or write your own objective.
          </p>
          {identity && (
            <Link
              to="/missions/new"
              className="mt-4 rounded-lg bg-adv-teal px-4 py-1.5 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark inline-flex items-center gap-1.5"
            >
              <Plus className="h-4 w-4" />
              Create your first Mission
            </Link>
          )}
        </div>
      ) : (
        <>
          {grouped.needs_attention.length > 0 && (
            <Section title="Needs your attention" hint="Plan ready or output to review">
              {grouped.needs_attention.map(m => <MissionCard key={m.id} mission={m} />)}
            </Section>
          )}
          {grouped.active.length > 0 && (
            <Section title="Active" hint="Executing now">
              {grouped.active.map(m => <MissionCard key={m.id} mission={m} />)}
            </Section>
          )}
          {grouped.paused.length > 0 && (
            <Section title="Paused" hint="Awaiting resume">
              {grouped.paused.map(m => <MissionCard key={m.id} mission={m} />)}
            </Section>
          )}
          {grouped.draft.length > 0 && (
            <Section title="Draft" hint="Not yet briefed">
              {grouped.draft.map(m => <MissionCard key={m.id} mission={m} />)}
            </Section>
          )}
          {grouped.completed.length > 0 && (
            <Section title="Completed">
              {grouped.completed.slice(0, 10).map(m => <MissionCard key={m.id} mission={m} />)}
            </Section>
          )}
        </>
      )}
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-baseline gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-adv-teal">{title}</h2>
        {hint && <span className="text-[11px] text-adv-gray">{hint}</span>}
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}
