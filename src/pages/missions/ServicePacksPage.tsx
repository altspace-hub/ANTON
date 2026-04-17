/**
 * ServicePacksPage — browse Service Packs (Phase 2).
 * Phase 2: read + health view. Future: import .anton bundles + test workflows.
 */

import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Package, RefreshCcw, AlertCircle, ChevronLeft, Globe, Code2, Zap } from 'lucide-react';
import { fetchWithAuth, getAuthHeader } from '../../lib/api';

type InteractionType = 'browser' | 'api' | 'mcp' | 'hybrid';
type SelectorHealth = 'healthy' | 'degraded' | 'broken' | 'unverified';

interface ServicePackSummary {
  id: string;
  service_id: string;
  service_name: string;
  version: string;
  author: string | null;
  description: string | null;
  category: string | null;
  interaction_type: InteractionType;
  selectors_health: SelectorHealth;
  total_uses: number;
  fallback_count: number;
  is_builtin: boolean;
  workflow_count: number;
  page_count: number;
}

const INTERACTION_ICON: Record<InteractionType, React.ReactNode> = {
  browser: <Globe className="h-3.5 w-3.5" />,
  api: <Code2 className="h-3.5 w-3.5" />,
  mcp: <Zap className="h-3.5 w-3.5" />,
  hybrid: <Globe className="h-3.5 w-3.5" />,
};

const HEALTH_CLASSES: Record<SelectorHealth, string> = {
  healthy: 'text-adv-green border-adv-green/40 bg-adv-green/10',
  degraded: 'text-adv-gold border-adv-gold/40 bg-adv-gold/10',
  broken: 'text-adv-red border-adv-red/40 bg-adv-red/10',
  unverified: 'text-adv-gray border-border bg-adv-dark',
};

export default function ServicePacksPage() {
  const [packs, setPacks] = useState<ServicePackSummary[]>([]);
  const [playwrightInstalled, setPlaywrightInstalled] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [packsRes, healthRes] = await Promise.all([
        fetchWithAuth('/api/service-packs', { headers: getAuthHeader() }),
        fetchWithAuth('/api/browser-sessions/health', { headers: getAuthHeader() }),
      ]);
      const packsData = await packsRes.json();
      if (!packsRes.ok) throw new Error(packsData?.error || `HTTP ${packsRes.status}`);
      setPacks(packsData.packs ?? []);
      const healthData = await healthRes.json();
      if (healthRes.ok) setPlaywrightInstalled(!!healthData.playwright_installed);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const grouped = packs.reduce<Record<string, ServicePackSummary[]>>((acc, p) => {
    const cat = p.category ?? 'Uncategorised';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(p);
    return acc;
  }, {});

  return (
    <div className="mx-auto max-w-5xl p-6 space-y-5">
      <Link to="/missions" className="inline-flex items-center gap-1 text-xs text-adv-gray hover:text-adv-teal">
        <ChevronLeft className="h-3.5 w-3.5" />
        Back to Missions
      </Link>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-3">
            <Package className="h-7 w-7 text-adv-teal" />
            <h1 className="text-2xl font-semibold text-adv-off-white">Service Packs</h1>
          </div>
          <p className="mt-1 text-sm text-adv-gray max-w-2xl">
            Pre-built blueprints describing how a specific website or API works. When ANTON has a pack
            for a service, it executes workflows directly — no LLM-guided navigation needed.
          </p>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="rounded-lg border border-border px-3 py-1.5 text-xs text-adv-gray hover:text-adv-off-white inline-flex items-center gap-1.5 disabled:opacity-50"
        >
          <RefreshCcw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {playwrightInstalled === false && (
        <div className="rounded-xl border border-adv-gold/30 bg-adv-gold/10 px-4 py-3 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-adv-gold shrink-0 mt-0.5" />
          <div className="flex-1 text-xs">
            <p className="text-adv-gold font-medium">Playwright is not installed</p>
            <p className="mt-1 text-adv-gold/80">
              Browser-based Service Packs require Playwright. To enable the Action Layer, run:
            </p>
            <pre className="mt-2 rounded bg-adv-dark border border-adv-gold/30 p-2 text-[11px] text-adv-off-white font-mono">
              pnpm add playwright{'\n'}npx playwright install chromium
            </pre>
            <p className="mt-2 text-adv-gold/80">API-only packs (e.g. EUR-Lex via REST) work without Playwright.</p>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-adv-red/30 bg-adv-red/10 px-4 py-3 text-sm text-adv-red flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {Object.keys(grouped).length === 0 && !loading ? (
        <div className="rounded-xl border border-dashed border-border bg-adv-card/50 p-8 text-center text-sm text-adv-gray">
          No Service Packs registered. Built-in packs auto-load from <code>data/service-packs/</code> on first request.
        </div>
      ) : (
        Object.entries(grouped).map(([category, items]) => (
          <section key={category}>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-adv-teal">{category}</h2>
            <ul className="space-y-2">
              {items.map(p => (
                <li key={p.id} className="rounded-xl border border-border bg-adv-card px-4 py-3 flex items-start gap-3">
                  <Package className="h-5 w-5 text-adv-teal shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-adv-off-white">{p.service_name}</span>
                      <span className="text-[10px] text-adv-gray">v{p.version}</span>
                      <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium ${HEALTH_CLASSES[p.selectors_health]}`}>
                        {p.selectors_health}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[10px] text-adv-gray">
                        {INTERACTION_ICON[p.interaction_type]}
                        {p.interaction_type}
                      </span>
                      {p.is_builtin && <span className="text-[10px] text-adv-teal uppercase font-medium">Built-in</span>}
                    </div>
                    {p.description && <p className="mt-1 text-xs text-adv-gray line-clamp-2">{p.description}</p>}
                    <div className="mt-1.5 flex items-center gap-3 text-[11px] text-adv-gray/80">
                      <span>{p.workflow_count} workflow{p.workflow_count === 1 ? '' : 's'}</span>
                      <span>·</span>
                      <span>{p.page_count} page map{p.page_count === 1 ? '' : 's'}</span>
                      <span>·</span>
                      <span>{p.total_uses} use{p.total_uses === 1 ? '' : 's'}</span>
                      {p.fallback_count > 0 && (<><span>·</span><span className="text-adv-gold">{p.fallback_count} LLM fallback{p.fallback_count === 1 ? '' : 's'}</span></>)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
