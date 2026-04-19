/**
 * PortalsLandingPage — /portals
 *
 * Landing surface for the Portals area. Three sections:
 *   1. The user's own portals (status, address, page count, inbox count)
 *   2. The 7-template gallery — clicking a template starts the walkthrough
 *   3. Discovery search box (anton-portal Pathfinder mode)
 */

import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Globe, Plus, Search, Loader2, AlertCircle, Inbox, Layers } from 'lucide-react';
import { fetchWithAuth } from '@/lib/api';

interface PortalRow {
  id: string;
  name: string;
  namespace: string;
  display_title: string | null;
  category: string;
  status: string;
  public_index: boolean;
  registered_at: string | null;
  last_synced_at: string | null;
  created_at: string;
}

interface Template {
  id: string;
  label: string;
  description: string;
  recommendedCategory: string;
}

interface SearchHit {
  portalAddress: string;
  displayTitle: string | null;
  category: string;
  description: string | null;
  capabilityVerbs: string[];
  tags: string[];
}

export default function PortalsLandingPage() {
  const navigate = useNavigate();
  const [portals, setPortals] = useState<PortalRow[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [searchText, setSearchText] = useState('');
  const [searchHits, setSearchHits] = useState<SearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [portalsRes, templatesRes] = await Promise.all([
          fetchWithAuth('/api/portals'),
          fetchWithAuth('/api/portals/templates'),
        ]);
        if (!portalsRes.ok) throw new Error(`Failed to load portals (${portalsRes.status})`);
        if (!templatesRes.ok) throw new Error(`Failed to load templates (${templatesRes.status})`);
        const portalsJson = await portalsRes.json();
        const templatesJson = await templatesRes.json();
        if (cancelled) return;
        setPortals(portalsJson.portals ?? []);
        setTemplates(templatesJson.templates ?? []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function runSearch(text: string) {
    setSearching(true);
    setSearchHits(null);
    try {
      const params = new URLSearchParams({ text, limit: '20' });
      const res = await fetchWithAuth(`/api/portals/search?${params}`);
      if (res.ok) {
        const json = await res.json();
        setSearchHits(json.results ?? []);
      } else {
        setSearchHits([]);
      }
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="min-h-screen bg-adv-dark text-adv-off-white p-6 md:p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <header className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-adv-teal/10">
              <Globe className="h-7 w-7 text-adv-teal" aria-hidden />
            </div>
            <div>
              <h1 className="text-2xl font-semibold">Portals</h1>
              <p className="text-sm text-adv-gray mt-1 max-w-2xl">
                Conversationally-built ANTON-only web spaces. Each portal is both a human-facing site
                and a machine-readable AAP endpoint. Build one in minutes; visitors reach you without DNS.
              </p>
            </div>
          </div>
        </header>

        {/* Discovery search */}
        <section className="rounded-xl border border-border bg-adv-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <Search className="h-4 w-4 text-adv-teal" aria-hidden />
            <h2 className="text-sm font-medium uppercase tracking-wide text-adv-gray">Find a portal</h2>
          </div>
          <form
            onSubmit={(e) => { e.preventDefault(); if (searchText.trim()) void runSearch(searchText.trim()); }}
            className="flex gap-2"
          >
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="catering in stockholm · running club · order tickets…"
              className="flex-1 rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none"
            />
            <button
              type="submit"
              disabled={searching}
              className="px-4 py-2 rounded-lg bg-adv-teal text-adv-dark text-sm font-medium hover:bg-adv-teal-dark transition disabled:opacity-50"
            >
              {searching ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : 'Search'}
            </button>
          </form>
          {searchHits !== null && (
            <div className="mt-4">
              {searchHits.length === 0 ? (
                <p className="text-sm text-adv-gray">No portals found in the local registry. Try a different search.</p>
              ) : (
                <ul className="space-y-2">
                  {searchHits.map((hit) => (
                    <li key={hit.portalAddress}>
                      <Link
                        to={`/portals/p/${encodeURIComponent(hit.portalAddress)}`}
                        className="block rounded-lg border border-border bg-adv-dark p-3 hover:border-adv-teal transition"
                      >
                        <div className="flex items-baseline justify-between gap-3">
                          <div>
                            <div className="font-medium">{hit.displayTitle ?? hit.portalAddress}</div>
                            <code className="text-xs text-adv-teal">{hit.portalAddress}</code>
                          </div>
                          <span className="text-xs text-adv-gray">{hit.category}</span>
                        </div>
                        {hit.description && <p className="text-xs text-adv-gray mt-1">{hit.description}</p>}
                        {hit.capabilityVerbs.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {hit.capabilityVerbs.map((v) => (
                              <span key={v} className="px-2 py-0.5 rounded bg-adv-teal/10 text-adv-teal text-xs">{v}</span>
                            ))}
                          </div>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>

        {/* Owner's portals */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium uppercase tracking-wide text-adv-gray">Your portals</h2>
            <span className="text-xs text-adv-gray">{portals.length} total</span>
          </div>
          {loading ? (
            <div className="flex items-center gap-2 text-adv-gray text-sm"><Loader2 className="h-4 w-4 animate-spin" />Loading…</div>
          ) : error ? (
            <div className="flex items-start gap-2 rounded-lg border border-adv-red/40 bg-adv-red/10 p-3 text-sm">
              <AlertCircle className="h-4 w-4 text-adv-red flex-shrink-0 mt-0.5" />{error}
            </div>
          ) : portals.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-adv-card p-8 text-center">
              <Globe className="h-10 w-10 text-adv-gray mx-auto mb-3" />
              <p className="text-adv-gray text-sm">You haven't built any portals yet. Pick a template below to start.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {portals.map((p) => (
                <Link
                  key={p.id}
                  to={`/portals/${p.id}/manage`}
                  className="rounded-xl border border-border bg-adv-card p-4 hover:border-adv-teal transition"
                >
                  <div className="flex items-baseline justify-between gap-2 mb-2">
                    <div className="font-medium">{p.display_title ?? p.name}</div>
                    <StatusBadge status={p.status} />
                  </div>
                  <code className="text-xs text-adv-teal">{p.name}.{p.namespace}.portal</code>
                  <div className="mt-3 flex items-center gap-3 text-xs text-adv-gray">
                    <span className="px-2 py-0.5 rounded bg-adv-dark">{p.category}</span>
                    {p.public_index && <span className="text-adv-teal">discoverable</span>}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Template gallery */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Layers className="h-4 w-4 text-adv-teal" aria-hidden />
            <h2 className="text-sm font-medium uppercase tracking-wide text-adv-gray">Build a new portal</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {templates.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => navigate(`/portals/build/${t.id}`)}
                className="text-left rounded-xl border border-border bg-adv-card p-4 hover:border-adv-teal transition"
              >
                <div className="flex items-center gap-2 mb-2">
                  <Plus className="h-4 w-4 text-adv-teal" aria-hidden />
                  <div className="font-medium">{t.label}</div>
                </div>
                <p className="text-xs text-adv-gray leading-relaxed">{t.description}</p>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === 'active' ? 'bg-adv-green/15 text-adv-green' :
    status === 'draft' ? 'bg-adv-gray/15 text-adv-gray' :
    status === 'suspended' ? 'bg-adv-red/15 text-adv-red' :
    status === 'revoked' ? 'bg-adv-red/15 text-adv-red' :
    'bg-adv-gray/15 text-adv-gray';
  return <span className={`px-2 py-0.5 rounded text-xs ${cls}`}>{status}</span>;
}
