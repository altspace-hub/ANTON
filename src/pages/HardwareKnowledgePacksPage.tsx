import { useState, useEffect, useMemo } from 'react';
import {
  Cpu,
  ShieldCheck,
  ShieldAlert,
  Microscope,
  Sparkles,
  AlertTriangle,
  RefreshCcw,
  ChevronRight,
  X,
  Globe,
  Tag,
  CalendarDays,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import { fetchWithAuth, API_BASE } from '@/lib/api';

// ── Types (mirrors server/services/hkp-service.ts) ────────────────────────────

type ClaimClassification =
  | 'datasheet-verified'
  | 'community-verified'
  | 'physically-verified'
  | 'AI-unverified';

type CounterfeitRisk = 'low' | 'moderate' | 'high' | 'critical';

interface HkpSummary {
  id: string;
  family_id: string;
  manufacturer: string;
  part_number: string;
  revision: string | null;
  hkp_version: string;
  primary_source: string;
  signed_by: string | null;
  signing_verified: boolean;
  installed_at: string;
  claim_count: number;
  component_count: number;
  regional_alternative_count: number;
  classification_breakdown: Record<ClaimClassification, number>;
  diagnostic_case_count: number;
  recent_lifecycle_event_count: number;
}

interface HkpClaim {
  id: string;
  claim_path: string;
  claim_value: string;
  classification: ClaimClassification;
  evidence_ref: string | null;
  notes: string | null;
}

interface HkpComponent {
  id: string;
  component_type: string;
  name: string;
  metadata: Record<string, unknown>;
}

interface HkpRegionalAlternative {
  id: string;
  region: string;
  alternative_part: string;
  distributor: string | null;
  typical_price_local: number | null;
  typical_price_currency: string | null;
  typical_lead_days: number | null;
  counterfeit_risk: CounterfeitRisk | null;
  notes: string | null;
}

interface HkpDetail extends HkpSummary {
  claims: HkpClaim[];
  components: HkpComponent[];
  regional_alternatives: HkpRegionalAlternative[];
}

interface LifecycleEvent {
  event_id: string;
  event_type: string;
  title: string;
  severity: string | null;
  cvss_score: number | null;
  published_at: string;
  source: string;
  source_url: string | null;
}

interface HardwareFamily {
  id: string;
  display_name: string;
  status: 'launch' | 'beta' | 'reserved' | 'deprecated';
}

// ── Visual helpers ────────────────────────────────────────────────────────────

const CLASS_STYLES: Record<ClaimClassification, { tag: string; icon: typeof ShieldCheck }> = {
  'datasheet-verified':   { tag: 'bg-green-500/10 text-green-400 border-green-500/30',     icon: ShieldCheck },
  'physically-verified':  { tag: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30', icon: Microscope },
  'community-verified':   { tag: 'bg-blue-500/10 text-blue-400 border-blue-500/30',         icon: Sparkles },
  'AI-unverified':        { tag: 'bg-amber-500/10 text-amber-400 border-amber-500/30',      icon: ShieldAlert },
};

const RISK_STYLES: Record<CounterfeitRisk, string> = {
  low:      'bg-green-500/10 text-green-400 border-green-500/30',
  moderate: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
  high:     'bg-orange-500/10 text-orange-400 border-orange-500/30',
  critical: 'bg-red-500/10 text-red-400 border-red-500/30',
};

function severityClass(sev: string | null): string {
  if (!sev) return 'bg-adv-card text-adv-gray border-adv-gray/30';
  const s = sev.toLowerCase();
  if (s === 'critical') return 'bg-red-500/10 text-red-400 border-red-500/30';
  if (s === 'high')     return 'bg-orange-500/10 text-orange-400 border-orange-500/30';
  if (s === 'moderate' || s === 'medium') return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30';
  return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function HardwareKnowledgePacksPage() {
  const [packs, setPacks] = useState<HkpSummary[]>([]);
  const [families, setFamilies] = useState<HardwareFamily[]>([]);
  const [familyFilter, setFamilyFilter] = useState<string>('all');
  const [search, setSearch] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<HkpDetail | null>(null);
  const [selectedEvents, setSelectedEvents] = useState<LifecycleEvent[]>([]);
  const [loadingDetail, setLoadingDetail] = useState<boolean>(false);

  const [ingestRunning, setIngestRunning] = useState<boolean>(false);
  const [ingestSummary, setIngestSummary] = useState<string | null>(null);

  const loadPacks = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (familyFilter !== 'all') params.set('family_id', familyFilter);
      if (search.trim()) params.set('search', search.trim());
      const res = await fetchWithAuth(`${API_BASE}/hardware/hkps?${params.toString()}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Failed to load HKPs');
      setPacks(json.packs as HkpSummary[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const loadFamilies = async () => {
    try {
      const res = await fetchWithAuth(`${API_BASE}/hardware/families`);
      const json = await res.json();
      if (json.success) setFamilies(json.families as HardwareFamily[]);
    } catch {
      // Non-fatal — filter just stays as 'all'.
    }
  };

  useEffect(() => { loadFamilies(); }, []);
  useEffect(() => { loadPacks(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [familyFilter]);

  const onSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadPacks();
  };

  const openDetail = async (id: string) => {
    setLoadingDetail(true);
    try {
      const res = await fetchWithAuth(`${API_BASE}/hardware/hkps/${id}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Failed to load HKP detail');
      setSelected(json.hkp as HkpDetail);
      setSelectedEvents((json.lifecycle_events as LifecycleEvent[]) ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoadingDetail(false);
    }
  };

  const closeDetail = () => {
    setSelected(null);
    setSelectedEvents([]);
  };

  const runIngest = async () => {
    setIngestRunning(true);
    setIngestSummary(null);
    try {
      const res = await fetchWithAuth(`${API_BASE}/hardware/lifecycle-feeds/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ family_id: familyFilter === 'all' ? 'esp32' : familyFilter }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Ingest failed');
      const t = json.total;
      setIngestSummary(`Pulled ${t.fetched} events; ${t.inserted} new, ${t.skipped} duplicate.`);
      // If a pack is open, refresh its lifecycle feed.
      if (selected) await openDetail(selected.id);
    } catch (e) {
      setIngestSummary('Failed: ' + (e instanceof Error ? e.message : 'unknown error'));
    } finally {
      setIngestRunning(false);
    }
  };

  const totalsByClass = useMemo(() => {
    const t: Record<ClaimClassification, number> = {
      'datasheet-verified': 0, 'physically-verified': 0, 'community-verified': 0, 'AI-unverified': 0,
    };
    for (const p of packs) {
      for (const c of Object.keys(t) as ClaimClassification[]) {
        t[c] += p.classification_breakdown?.[c] ?? 0;
      }
    }
    return t;
  }, [packs]);

  return (
    <div className="min-h-screen bg-adv-dark text-adv-off-white p-6">
      <header className="max-w-7xl mx-auto mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <Cpu className="w-6 h-6 text-adv-teal" />
              Hardware Knowledge Packs
            </h1>
            <p className="text-sm text-adv-gray mt-1 max-w-2xl">
              Three-layer reference material for every supported hardware module. Specification + diagnostic + lifecycle.
              Every claim carries a verification classification — treat <span className="text-amber-400">[AI-unverified]</span> claims as advisory only when used in critical firmware paths.
            </p>
          </div>
          <button
            onClick={runIngest}
            disabled={ingestRunning}
            className="flex items-center gap-2 px-3 py-2 rounded border border-adv-teal/40 bg-adv-teal/10 text-adv-teal hover:bg-adv-teal/20 transition disabled:opacity-50"
          >
            {ingestRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
            Pull lifecycle feeds
          </button>
        </div>
        {ingestSummary && (
          <div className="mt-2 text-sm text-adv-gray">{ingestSummary}</div>
        )}
      </header>

      {/* Summary strip */}
      <section className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <SummaryCard label="Installed packs" value={packs.length.toString()} icon={<Cpu className="w-5 h-5" />} />
        <SummaryCard
          label="Datasheet-verified claims"
          value={totalsByClass['datasheet-verified'].toString()}
          icon={<ShieldCheck className="w-5 h-5 text-green-400" />}
        />
        <SummaryCard
          label="Community-verified claims"
          value={totalsByClass['community-verified'].toString()}
          icon={<Sparkles className="w-5 h-5 text-blue-400" />}
        />
        <SummaryCard
          label="AI-unverified claims"
          value={totalsByClass['AI-unverified'].toString()}
          icon={<ShieldAlert className="w-5 h-5 text-amber-400" />}
          warn={totalsByClass['AI-unverified'] > 0}
        />
      </section>

      {/* Filters */}
      <section className="max-w-7xl mx-auto flex flex-wrap items-center gap-2 mb-4">
        <select
          value={familyFilter}
          onChange={e => setFamilyFilter(e.target.value)}
          className="bg-adv-card border border-adv-gray/30 rounded px-3 py-2 text-sm"
        >
          <option value="all">All families</option>
          {families.map(f => (
            <option key={f.id} value={f.id} disabled={f.status === 'reserved'}>
              {f.display_name} {f.status !== 'launch' ? `(${f.status})` : ''}
            </option>
          ))}
        </select>
        <form onSubmit={onSearchSubmit} className="flex items-center gap-2 flex-1 min-w-[200px]">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by part number or manufacturer…"
            className="bg-adv-card border border-adv-gray/30 rounded px-3 py-2 text-sm flex-1"
          />
          <button type="submit" className="px-3 py-2 rounded bg-adv-card border border-adv-gray/30 hover:border-adv-teal/40 text-sm">
            Search
          </button>
        </form>
      </section>

      {/* Error / loading */}
      {error && (
        <div className="max-w-7xl mx-auto mb-4 p-3 rounded border border-red-500/30 bg-red-500/10 text-red-400 text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          {error}
        </div>
      )}

      {/* Pack grid */}
      <section className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {loading ? (
          <div className="col-span-full py-12 text-center text-adv-gray">
            <Loader2 className="w-6 h-6 animate-spin inline mb-2" />
            <div>Loading hardware knowledge packs…</div>
          </div>
        ) : packs.length === 0 ? (
          <div className="col-span-full py-12 text-center text-adv-gray">
            No hardware knowledge packs installed yet.
          </div>
        ) : (
          packs.map(p => (
            <PackCard key={p.id} pack={p} onOpen={() => openDetail(p.id)} />
          ))
        )}
      </section>

      {/* Detail drawer */}
      {selected && (
        <DetailDrawer
          pack={selected}
          events={selectedEvents}
          loading={loadingDetail}
          onClose={closeDetail}
        />
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SummaryCard({ label, value, icon, warn }: { label: string; value: string; icon: React.ReactNode; warn?: boolean }) {
  return (
    <div className={`p-4 rounded border ${warn ? 'border-amber-500/30 bg-amber-500/5' : 'border-adv-gray/20 bg-adv-card'}`}>
      <div className="flex items-center justify-between text-xs text-adv-gray uppercase tracking-wide">
        <span>{label}</span>
        {icon}
      </div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function PackCard({ pack, onOpen }: { pack: HkpSummary; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="text-left p-4 rounded border border-adv-gray/20 bg-adv-card hover:border-adv-teal/40 transition group"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs text-adv-gray uppercase tracking-wide">{pack.family_id}</div>
          <div className="text-lg font-semibold">{pack.part_number}</div>
          <div className="text-sm text-adv-gray">{pack.manufacturer}{pack.revision ? ` · rev ${pack.revision}` : ''}</div>
        </div>
        <ChevronRight className="w-5 h-5 text-adv-gray group-hover:text-adv-teal transition" />
      </div>
      <div className="mt-3 flex flex-wrap gap-1">
        {(Object.keys(pack.classification_breakdown) as ClaimClassification[]).map(cls => {
          const n = pack.classification_breakdown[cls];
          if (n === 0) return null;
          const style = CLASS_STYLES[cls];
          const Icon = style.icon;
          return (
            <span key={cls} className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded border ${style.tag}`}>
              <Icon className="w-3 h-3" />
              {n} {cls.replace('-verified', '').replace('-', ' ')}
            </span>
          );
        })}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-adv-gray">
        <div><span className="text-adv-off-white font-medium">{pack.component_count}</span> components</div>
        <div><span className="text-adv-off-white font-medium">{pack.diagnostic_case_count}</span> cases</div>
        <div className={pack.recent_lifecycle_event_count > 0 ? 'text-amber-400' : ''}>
          <span className="font-medium">{pack.recent_lifecycle_event_count}</span> recent events
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-adv-gray">
        <span className="inline-flex items-center gap-1">
          <Tag className="w-3 h-3" />
          {pack.primary_source}
        </span>
        {pack.signing_verified && (
          <span className="inline-flex items-center gap-1 text-emerald-400">
            <ShieldCheck className="w-3 h-3" />
            signed by {pack.signed_by}
          </span>
        )}
        <span>v{pack.hkp_version}</span>
      </div>
    </button>
  );
}

