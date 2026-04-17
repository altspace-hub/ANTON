// RiskAtlasWorkspacePage — the main Atlas workspace shell.
// Five tabs: Dashboard / Paths / Controls / Events / Maintenance.
// Stage UIs (Phase 1f) plug in as content for each tab.

import { useEffect, useState, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ShieldAlert, ChevronLeft, RefreshCcw, AlertCircle,
  LayoutDashboard, GitBranch, Shield, ScrollText, CalendarClock,
  Archive, Download, FileText, FileImage, Package, ListChecks, Star, Loader2,
} from 'lucide-react';
import { fetchWithAuth, getAuthHeader } from '../../lib/api';
import ThreatPathsTab from '../../components/risk-atlas/ThreatPathsTab';
import ControlsTab from '../../components/risk-atlas/ControlsTab';
import MaintenanceTab from '../../components/risk-atlas/MaintenanceTab';

type TabKey = 'dashboard' | 'paths' | 'controls' | 'events' | 'maintenance';
type AppetitePosition = 'within' | 'boundary' | 'outside' | 'unacceptable';

interface AtlasRow {
  id: string;
  name: string;
  description: string | null;
  business_description: string | null;
  industry_pack_id: string | null;
  status: 'draft' | 'active' | 'review' | 'archived';
  mode: 'socratic' | 'draft' | 'expert' | 'autonomous';
  next_review_due_at: string | null;
  created_at: string;
}

interface DashboardData {
  atlas: AtlasRow;
  pack: { name: string; description: string | null } | null;
  paths_total: number;
  paths_by_appetite: Record<AppetitePosition, number>;
  paths_by_residual: Record<string, number>;
  paths_outside_appetite: Array<{
    path: { id: string; path_code: string; name: string; fcp_domain: string | null };
    residual: { residual_score: number } | null;
    appetite: { required_action: string | null; target_date: string | null } | null;
  }>;
  next_review_at: string | null;
  last_event_at: string | null;
}

const TABS: { key: TabKey; label: string; icon: typeof LayoutDashboard }[] = [
  { key: 'dashboard',   label: 'Dashboard',   icon: LayoutDashboard },
  { key: 'paths',       label: 'Threat paths',icon: GitBranch },
  { key: 'controls',    label: 'Controls',    icon: Shield },
  { key: 'events',      label: 'Events',      icon: ScrollText },
  { key: 'maintenance', label: 'Maintenance', icon: CalendarClock },
];

const APPETITE_COLOR: Record<AppetitePosition, string> = {
  within:       'text-adv-green border-adv-green/40 bg-adv-green/10',
  boundary:     'text-adv-gold border-adv-gold/40 bg-adv-gold/10',
  outside:      'text-adv-red border-adv-red/40 bg-adv-red/10',
  unacceptable: 'text-adv-red border-adv-red bg-adv-red/20',
};

