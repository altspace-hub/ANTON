/**
 * PortalsDiscoveryPage — /portals/discovery
 *
 * Focused search UI for the anton-portal Pathfinder mode. Text input + filter
 * chips for verb / category / tag / language. Results below.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Filter, Globe, Loader2, AlertCircle, Wifi, RefreshCw } from 'lucide-react';
import { fetchWithAuth } from '@/lib/api';

const VERBS = ['contact', 'inquire', 'request', 'order', 'pay', 'book', 'subscribe', 'join', 'query', 'publish', 'delegate', 'authenticate'] as const;
const CATEGORIES = ['personal', 'business', 'community', 'commerce', 'team', 'creator', 'bulletin', 'classroom', 'teacher', 'organisation', 'other'] as const;

interface Hit {
  portalAddress: string;
  name: string;
  namespace: string;
  displayTitle: string | null;
  category: string;
  description: string | null;
  capabilityVerbs: string[];
  tags: string[];
  serviceAreas: string[];
  languages: string[];
  registeredAt: string | null;
  lastSeenAt: string | null;
  relevanceScore: number;
}

interface LanNeighbor {
  id: string;
  instanceName: string;
  endpoint: string;
  portalsCount: number;
  lastSeenAt: string;
  lastScanStatus: string | null;
  lastScanError: string | null;
}

interface LanScanResult {
  peersFound: number;
  peersScanned: number;
  peersUnreachable: number;
  portalsIngested: number;
  selfSkipped: boolean;
  durationMs: number;
}

export default function PortalsDiscoveryPage() {
  const [text, setText] = useState('');
  const [selVerbs, setSelVerbs] = useState<string[]>([]);
  const [selCategories, setSelCategories] = useState<string[]>([]);
  const [tagsRaw, setTagsRaw] = useState('');
  const [serviceAreasRaw, setServiceAreasRaw] = useState('');
  const [languagesRaw, setLanguagesRaw] = useState('');
  const [sortBy, setSortBy] = useState<'relevance' | 'recently_active' | 'recently_registered'>('relevance');
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // LAN discovery — separate state from registry search.
  const [neighbors, setNeighbors] = useState<LanNeighbor[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanSummary, setScanSummary] = useState<LanScanResult | null>(null);
  const [lanError, setLanError] = useState<string | null>(null);

  async function loadNeighbors() {
    try {
      const res = await fetchWithAuth('/api/portals/lan/neighbors');
      if (!res.ok) return;
      const json = await res.json() as { neighbors: LanNeighbor[] };
      setNeighbors(json.neighbors ?? []);
    } catch { /* non-fatal */ }
  }

  async function scanLan() {
    setScanning(true);
    setLanError(null);
    setScanSummary(null);
    try {
      const res = await fetchWithAuth('/api/portals/lan/scan', { method: 'POST' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `Scan failed (${res.status})`);
      }
      const json = await res.json() as LanScanResult;
      setScanSummary(json);
      await loadNeighbors();
      // If new portals were ingested, also refresh the search results so
      // they appear in the list below.
      if (json.portalsIngested > 0) await runSearch();
    } catch (e) {
      setLanError(e instanceof Error ? e.message : String(e));
    } finally {
      setScanning(false);
    }
  }

  function toggleIn(arr: string[], setArr: (v: string[]) => void, v: string) {
    setArr(arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]);
  }

  async function runSearch() {
    setBusy(true); setError(null);
    try {
      const params = new URLSearchParams();
      if (text.trim()) params.set('text', text.trim());
      if (selVerbs.length) params.set('verbs', selVerbs.join(','));
      if (selCategories.length) params.set('categories', selCategories.join(','));
      if (tagsRaw.trim()) params.set('tags', tagsRaw.split(',').map(s => s.trim()).filter(Boolean).join(','));
      if (serviceAreasRaw.trim()) params.set('serviceAreas', serviceAreasRaw.split(',').map(s => s.trim()).filter(Boolean).join(','));
      if (languagesRaw.trim()) params.set('languages', languagesRaw.split(',').map(s => s.trim()).filter(Boolean).join(','));
      params.set('sortBy', sortBy);
      params.set('limit', '50');

      const res = await fetchWithAuth(`/api/portals/search?${params}`);
      if (!res.ok) throw new Error(`Search failed (${res.status})`);
      const json = await res.json();
      setHits(json.results ?? []);
      setTotal(json.total ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    // Initial load: empty search to surface recent public portals + load
    // any LAN neighbors we've previously discovered.
    void runSearch();
    void loadNeighbors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-adv-dark text-adv-off-white p-6 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-adv-teal/10"><Search className="h-7 w-7 text-adv-teal" aria-hidden /></div>
          <div>
            <h1 className="text-2xl font-semibold">Discover portals</h1>
            <p className="text-sm text-adv-gray mt-1 max-w-2xl">
              Search the local registry of public-indexed portals. Filter by capability, category, tag, service area, or language.
            </p>
          </div>
        </header>

        {/* LAN discovery — peer ANTONs found via mDNS on the local network.
            These are unmediated by any registry: just two boxes on the same
            Wi-Fi recognising each other. Layer 3 of the vision. */}
        <section className="rounded-xl border border-border bg-adv-card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Wifi className="h-4 w-4 text-adv-teal" aria-hidden />
              <h2 className="text-sm font-medium">On your LAN</h2>
              <span className="text-xs text-adv-gray">
                {neighbors.length === 0 ? 'No peers yet' : `${neighbors.length} peer${neighbors.length === 1 ? '' : 's'}`}
              </span>
            </div>
            <button
              type="button"
              onClick={() => void scanLan()}
              disabled={scanning}
              className="px-3 py-1.5 rounded-lg border border-adv-teal/40 text-adv-teal hover:bg-adv-teal/10 transition disabled:opacity-50 flex items-center gap-2 text-sm"
              aria-label="Scan the local network for peer ANTON instances"
            >
              {scanning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              {scanning ? 'Scanning…' : 'Scan LAN'}
            </button>
          </div>
          {lanError && (
            <div className="mb-3 flex items-start gap-2 rounded-lg border border-adv-red/40 bg-adv-red/10 p-2 text-xs">
              <AlertCircle className="h-3.5 w-3.5 text-adv-red flex-shrink-0 mt-0.5" /> {lanError}
            </div>
          )}
          {scanSummary && (
            <div className="mb-3 text-xs text-adv-gray">
              Found {scanSummary.peersFound} peer{scanSummary.peersFound === 1 ? '' : 's'} ·
              scanned {scanSummary.peersScanned} ·
              ingested {scanSummary.portalsIngested} portal{scanSummary.portalsIngested === 1 ? '' : 's'} ·
              {scanSummary.peersUnreachable > 0 && ` ${scanSummary.peersUnreachable} unreachable · `}
              {scanSummary.durationMs}ms
            </div>
          )}
          {neighbors.length === 0 ? (
            <p className="text-xs text-adv-gray">
              Set <code className="text-adv-teal">APP_GATEWAY_MDNS=true</code> on every ANTON you want to be discoverable, then click <span className="text-adv-off-white">Scan LAN</span>. Peers are matched by mDNS — no registry, no internet.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {neighbors.map((n) => (
                <li key={n.id} className="flex items-center justify-between gap-3 text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`h-2 w-2 rounded-full flex-shrink-0 ${
                      n.lastScanStatus === 'ok' ? 'bg-adv-green'
                      : n.lastScanStatus === 'unreachable' ? 'bg-adv-red'
                      : 'bg-adv-gray'
                    }`} aria-hidden />
                    <span className="truncate">{n.instanceName}</span>
                    <code className="text-xs text-adv-gray truncate">{n.endpoint}</code>
                  </div>
                  <span className="text-xs text-adv-gray flex-shrink-0">
                    {n.portalsCount} portal{n.portalsCount === 1 ? '' : 's'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Search box */}
        <form
          onSubmit={(e) => { e.preventDefault(); void runSearch(); }}
          className="rounded-xl border border-border bg-adv-card p-4 space-y-3"
        >
          <div className="flex gap-2">
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="catering · running club · tickets · plumber…"
              className="flex-1 rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm focus:border-adv-teal focus:outline-none"
            />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm focus:border-adv-teal focus:outline-none"
            >
              <option value="relevance">Relevance</option>
              <option value="recently_active">Recently active</option>
              <option value="recently_registered">Recently registered</option>
            </select>
            <button
              type="submit"
              disabled={busy}
              className="px-4 py-2 rounded-lg bg-adv-teal text-adv-dark text-sm font-medium hover:bg-adv-teal-dark transition disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : 'Search'}
            </button>
          </div>

          {/* Filters — show active count when collapsed so the user knows
              filters are constraining the results. */}
          <details className="text-sm">
            <summary className="cursor-pointer text-adv-gray hover:text-adv-off-white flex items-center gap-1.5">
              <Filter className="h-3.5 w-3.5" /> Filters
              {(() => {
                const n = selVerbs.length + selCategories.length
                  + (tagsRaw.trim() ? 1 : 0)
                  + (serviceAreasRaw.trim() ? 1 : 0)
                  + (languagesRaw.trim() ? 1 : 0);
                return n > 0 ? <span className="ml-1 rounded-full bg-adv-teal/20 px-1.5 text-xs text-adv-teal">{n}</span> : null;
              })()}
            </summary>
            <div className="mt-3 space-y-3">
              <div>
                <div className="text-xs text-adv-gray mb-1">Capability verbs (any)</div>
                <div className="flex flex-wrap gap-1">
                  {VERBS.map(v => (
                    <button type="button" key={v}
                      onClick={() => toggleIn(selVerbs, setSelVerbs, v)}
                      className={`px-2 py-1 rounded text-xs transition ${selVerbs.includes(v) ? 'bg-adv-teal text-adv-dark' : 'bg-adv-dark text-adv-gray hover:text-adv-off-white border border-border'}`}
                    >{v}</button>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-xs text-adv-gray mb-1">Categories (any)</div>
                <div className="flex flex-wrap gap-1">
                  {CATEGORIES.map(v => (
                    <button type="button" key={v}
                      onClick={() => toggleIn(selCategories, setSelCategories, v)}
                      className={`px-2 py-1 rounded text-xs transition ${selCategories.includes(v) ? 'bg-adv-teal text-adv-dark' : 'bg-adv-dark text-adv-gray hover:text-adv-off-white border border-border'}`}
                    >{v}</button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <label className="block">
                  <span className="block text-xs text-adv-gray mb-1">Tags (CSV)</span>
                  <input value={tagsRaw} onChange={(e) => setTagsRaw(e.target.value)} placeholder="catering, stockholm"
                    className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm focus:border-adv-teal focus:outline-none" />
                </label>
                <label className="block">
                  <span className="block text-xs text-adv-gray mb-1">Service areas (ISO 3166)</span>
                  <input value={serviceAreasRaw} onChange={(e) => setServiceAreasRaw(e.target.value)} placeholder="SE-AB, NG-LA"
                    className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm focus:border-adv-teal focus:outline-none" />
                </label>
                <label className="block">
                  <span className="block text-xs text-adv-gray mb-1">Languages (BCP 47)</span>
                  <input value={languagesRaw} onChange={(e) => setLanguagesRaw(e.target.value)} placeholder="en, sv"
                    className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm focus:border-adv-teal focus:outline-none" />
                </label>
              </div>
            </div>
          </details>
        </form>

        {/* Results */}
        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-adv-red/40 bg-adv-red/10 p-3 text-sm">
            <AlertCircle className="h-4 w-4 text-adv-red flex-shrink-0 mt-0.5" /> {error}
          </div>
        )}
        {hits !== null && (
          <section>
            <div className="flex items-baseline justify-between mb-2">
              <h2 className="text-sm uppercase tracking-wide text-adv-gray">Results</h2>
              <span className="text-xs text-adv-gray">{total} total</span>
            </div>
            {hits.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-adv-card p-8 text-center text-sm text-adv-gray">
                No portals match the current filters. Try widening the search.
              </div>
            ) : (
              <ul className="space-y-2">
                {hits.map((h) => (
                  <li key={h.portalAddress}>
                    <Link
                      to={`/portals/p/${encodeURIComponent(h.portalAddress)}`}
                      className="block rounded-lg border border-border bg-adv-card p-3 hover:border-adv-teal transition"
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <div>
                          <div className="font-medium">{h.displayTitle ?? h.portalAddress}</div>
                          <code className="text-xs text-adv-teal">{h.portalAddress}</code>
                        </div>
                        <span className="text-xs text-adv-gray">{h.category}</span>
                      </div>
                      {h.description && <p className="text-xs text-adv-gray mt-1">{h.description}</p>}
                      {h.capabilityVerbs.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {h.capabilityVerbs.map((v) => (
                            <span key={v} className="px-2 py-0.5 rounded bg-adv-teal/10 text-adv-teal text-xs">{v}</span>
                          ))}
                        </div>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