function DetailDrawer({
  pack, events, loading, onClose,
}: { pack: HkpDetail; events: LifecycleEvent[]; loading: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<'spec' | 'diagnostic' | 'lifecycle' | 'sourcing'>('spec');
  const claimsByCls = useMemo(() => {
    const m: Record<ClaimClassification, HkpClaim[]> = {
      'datasheet-verified': [], 'physically-verified': [], 'community-verified': [], 'AI-unverified': [],
    };
    for (const c of pack.claims) (m[c.classification] ?? []).push(c);
    return m;
  }, [pack.claims]);

  return (
    <div className="fixed inset-0 z-40 bg-black/70 flex justify-end" onClick={onClose}>
      <div
        className="w-full max-w-3xl h-full bg-adv-dark-2 border-l border-adv-gray/20 overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <header className="sticky top-0 bg-adv-dark-2 border-b border-adv-gray/20 p-4 flex items-start justify-between gap-4 z-10">
          <div>
            <div className="text-xs text-adv-gray uppercase tracking-wide">{pack.family_id} · {pack.primary_source}</div>
            <h2 className="text-xl font-semibold">{pack.manufacturer} {pack.part_number}</h2>
            <div className="text-sm text-adv-gray">v{pack.hkp_version}{pack.revision ? ` · rev ${pack.revision}` : ''}</div>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-adv-card">
            <X className="w-5 h-5" />
          </button>
        </header>

        <nav className="flex border-b border-adv-gray/20 sticky top-[88px] bg-adv-dark-2 z-10">
          {(['spec', 'diagnostic', 'lifecycle', 'sourcing'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm border-b-2 transition ${
                tab === t ? 'border-adv-teal text-adv-teal' : 'border-transparent text-adv-gray hover:text-adv-off-white'
              }`}
            >
              {t === 'spec' ? `Specification (${pack.claims.length})`
                : t === 'diagnostic' ? `Diagnostic (${pack.diagnostic_case_count})`
                : t === 'lifecycle' ? `Lifecycle (${events.length})`
                : `Sourcing (${pack.regional_alternatives.length})`}
            </button>
          ))}
        </nav>

        <div className="p-4">
          {loading && (
            <div className="py-12 text-center text-adv-gray">
              <Loader2 className="w-6 h-6 animate-spin inline" />
            </div>
          )}

          {!loading && tab === 'spec' && (
            <div className="space-y-5">
              {(['datasheet-verified', 'physically-verified', 'community-verified', 'AI-unverified'] as ClaimClassification[]).map(cls => {
                const list = claimsByCls[cls];
                if (list.length === 0) return null;
                const style = CLASS_STYLES[cls];
                const Icon = style.icon;
                return (
                  <section key={cls}>
                    <h3 className={`text-sm font-semibold mb-2 inline-flex items-center gap-1 px-2 py-1 rounded border ${style.tag}`}>
                      <Icon className="w-3.5 h-3.5" />
                      {cls} ({list.length})
                    </h3>
                    <ul className="text-sm space-y-1">
                      {list.map(c => (
                        <li key={c.id} className="flex flex-col py-1 border-b border-adv-gray/10">
                          <div className="flex items-baseline gap-2">
                            <code className="text-xs text-adv-gray">{c.claim_path}</code>
                            <span className="font-mono text-adv-off-white">{c.claim_value}</span>
                          </div>
                          {c.notes && <div className="text-xs text-adv-gray mt-0.5">{c.notes}</div>}
                          {c.evidence_ref && <div className="text-xs text-adv-gray italic">{c.evidence_ref}</div>}
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
              {pack.components.length > 0 && (
                <section className="pt-4 border-t border-adv-gray/20">
                  <h3 className="text-sm font-semibold mb-2 text-adv-off-white">Components & peripherals</h3>
                  <ul className="space-y-2">
                    {pack.components.map(c => (
                      <li key={c.id} className="text-sm border border-adv-gray/20 rounded p-2 bg-adv-card/50">
                        <div className="text-xs text-adv-gray uppercase tracking-wide">{c.component_type}</div>
                        <div className="font-medium">{c.name}</div>
                        {Object.keys(c.metadata).length > 0 && (
                          <pre className="mt-1 text-xs text-adv-gray overflow-x-auto">{JSON.stringify(c.metadata, null, 2)}</pre>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}

          {!loading && tab === 'diagnostic' && (
            <DiagnosticTab packId={pack.id} familyId={pack.family_id} />
          )}

          {!loading && tab === 'lifecycle' && (
            <ul className="space-y-2">
              {events.length === 0 ? (
                <li className="text-sm text-adv-gray text-center py-8">No recent lifecycle events. Try “Pull lifecycle feeds”.</li>
              ) : events.map(e => (
                <li key={e.event_id} className="text-sm border border-adv-gray/20 rounded p-3 bg-adv-card/50">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="text-xs text-adv-gray flex items-center gap-2">
                        <CalendarDays className="w-3 h-3" />
                        {new Date(e.published_at).toISOString().slice(0, 10)} · {e.source} · {e.event_type}
                      </div>
                      <div className="font-medium">{e.title}</div>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded border ${severityClass(e.severity)}`}>
                      {e.cvss_score ? `CVSS ${e.cvss_score}` : (e.severity ?? 'n/a')}
                    </span>
                  </div>
                  {e.source_url && (
                    <a href={e.source_url} target="_blank" rel="noreferrer" className="text-xs text-adv-teal inline-flex items-center gap-1 mt-1">
                      Source <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}

          {!loading && tab === 'sourcing' && (
            <ul className="space-y-2">
              {pack.regional_alternatives.length === 0 ? (
                <li className="text-sm text-adv-gray text-center py-8">No regional sourcing alternatives recorded.</li>
              ) : pack.regional_alternatives.map(a => (
                <li key={a.id} className="text-sm border border-adv-gray/20 rounded p-3 bg-adv-card/50">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="text-xs text-adv-gray flex items-center gap-1">
                        <Globe className="w-3 h-3" />
                        {a.region}
                      </div>
                      <div className="font-medium">{a.alternative_part}</div>
                      {a.distributor && <div className="text-xs text-adv-gray">{a.distributor}</div>}
                    </div>
                    <div className="text-right space-y-1">
                      {a.typical_price_local !== null && (
                        <div className="text-sm font-mono">{a.typical_price_local} {a.typical_price_currency}</div>
                      )}
                      {a.counterfeit_risk && (
                        <span className={`inline-block text-xs px-2 py-0.5 rounded border ${RISK_STYLES[a.counterfeit_risk]}`}>
                          {a.counterfeit_risk} risk
                        </span>
                      )}
                    </div>
                  </div>
                  {a.notes && <div className="text-xs text-adv-gray mt-1">{a.notes}</div>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

interface DiagnosticCaseRow {
  case_id: string;
  title: string;
  severity: string | null;
  case_data: { symptoms?: Array<{ description?: string; pattern?: string }> };
}

function DiagnosticTab({ packId, familyId }: { packId: string; familyId: string }) {
  const [cases, setCases] = useState<DiagnosticCaseRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // We expose a small inline endpoint via the lifecycle-events route shape
        // for simplicity. If no dedicated route exists yet, fall back to filtering
        // via the lifecycle endpoint or wait for a future phase to add one.
        // For now, hit a generic /hardware/diagnostic-cases endpoint shape — if
        // it 404s, surface a friendly empty state rather than an error.
        const res = await fetchWithAuth(`${API_BASE}/hardware/hkps/${packId}/diagnostic-cases`);
        if (res.ok) {
          const json = await res.json();
          if (!cancelled) setCases(json.cases ?? []);
        } else {
          if (!cancelled) setCases([]); // endpoint not built yet; show empty state
        }
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'Failed to load cases');
      }
    })();
    return () => { cancelled = true; };
  }, [packId, familyId]);

  if (err) return <div className="text-sm text-red-400">{err}</div>;
  if (cases === null) return <div className="text-sm text-adv-gray"><Loader2 className="w-4 h-4 animate-spin inline" /> Loading cases…</div>;
  if (cases.length === 0) return (
    <div className="text-sm text-adv-gray text-center py-8">
      Diagnostic case browser is wired but its dedicated REST endpoint will land in the next phase.
      In the meantime, the seeded cases for this HKP are queryable directly from PostgreSQL.
    </div>
  );

  return (
    <ul className="space-y-2">
      {cases.map(c => (
        <li key={c.case_id} className="text-sm border border-adv-gray/20 rounded p-3 bg-adv-card/50">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-xs text-adv-gray uppercase tracking-wide">{c.case_id}</div>
              <div className="font-medium">{c.title}</div>
            </div>
            {c.severity && (
              <span className={`text-xs px-2 py-0.5 rounded border ${severityClass(c.severity)}`}>{c.severity}</span>
            )}
          </div>
          {c.case_data?.symptoms && c.case_data.symptoms.length > 0 && (
            <ul className="mt-1 text-xs text-adv-gray list-disc list-inside space-y-0.5">
              {c.case_data.symptoms.slice(0, 3).map((s, i) => (
                <li key={i}>{s.description ?? s.pattern}</li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}