export default function RiskAtlasWorkspacePage() {
  const { id } = useParams<{ id: string }>();
  const [tab, setTab] = useState<TabKey>('dashboard');
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    try {
      const res = await fetchWithAuth(`/api/atlas/${id}/dashboard`, { headers: getAuthHeader() });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setDashboard(data.dashboard);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  if (loading && !dashboard) {
    return (
      <div className="mx-auto max-w-6xl p-6">
        <BackLink />
        <div className="mt-6 text-center text-xs text-adv-gray">Loading Atlas…</div>
      </div>
    );
  }
  if (error || !dashboard) {
    return (
      <div className="mx-auto max-w-6xl p-6">
        <BackLink />
        <div className="mt-6 rounded border border-adv-red/30 bg-adv-red/10 px-3 py-2 text-xs text-adv-red flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error || 'Atlas not found'}
        </div>
      </div>
    );
  }

  const a = dashboard.atlas;

  return (
    <div className="mx-auto max-w-6xl p-6 space-y-5">
      <BackLink />

      <div className="rounded-xl border border-border bg-adv-card p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <ShieldAlert className="h-5 w-5 text-adv-teal shrink-0" />
              <h1 className="text-lg font-semibold text-adv-off-white">{a.name}</h1>
              <span className="text-[10px] text-adv-gray">[{a.status}] · {a.mode}</span>
              {a.industry_pack_id && (
                <span className="text-[10px] text-adv-gray">· pack: {a.industry_pack_id}</span>
              )}
              {a.status === 'archived' && (
                <span className="inline-flex items-center gap-1 text-[10px] text-adv-gray/70"><Archive className="h-3 w-3" /> archived</span>
              )}
            </div>
            {a.description && (
              <p className="mt-2 text-xs text-adv-off-white">{a.description}</p>
            )}
          </div>
          <button
            onClick={() => void load()}
            disabled={loading}
            className="rounded-lg border border-border px-3 py-1.5 text-xs text-adv-gray hover:text-adv-off-white inline-flex items-center gap-1.5 disabled:opacity-50 shrink-0"
          >
            <RefreshCcw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Tab strip */}
      <div className="flex items-center gap-1 border-b border-border overflow-x-auto">
        {TABS.map(t => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-2 text-xs font-medium border-b-2 -mb-px inline-flex items-center gap-1.5 whitespace-nowrap ${
                active ? 'border-adv-teal text-adv-teal' : 'border-transparent text-adv-gray hover:text-adv-off-white'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'dashboard'  && <DashboardTab dashboard={dashboard} />}
      {tab === 'paths'      && id && <ThreatPathsTab atlasId={id} />}
      {tab === 'controls'   && id && <ControlsTab atlasId={id} />}
      {tab === 'events'     && id && <EventsTab atlasId={id} />}
      {tab === 'maintenance'&& id && <MaintenanceTab atlasId={id} />}
    </div>
  );
}

function DashboardTab({ dashboard }: { dashboard: DashboardData }) {
  const a = dashboard.paths_by_appetite;
  const atlasId = dashboard.atlas.id;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
        <Stat label="Paths total"             value={String(dashboard.paths_total)} />
        <Stat label="Outside / unacceptable"  value={String((a.outside ?? 0) + (a.unacceptable ?? 0))} highlight={(a.outside + a.unacceptable) > 0 ? 'red' : undefined} />
        <Stat label="At boundary"             value={String(a.boundary ?? 0)} highlight={a.boundary > 0 ? 'gold' : undefined} />
        <Stat label="Within appetite"         value={String(a.within ?? 0)} />
      </div>

      <IntegrityFindingsSection atlasId={atlasId} />

      <ExportRow atlasId={atlasId} />

      <QualityScoreCard atlasId={atlasId} />

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-adv-teal">Outside / unacceptable paths</h2>
        {dashboard.paths_outside_appetite.length === 0 ? (
          <div className="rounded border border-dashed border-border p-6 text-center text-[11px] text-adv-gray">
            Nothing outside appetite.
          </div>
        ) : (
          <div className="space-y-2">
            {dashboard.paths_outside_appetite.map(p => {
              const ap = (p.residual?.residual_score ?? 0) >= 5 ? 'unacceptable' : 'outside';
              return (
                <div key={p.path.id} className="rounded border border-border bg-adv-card p-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium text-adv-off-white">{p.path.path_code} — {p.path.name}</span>
                    <span className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-medium ${APPETITE_COLOR[ap]}`}>
                      residual {p.residual?.residual_score ?? '?'} — {ap}
                    </span>
                    {p.path.fcp_domain && (
                      <span className="text-[10px] text-adv-gray">[{p.path.fcp_domain}]</span>
                    )}
                  </div>
                  {p.appetite?.required_action && (
                    <div className="mt-1 text-[11px] text-adv-off-white">→ {p.appetite.required_action}</div>
                  )}
                  {p.appetite?.target_date && (
                    <div className="text-[10px] text-adv-gray">By {p.appetite.target_date}</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div className="rounded-xl border border-border bg-adv-card p-4 text-[11px] text-adv-gray space-y-1">
        <div>Next review: {dashboard.next_review_at ? new Date(dashboard.next_review_at).toLocaleString() : '—'}</div>
        <div>Last event:  {dashboard.last_event_at ? new Date(dashboard.last_event_at).toLocaleString() : '—'}</div>
      </div>
    </div>
  );
}

function EventsTab({ atlasId }: { atlasId: string }) {
  const [events, setEvents] = useState<Array<{ id: number; event_type: string; sub_resource_id: string | null; user_id: string | null; details: unknown; created_at: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetchWithAuth(`/api/atlas/${atlasId}/events?limit=200`, { headers: getAuthHeader() });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
        setEvents(data.events ?? []);
      } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    })();
  }, [atlasId]);
  if (error) return <div className="text-xs text-adv-red">{error}</div>;
  if (events.length === 0) return <div className="text-xs text-adv-gray">No events yet.</div>;
  return (
    <div className="rounded-xl border border-border bg-adv-card divide-y divide-border">
      {events.map(e => (
        <div key={e.id} className="px-3 py-2 text-[11px] flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <span className="font-medium text-adv-off-white">{e.event_type}</span>
            {e.sub_resource_id && <span className="ml-2 text-adv-gray">→ {e.sub_resource_id}</span>}
          </div>
          <span className="text-[10px] text-adv-gray shrink-0">{new Date(e.created_at).toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

function PlaceholderTab({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border p-12 text-center">
      <h2 className="text-sm font-semibold text-adv-off-white">{title}</h2>
      <p className="mt-2 text-[11px] text-adv-gray">{hint}</p>
    </div>
  );
}

function ExportRow({ atlasId }: { atlasId: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function download(kind: 'board' | 'paths' | 'heatmap.svg' | 'bundle', defaultExt: string): Promise<void> {
    setBusy(kind); setErr(null);
    try {
      const res = await fetchWithAuth(`/api/atlas/${atlasId}/export/${kind}`, { headers: getAuthHeader() });
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try { const j = await res.json(); if (j?.error) msg = String(j.error); } catch { /* not json */ }
        throw new Error(msg);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const cd = res.headers.get('Content-Disposition') || '';
      const m = /filename="([^"]+)"/.exec(cd);
      a.download = m ? m[1] : `atlas-${kind.replace('.svg','')}-${atlasId}${defaultExt}`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(null); }
  }

  const Btn = ({ kind, ext, icon: Icon, label, hint }: { kind: 'board' | 'paths' | 'heatmap.svg' | 'bundle'; ext: string; icon: typeof FileText; label: string; hint: string }) => (
    <button
      onClick={() => void download(kind, ext)}
      disabled={busy !== null}
      className="rounded border border-border bg-adv-dark px-3 py-2 text-left text-[11px] hover:border-adv-teal disabled:opacity-50"
    >
      <div className="flex items-center gap-2 text-adv-off-white font-medium">
        <Icon className="h-3.5 w-3.5" />
        {busy === kind ? 'Downloading…' : label}
      </div>
      <div className="mt-0.5 text-[10px] text-adv-gray">{hint}</div>
    </button>
  );

  return (
    <section>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-adv-teal flex items-center gap-1.5">
        <Download className="h-3.5 w-3.5" /> Exports
      </h2>
      {err && <div className="mb-2 text-[11px] text-adv-red">{err}</div>}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
        <Btn kind="board"        ext=".docx" icon={FileText}  label="Board pack (.docx)"  hint="Headline + outside-appetite + all-paths table" />
        <Btn kind="paths"        ext=".pdf"  icon={FileText}  label="Threat path cards (.pdf)" hint="One card per path with full causal chain" />
        <Btn kind="heatmap.svg"  ext=".svg"  icon={FileImage} label="Residual heatmap (.svg)"  hint="5×5 inherent × residual map" />
        <Btn kind="bundle"       ext=".json" icon={Package}   label=".anton bundle" hint="Round-trip export of the full Atlas" />
      </div>
    </section>
  );
}

function IntegrityFindingsSection({ atlasId }: { atlasId: string }) {
  type Finding = { rule_code: string; severity: 'critical' | 'high' | 'medium' | 'low'; message: string; remediation: string; subject_kind: string; subject_id: string };
  const [report, setReport] = useState<{ findings: Finding[]; counts: Record<Finding['severity'], number> } | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const res = await fetchWithAuth(`/api/atlas/${atlasId}/integrity`, { headers: getAuthHeader() });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setReport(data.report);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, [atlasId]);

  useEffect(() => { void load(); }, [load]);

  const SEVERITY_CLS: Record<Finding['severity'], string> = {
    critical: 'border-adv-red bg-adv-red/15 text-adv-red',
    high:     'border-adv-red/50 bg-adv-red/10 text-adv-red',
    medium:   'border-adv-gold/50 bg-adv-gold/10 text-adv-gold',
    low:      'border-border bg-adv-dark text-adv-gray',
  };

  return (
    <section>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-adv-teal flex items-center gap-1.5">
        <ListChecks className="h-3.5 w-3.5" /> Integrity findings
        {loading && <Loader2 className="h-3 w-3 animate-spin text-adv-gray" />}
      </h2>
      {err && <div className="mb-2 text-[11px] text-adv-red">{err}</div>}
      {report && report.findings.length === 0 && (
        <div className="rounded border border-dashed border-border p-4 text-center text-[11px] text-adv-gray">
          Atlas passes all integrity rules.
        </div>
      )}
      {report && report.findings.length > 0 && (
        <div className="space-y-2">
          {report.findings.map((f, idx) => (
            <div key={idx} className={`rounded border px-3 py-2 ${SEVERITY_CLS[f.severity]}`}>
              <div className="flex items-center gap-2 flex-wrap text-[10px] font-medium uppercase tracking-wider">
                <span>{f.severity}</span>
                <span className="opacity-60">·</span>
                <span className="opacity-80">{f.rule_code}</span>
              </div>
              <div className="mt-1 text-[12px] text-adv-off-white">{f.message}</div>
              <div className="mt-0.5 text-[11px] text-adv-gray">→ {f.remediation}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function QualityScoreCard({ atlasId }: { atlasId: string }) {
  type Score = { score: { overall: number; completeness: number; accuracy: number; structure: number; actionability: number; citations: number }; strengths?: string[]; weaknesses?: string[]; improvementSuggestion?: string };
  const [score, setScore] = useState<Score | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function run(): Promise<void> {
    setLoading(true); setErr(null);
    try {
      const res = await fetchWithAuth(`/api/atlas/${atlasId}/quality-score`, { method: 'POST', headers: getAuthHeader() });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setScore(data.score);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }

  return (
    <section>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-adv-teal flex items-center gap-1.5">
        <Star className="h-3.5 w-3.5" /> Board pack quality score
      </h2>
      {err && <div className="mb-2 text-[11px] text-adv-red">{err}</div>}
      <div className="rounded border border-border bg-adv-card p-3 text-[11px] text-adv-gray">
        {!score && (
          <div className="flex items-center justify-between gap-3">
            <div>Score the latest board pack against ANTON's Quality Ratchet (completeness, accuracy, structure, actionability, citations).</div>
            <button
              onClick={() => void run()}
              disabled={loading}
              className="rounded border border-adv-teal bg-adv-teal/10 px-2 py-1 text-[11px] text-adv-teal hover:bg-adv-teal/20 disabled:opacity-50 inline-flex items-center gap-1.5 shrink-0"
            >
              {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Star className="h-3 w-3" />}
              {loading ? 'Scoring…' : 'Score now'}
            </button>
          </div>
        )}
        {score && (
          <div>
            <div className="flex items-center gap-3">
              <div className="text-3xl font-semibold text-adv-off-white">{score.score.overall.toFixed(1)}<span className="text-sm text-adv-gray">/10</span></div>
              <button onClick={() => void run()} className="rounded border border-border px-2 py-1 text-[10px] text-adv-gray hover:text-adv-off-white">Re-score</button>
            </div>
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-5 gap-2 text-[10px]">
              {(['completeness','accuracy','structure','actionability','citations'] as const).map(k => (
                <div key={k} className="rounded border border-border bg-adv-dark px-2 py-1 text-center">
                  <div className="uppercase tracking-wider text-adv-gray">{k}</div>
                  <div className="text-adv-off-white text-sm font-medium">{score.score[k]}</div>
                </div>
              ))}
            </div>
            {score.improvementSuggestion && (
              <div className="mt-2 text-[11px] text-adv-off-white">→ {score.improvementSuggestion}</div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: 'red' | 'gold' }) {
  const cls = highlight === 'red' ? 'text-adv-red' : highlight === 'gold' ? 'text-adv-gold' : 'text-adv-off-white';
  return (
    <div className="rounded border border-border bg-adv-dark px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-adv-gray">{label}</div>
      <div className={`text-lg font-semibold ${cls}`}>{value}</div>
    </div>
  );
}

function BackLink() {
  return (
    <Link to="/atlas" className="inline-flex items-center gap-1 text-xs text-adv-gray hover:text-adv-teal">
      <ChevronLeft className="h-3.5 w-3.5" />
      Back to Risk Atlas
    </Link>
  );
}
