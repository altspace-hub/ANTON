import React, { useState } from 'react';
import { Search, Loader2, AlertTriangle, CheckCircle, XCircle, Eye, Bell } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface CombinedRisk {
  overall: 'HIGH' | 'MEDIUM' | 'LOW' | 'CLEAR';
  flags: string[];
  amlrTriggers: string[];
  recommendation: string;
}

interface RoaringSummary {
  entityName: string;
  orgNumber: string;
  status: string;
  uboCount: number;
  complexityScore: number;
  highRiskFlags: string[];
  sanctionHits: number;
  boardPepFlags: number;
  financialRisk: string;
  revenueChange2y: number;
  riskScore: number;
  source: string;
}

interface DJSummary {
  entityQueried: string;
  totalHits: number;
  sanctionHits: number;
  pepHits: number;
  adverseMediaCount: number;
  soeFlag: boolean;
  riskScore: string;
  referenceId: string;
  source: string;
}

interface EntityIntelligenceData {
  roaring?: RoaringSummary;
  dj?: DJSummary;
  combined?: CombinedRisk;
  fetchedAt: string;
}

interface Props {
  initialQuery?: string;
  sessionId?: string;
  onContextInjected?: (text: string) => void;
  compact?: boolean;
}

const RISK_BG = {
  HIGH:   'bg-red-900/20 border-adv-red/30',
  MEDIUM: 'bg-yellow-900/20 border-adv-gold/30',
  LOW:    'bg-green-900/20 border-adv-green/30',
  CLEAR:  'bg-adv-teal/10 border-adv-teal/20',
};

const RISK_TEXT = {
  HIGH: 'text-adv-red',
  MEDIUM: 'text-adv-gold',
  LOW: 'text-adv-green',
  CLEAR: 'text-adv-teal',
};

function RiskIcon({ level }: { level: string }) {
  if (level === 'HIGH') return <XCircle className="h-5 w-5 text-adv-red" />;
  if (level === 'MEDIUM') return <AlertTriangle className="h-5 w-5 text-adv-gold" />;
  return <CheckCircle className="h-5 w-5 text-adv-green" />;
}

