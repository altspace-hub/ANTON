// SmallBusinessDashboardPage — alternative landing for solo operators.
// Cuts the standard workspace down to the three things a small-business
// owner needs to see when they open ANTON in the morning:
//
//   1. What's outside appetite right now and what to do about it
//   2. What's overdue in the maintenance cycle
//   3. One-click links to score / export / open the full workspace
//
// Lives at /atlas/small-business — discoverable from the standard
// landing page via a "Small business view" toggle. Powered by the same
// /api/atlas/:id/dashboard + /integrity endpoints; no new server work.

import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShieldAlert, ChevronLeft, AlertCircle, Loader2, ArrowRight, ListChecks, Download, CalendarClock } from 'lucide-react';
import { fetchWithAuth, getAuthHeader } from '../../lib/api';

interface AtlasRow { id: string; name: string; status: string; mode: string; next_review_due_at: string | null }

interface DashboardLite {
  atlas: AtlasRow;
  paths_total: number;
  paths_by_appetite: { within: number; boundary: number; outside: number; unacceptable: number };
  paths_outside_appetite: Array<{
    path: { id: string; path_code: string; name: string };
    residual: { residual_score: number } | null;
    appetite: { required_action: string | null; target_date: string | null } | null;
  }>;
  next_review_at: string | null;
  last_event_at: string | null;
}

