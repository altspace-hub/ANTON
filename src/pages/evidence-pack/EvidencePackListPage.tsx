/**
 * EvidencePackListPage — /evidence-packs
 *
 * Lists every pack the current user can see (their own + everything if admin).
 * Primary action: "Create new pack" → Builder. Per-row: open in Viewer.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, Plus, Loader2, AlertCircle, Lock } from 'lucide-react';
import { fetchWithAuth } from '@/lib/api';

interface PackSummary {
  id: string;
  title: string;
  purpose: string | null;
  scope_type: string;
  scope_label: string | null;
  status: string;
  hash_manifest: string | null;
  item_count: number;
  created_by: string;
  created_at: string;
  finalised_at: string | null;
  retention_until: string | null;
  legal_hold: boolean;
  compliance_frameworks: string[] | string;
}

export default function EvidencePackListPage() {
  const [packs, setPacks] = useState<PackSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const params = new URLSearchParams();
        if (statusFilter) params.set('status', statusFilter);
        const res = await fetchWithAuth(`/api/evidence-pack?${params}`);
        if (!res.ok) throw new Error(`Failed to load packs (${res.status})`);
        const j = await res.json();
        if (!cancelled) setPacks(j.packs ?? []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { cancelled = true; };
  }, [statusFilter]);

  return (
    <div className="min-h-screen bg-adv-dark text-adv-off-white p-6 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-adv-teal/10">
              <ShieldCheck className="h-7 w-7 text-adv-teal" aria-hidden />
            </div>
            <div>
              <h1 className="text-2xl font-semibold">Evidence Packs</h1>
              <p className="text-sm text-adv-gray mt-1 max-w-2xl">
                Regulator-ready audit bundles. Pick a session or project, run the collector,
                finalise to lock contents, export as <code className="text-adv-off-white">.anton</code> or PDF.
              </p>
            </div>
          </div>
          <Link
            to="/evidence-packs/new"
            className="px-4 py-2 rounded-lg bg-adv-teal text-adv-dark text-sm font-medium hover:bg-adv-teal-dark transition flex items-center gap-2"
          >
            <Plus className="h-4 w-4" /> New pack
          </Link>
        </header>

        <div className="flex items-center gap-2 text-sm">
          <span className="text-adv-gray">Filter:</span>
          {(['', 'draft', 'finalised', 'archived'] as const).map((s) => (
            <button
              key={s || 'all'}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1 rounded-lg border text-xs transition ${
                statusFilter === s
                  ? 'border-adv-teal text-adv-teal bg-adv-teal/10'
                  : 'border-border text-adv-gray hover:text-adv-off-white'
              }`}
            >{s || 'all'}</button>
          ))}
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-adv-red/40 bg-adv-red/10 p-3 text-sm">
            <AlertCircle className="h-4 w-4 text-adv-red flex-shrink-0 mt-0.5" /> {error}
          </div>
        )}

        {packs === null ? (
          <div className="flex items-center gap-2 text-adv-gray text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : packs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-adv-card p-10 text-center">
            <ShieldCheck className="h-10 w-10 text-adv-gray mx-auto mb-3" />
            <p className="text-adv-off-white text-sm font-medium">No evidence packs yet</p>
            <p className="text-xs text-adv-gray mt-1 max-w-md mx-auto">
              Build the first one when you have a session or project that needs to survive a regulator audit.
            </p>
            <Link
              to="/evidence-packs/new"
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-adv-teal text-adv-dark text-sm font-medium px-4 py-2 hover:bg-adv-teal-dark transition"
            >
              <Plus className="h-4 w-4" /> Build your first pack
            </Link>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-adv-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wide text-adv-gray bg-adv-dark/30">
                <tr>
                  <th className="text-left p-3 font-normal">Pack</th>
                  <th className="text-left p-3 font-normal">Scope</th>
                  <th className="text-left p-3 font-normal">Status</th>
                  <th className="text-right p-3 font-normal">Items</th>
                  <th className="text-left p-3 font-normal">Created</th>
                  <th className="text-left p-3 font-normal">Retention</th>
                </tr>
              </thead>
              <tbody>
                {packs.map((p) => (
                  <tr key={p.id} className="border-t border-border/40 hover:bg-adv-dark/20">
                    <td className="p-3">
                      <Link to={`/evidence-packs/${p.id}`} className="block hover:text-adv-teal">
                        <div className="font-medium">{p.title}</div>
                        <code className="text-xs text-adv-teal">{p.id}</code>
                      </Link>
                    </td>
                    <td className="p-3 text-xs text-adv-gray">
                      <div>{p.scope_type}</div>
                      {p.scope_label && <div className="text-adv-off-white/80 mt-0.5">{p.scope_label}</div>}
                    </td>
                    <td className="p-3">
                      <StatusBadge status={p.status} legalHold={p.legal_hold} />
                    </td>
                    <td className="p-3 text-right">{p.item_count}</td>
                    <td className="p-3 text-xs text-adv-gray">{new Date(p.created_at).toLocaleDateString()}</td>
                    <td className="p-3 text-xs text-adv-gray">
                      {p.retention_until ? new Date(p.retention_until).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status, legalHold }: { status: string; legalHold: boolean }) {
  const cls = status === 'finalised' ? 'bg-adv-green/15 text-adv-green'
    : status === 'draft' ? 'bg-adv-gray/15 text-adv-gray'
    : status === 'shared' ? 'bg-adv-teal/15 text-adv-teal'
    : status === 'archived' ? 'bg-adv-card text-adv-gray'
    : 'bg-adv-gray/15 text-adv-gray';
  return (
    <div className="flex items-center gap-1.5">
      <span className={`px-2 py-0.5 rounded text-xs ${cls}`}>{status}</span>
      {legalHold && (
        <span className="text-adv-gold flex items-center gap-1 text-xs" title="Legal hold — cannot be deleted">
          <Lock className="h-3 w-3" /> hold
        </span>
      )}
    </div>
  );
}