export function EntityIntelligencePanel({ initialQuery = '', sessionId, onContextInjected, compact = false }: Props) {
  const navigate = useNavigate();
  const [query, setQuery] = useState(initialQuery);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<EntityIntelligenceData | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runSearch() {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setData(null);

    try {
      // Run Roaring + DJ in parallel
      const isOrgNumber = /^\d{6}-?\d{4}$/.test(query.trim());
      const [roaringRes, djRes] = await Promise.allSettled([
        fetch(`/api/roaring/profile/${encodeURIComponent(query.trim())}`).then(r => r.json()),
        fetch('/api/dowjones/screen', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: query.trim(), ...(isOrgNumber ? { orgNumber: query.trim() } : {}) }),
        }).then(r => r.json()),
      ]);

      const roaringProfile = roaringRes.status === 'fulfilled' ? roaringRes.value?.profile : null;
      const djResult = djRes.status === 'fulfilled' ? djRes.value?.result : null;
      const djAM = djRes.status === 'fulfilled' ? djRes.value?.adverseMedia : null;

      const roaring: RoaringSummary | undefined = roaringProfile ? {
        entityName: roaringProfile.company?.name ?? query,
        orgNumber: roaringProfile.company?.orgNumber ?? '',
        status: roaringProfile.company?.status ?? 'UNKNOWN',
        uboCount: roaringProfile.uboChain?.totalUBOs ?? 0,
        complexityScore: roaringProfile.uboChain?.complexityScore ?? 0,
        highRiskFlags: roaringProfile.uboChain?.highRiskFlags ?? [],
        sanctionHits: roaringProfile.sanctions?.hitCount ?? 0,
        boardPepFlags: (roaringProfile.boardMembers ?? []).filter((m: { pepFlag: boolean }) => m.pepFlag).length,
        financialRisk: roaringProfile.financialRisk?.riskLevel ?? 'UNKNOWN',
        revenueChange2y: roaringProfile.financialRisk?.revenueChange2y ?? 0,
        riskScore: roaringProfile.riskScore ?? 0,
        source: roaringProfile.source ?? 'mock_demo_data',
      } : undefined;

      const dj: DJSummary | undefined = djResult ? {
        entityQueried: djResult.entityQueried ?? query,
        totalHits: djResult.hits?.length ?? 0,
        sanctionHits: (djResult.hits ?? []).filter((h: { listType: string }) => h.listType === 'SANCTIONS').length,
        pepHits: (djResult.hits ?? []).filter((h: { listType: string }) => h.listType === 'PEP').length,
        adverseMediaCount: djAM?.totalArticles ?? (djResult.hits ?? []).filter((h: { listType: string }) => h.listType === 'ADVERSE_MEDIA').length,
        soeFlag: (djResult.hits ?? []).some((h: { listType: string }) => h.listType === 'SOE'),
        riskScore: djResult.riskScore ?? 'CLEAR',
        referenceId: djResult.referenceId ?? '',
        source: djResult.source ?? 'mock_demo_data',
      } : undefined;

      // Combined risk calculation
      const flags: string[] = [];
      const amlrTriggers: string[] = [];

      if (roaring) {
        if (roaring.highRiskFlags.includes('UBO_IS_PEP')) { flags.push('UBO is PEP'); amlrTriggers.push('Art. 22 (PEP EDD)'); }
        if (roaring.sanctionHits > 0) { flags.push('Roaring sanctions hit'); amlrTriggers.push('Art. 16 (screening)'); }
        if (roaring.complexityScore > 3) flags.push('Complex ownership structure');
        if (roaring.financialRisk === 'HIGH') flags.push('High financial risk');
      }
      if (dj) {
        if (dj.sanctionHits > 0) { flags.push(`${dj.sanctionHits} DJ sanctions hit(s)`); amlrTriggers.push('Art. 16 (freeze)'); }
        if (dj.pepHits > 0) { flags.push(`${dj.pepHits} PEP match(es)`); if (!amlrTriggers.includes('Art. 22 (PEP EDD)')) amlrTriggers.push('Art. 22 (PEP EDD)'); }
        if (dj.adverseMediaCount > 0) { flags.push(`${dj.adverseMediaCount} adverse media article(s)`); amlrTriggers.push('Art. 40 (ongoing monitoring)'); }
        if (dj.soeFlag) { flags.push('SOE link identified'); amlrTriggers.push('Art. 19 (high-risk)'); }
      }

      const overallRisk: CombinedRisk['overall'] =
        (dj?.sanctionHits ?? 0) > 0 ? 'HIGH' :
        (dj?.pepHits ?? 0) > 0 ? 'HIGH' :
        flags.length >= 3 ? 'HIGH' :
        flags.length >= 1 ? 'MEDIUM' : 'CLEAR';

      const recommendation =
        overallRisk === 'HIGH' ? 'EDD required. Senior management approval. Open SAR assessment.' :
        overallRisk === 'MEDIUM' ? 'Enhanced monitoring. Review against risk appetite. Consider EDD.' :
        'Standard CDD sufficient. Set periodic review date.';

      setData({
        roaring,
        dj,
        combined: { overall: overallRisk, flags, amlrTriggers, recommendation },
        fetchedAt: new Date().toISOString(),
      });
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  function handleInjectContext() {
    if (!data || !onContextInjected) return;
    const lines = ['## ENTITY INTELLIGENCE — ' + query.toUpperCase()];
    if (data.roaring) {
      lines.push(`\n### Roaring (Swedish Registry) [${data.roaring.source === 'mock_demo_data' ? 'Mock' : 'Live'}]`);
      lines.push(`Status: ${data.roaring.status} | Reg: ${data.roaring.orgNumber}`);
      lines.push(`UBOs: ${data.roaring.uboCount} (complexity ${data.roaring.complexityScore}/5)`);
      lines.push(`Roaring risk score: ${data.roaring.riskScore}/100 | Financial: ${data.roaring.financialRisk}`);
    }
    if (data.dj) {
      lines.push(`\n### Dow Jones (Global Screening) [${data.dj.source === 'mock_demo_data' ? 'Mock' : 'Live'}]`);
      lines.push(`Sanctions hits: ${data.dj.sanctionHits} | PEP hits: ${data.dj.pepHits}`);
      lines.push(`Adverse media: ${data.dj.adverseMediaCount} article(s) | SOE: ${data.dj.soeFlag ? 'Yes' : 'No'}`);
      lines.push(`DJ Reference: ${data.dj.referenceId}`);
    }
    if (data.combined) {
      lines.push(`\n### Combined Assessment: ${data.combined.overall}`);
      if (data.combined.flags.length > 0) lines.push(`Flags: ${data.combined.flags.join(', ')}`);
      if (data.combined.amlrTriggers.length > 0) lines.push(`AMLR triggers: ${data.combined.amlrTriggers.join(', ')}`);
      lines.push(`Recommendation: ${data.combined.recommendation}`);
    }
    onContextInjected(lines.join('\n'));
  }

  const overallRisk = data?.combined?.overall ?? 'CLEAR';

  return (
    <div className="space-y-3">
      {/* Search bar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-adv-gray" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && runSearch()}
            placeholder="Company name or org number (556123-4567)…"
            className="w-full rounded-lg border border-adv-dark/60 bg-adv-dark/40 pl-9 pr-4 py-2 text-sm text-adv-off-white placeholder-adv-gray-med focus:border-adv-teal/40 focus:outline-none"
          />
        </div>
        <button
          onClick={runSearch}
          disabled={loading || !query.trim()}
          className="rounded-lg bg-adv-teal/10 border border-adv-teal/30 px-4 py-2 text-sm text-adv-teal hover:bg-adv-teal/20 disabled:opacity-50 transition-colors"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Screen'}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-adv-red/30 bg-red-900/10 px-3 py-2 text-xs text-adv-red">{error}</div>
      )}

      {data && (
        <div className="space-y-3">
          {/* Roaring panel */}
          {data.roaring && (
            <div className="rounded-lg border border-adv-dark/50 bg-adv-dark/30 p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-adv-teal">Roaring — Swedish Registry</span>
                {data.roaring.source === 'mock_demo_data' && (
                  <span className="text-[10px] text-adv-gold">Mock Demo</span>
                )}
              </div>
              <div className="space-y-1 text-xs text-adv-gray">
                <div className="flex justify-between">
                  <span>Status</span>
                  <span className={data.roaring.status === 'ACTIVE' ? 'text-adv-green' : 'text-adv-red'}>{data.roaring.status}</span>
                </div>
                <div className="flex justify-between">
                  <span>UBO / Complexity</span>
                  <span className="text-adv-off-white">{data.roaring.uboCount} UBOs · {data.roaring.complexityScore}/5</span>
                </div>
                <div className="flex justify-between">
                  <span>Board PEP flags</span>
                  <span className={data.roaring.boardPepFlags > 0 ? 'text-adv-gold' : 'text-adv-green'}>{data.roaring.boardPepFlags}</span>
                </div>
                <div className="flex justify-between">
                  <span>Financial risk</span>
                  <span className={data.roaring.financialRisk === 'HIGH' ? 'text-adv-red' : data.roaring.financialRisk === 'MEDIUM' ? 'text-adv-gold' : 'text-adv-green'}>{data.roaring.financialRisk}</span>
                </div>
              </div>
              {data.roaring.highRiskFlags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {data.roaring.highRiskFlags.map(f => (
                    <span key={f} className="rounded-full border border-adv-red/30 bg-red-900/10 px-1.5 py-0.5 text-[10px] text-adv-red">{f.replace(/_/g, ' ')}</span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* DJ panel */}
          {data.dj && (
            <div className="rounded-lg border border-adv-dark/50 bg-adv-dark/30 p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-adv-blue">Dow Jones — Global Screening</span>
                {data.dj.source === 'mock_demo_data' && (
                  <span className="text-[10px] text-adv-gold">Mock Demo</span>
                )}
              </div>
              <div className="space-y-1 text-xs text-adv-gray">
                <div className="flex justify-between">
                  <span>Sanctions</span>
                  <span className={data.dj.sanctionHits > 0 ? 'text-adv-red' : 'text-adv-green'}>{data.dj.sanctionHits > 0 ? `${data.dj.sanctionHits} hit(s)` : 'Clear ✓'}</span>
                </div>
                <div className="flex justify-between">
                  <span>PEP</span>
                  <span className={data.dj.pepHits > 0 ? 'text-adv-gold' : 'text-adv-green'}>{data.dj.pepHits > 0 ? `${data.dj.pepHits} match(es)` : 'Clear ✓'}</span>
                </div>
                <div className="flex justify-between">
                  <span>Adverse media</span>
                  <span className={data.dj.adverseMediaCount > 0 ? 'text-adv-gold' : 'text-adv-green'}>{data.dj.adverseMediaCount > 0 ? `${data.dj.adverseMediaCount} article(s)` : 'None ✓'}</span>
                </div>
                <div className="flex justify-between">
                  <span>SOE linkage</span>
                  <span className={data.dj.soeFlag ? 'text-orange-400' : 'text-adv-green'}>{data.dj.soeFlag ? 'Identified' : 'None ✓'}</span>
                </div>
              </div>
            </div>
          )}

          {/* Combined risk assessment */}
          {data.combined && (
            <div className={`rounded-lg border p-3 ${RISK_BG[overallRisk]}`}>
              <div className="flex items-center gap-2 mb-2">
                <RiskIcon level={overallRisk} />
                <span className={`text-sm font-bold ${RISK_TEXT[overallRisk]}`}>
                  {overallRisk === 'CLEAR' ? 'No significant risk flags' : `${overallRisk} — ${overallRisk === 'HIGH' ? 'EDD Required' : 'Enhanced Monitoring'}`}
                </span>
              </div>
              {data.combined.flags.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1">
                  {data.combined.flags.map(f => (
                    <span key={f} className="rounded-full bg-adv-dark/40 border border-adv-dark/60 px-1.5 py-0.5 text-[10px] text-adv-gray">{f}</span>
                  ))}
                </div>
              )}
              {data.combined.amlrTriggers.length > 0 && (
                <div className="mb-2 text-[11px] text-adv-teal">
                  AMLR: {data.combined.amlrTriggers.join(' · ')}
                </div>
              )}
              <p className="text-xs text-adv-gray">{data.combined.recommendation}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            {onContextInjected && (
              <button
                onClick={handleInjectContext}
                className="flex items-center gap-1.5 rounded-lg bg-adv-teal/10 border border-adv-teal/30 px-3 py-1.5 text-xs text-adv-teal hover:bg-adv-teal/20 transition-colors"
              >
                <Eye className="h-3.5 w-3.5" />
                Inject into session
              </button>
            )}
            <button
              onClick={() => navigate(`/entity-intelligence?q=${encodeURIComponent(query)}`)}
              className="flex items-center gap-1.5 rounded-lg bg-adv-card border border-adv-gray/20 px-3 py-1.5 text-xs text-adv-off-white hover:bg-adv-dark/60 transition-colors"
            >
              <Search className="h-3.5 w-3.5" />
              Full intelligence view
            </button>
            <button
              onClick={() => navigate('/counsels-desk')}
              className="flex items-center gap-1.5 rounded-lg bg-adv-card border border-adv-gray/20 px-3 py-1.5 text-xs text-adv-off-white hover:bg-adv-dark/60 transition-colors"
            >
              <Bell className="h-3.5 w-3.5" />
              Open EDD in Counsel's Desk
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