export default function SmallBusinessDashboardPage() {
  const [atlases, setAtlases] = useState<AtlasRow[]>([]);
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<DashboardLite | null>(null);
  const [integrity, setIntegrity] = useState<{ counts: { critical: number; high: number; medium: number; low: number } } | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetchWithAuth('/api/atlas', { headers: getAuthHeader() });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
        const list = (data.atlases ?? []).filter((a: AtlasRow) => a.status !== 'archived');
        setAtlases(list);
        if (list.length === 1) setChosenId(list[0].id);
      } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
      finally { setLoading(false); }
    })();
  }, []);

  useEffect(() => {
    if (!chosenId) return;
    setLoading(true); setErr(null);
    void (async () => {
      try {
        const [d, i] = await Promise.all([
          fetchWithAuth(`/api/atlas/${chosenId}/dashboard`, { headers: getAuthHeader() }),
          fetchWithAuth(`/api/atlas/${chosenId}/integrity`,  { headers: getAuthHeader() }),
        ]);
        const dData = await d.json(); const iData = await i.json();
        if (!d.ok) throw new Error(dData?.error || `HTTP ${d.status}`);
        if (!i.ok) throw new Error(iData?.error || `HTTP ${i.status}`);
        setDashboard(dData.dashboard);
        setIntegrity(iData.report);
      } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
      finally { setLoading(false); }
    })();
  }, [chosenId]);

  if (loading && atlases.length === 0) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <BackLink />
        <div className="mt-6 text-center text-xs text-adv-gray flex items-center justify-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      </div>
    );
  }

  if (atlases.length === 0) {
    return (
      <div className="mx-auto max-w-3xl p-6 space-y-4">
        <BackLink />
        <div className="rounded-xl border border-border bg-adv-card p-6 text-center">
          <ShieldAlert className="mx-auto h-8 w-8 text-adv-teal" />
          <h1 className="mt-3 text-base font-semibold text-adv-off-white">Start your Risk Atlas</h1>
          <p className="mt-1 text-xs text-adv-gray">Pick an industry pack, describe your business, and ANTON drafts the seven-stage risk assessment with you.</p>
          <button onClick={() => navigate('/atlas/new')} className="mt-3 rounded-lg bg-adv-teal px-3 py-1.5 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark">Create Atlas</button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl p-6 space-y-5">
      <BackLink />

      <header>
        <h1 className="text-xl font-semibold text-adv-off-white inline-flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-adv-teal" />
          Risk Atlas — Small business view
        </h1>
        <p className="mt-1 text-xs text-adv-gray">Three things to know in 30 seconds. Everything else is one click away.</p>
      </header>

      {atlases.length > 1 && (
        <label className="block text-[11px] text-adv-gray">
          Atlas
          <select value={chosenId ?? ''} onChange={e => setChosenId(e.target.value)} className="mt-1 w-full rounded border border-border bg-adv-dark px-2 py-1.5 text-xs text-adv-off-white">
            <option value="">— pick an atlas —</option>
            {atlases.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
      )}

      {err && (
        <div className="rounded border border-adv-red/30 bg-adv-red/10 px-3 py-2 text-[11px] text-adv-red flex items-center gap-2">
          <AlertCircle className="h-3.5 w-3.5" /> {err}
        </div>
      )}

      {chosenId && dashboard && (
        <>
          <Card title="What's outside appetite right now" icon={ShieldAlert}>
            {dashboard.paths_outside_appetite.length === 0 ? (
              <div className="text-[11px] text-adv-gray">Nothing outside appetite. Keep maintaining the controls.</div>
            ) : (
              <ol className="space-y-2 text-[12px] text-adv-off-white">
                {dashboard.paths_outside_appetite.map((p, idx) => (
                  <li key={p.path.id} className="rounded border border-adv-red/40 bg-adv-red/5 px-3 py-2">
                    <div className="font-medium">{idx + 1}. {p.path.path_code} — {p.path.name}</div>
                    {p.appetite?.required_action && (
                      <div className="mt-1 text-[11px] text-adv-off-white">→ {p.appetite.required_action}</div>
                    )}
                    {p.appetite?.target_date && (
                      <div className="text-[10px] text-adv-gray">By {p.appetite.target_date}</div>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </Card>

          <Card title="Integrity findings (worth fixing today)" icon={ListChecks}>
            {integrity && (
              <div className="grid grid-cols-4 gap-2 text-center text-xs">
                <Stat label="Critical" value={integrity.counts.critical} highlight={integrity.counts.critical > 0 ? 'red' : undefined} />
                <Stat label="High"     value={integrity.counts.high}     highlight={integrity.counts.high > 0 ? 'red' : undefined} />
                <Stat label="Medium"   value={integrity.counts.medium}   highlight={integrity.counts.medium > 0 ? 'gold' : undefined} />
                <Stat label="Low"      value={integrity.counts.low} />
              </div>
            )}
            <Link to={`/atlas/${chosenId}`} className="mt-3 inline-flex items-center gap-1 text-[11px] text-adv-teal hover:text-adv-teal-dark">
              Open the full workspace <ArrowRight className="h-3 w-3" />
            </Link>
          </Card>

          <Card title="Maintenance" icon={CalendarClock}>
            <div className="text-[11px] text-adv-gray space-y-1">
              <div>Next review: <span className="text-adv-off-white">{dashboard.next_review_at ? new Date(dashboard.next_review_at).toLocaleDateString() : '—'}</span></div>
              <div>Last activity: <span className="text-adv-off-white">{dashboard.last_event_at ? new Date(dashboard.last_event_at).toLocaleDateString() : '—'}</span></div>
            </div>
          </Card>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <a href={`/api/atlas/${chosenId}/export/board`} className="rounded border border-border bg-adv-dark px-3 py-2 text-[11px] text-adv-off-white hover:border-adv-teal inline-flex items-center gap-2">
              <Download className="h-3.5 w-3.5" /> Board pack (.docx)
            </a>
            <a href={`/api/atlas/${chosenId}/export/paths`} className="rounded border border-border bg-adv-dark px-3 py-2 text-[11px] text-adv-off-white hover:border-adv-teal inline-flex items-center gap-2">
              <Download className="h-3.5 w-3.5" /> Threat path cards (.pdf)
            </a>
            <Link to={`/atlas/${chosenId}`} className="rounded border border-adv-teal bg-adv-teal/10 px-3 py-2 text-[11px] text-adv-teal hover:bg-adv-teal/20 inline-flex items-center gap-2">
              <ShieldAlert className="h-3.5 w-3.5" /> Open the full workspace
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

function Card({ title, icon: Icon, children }: { title: string; icon: typeof ShieldAlert; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-adv-card p-4">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-adv-teal flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5" /> {title}
      </h2>
      {children}
    </section>
  );
}

function Stat({ label, value, highlight }: { label: string; value: number; highlight?: 'red' | 'gold' }) {
  const cls = highlight === 'red' ? 'text-adv-red' : highlight === 'gold' ? 'text-adv-gold' : 'text-adv-off-white';
  return (
    <div className="rounded border border-border bg-adv-dark px-2 py-1">
      <div className={`text-base font-semibold ${cls}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-adv-gray">{label}</div>
    </div>
  );
}

function BackLink() {
  return (
    <Link to="/atlas" className="inline-flex items-center gap-1 text-xs text-adv-gray hover:text-adv-teal">
      <ChevronLeft className="h-3.5 w-3.5" /> Back to Risk Atlas
    </Link>
  );
}
