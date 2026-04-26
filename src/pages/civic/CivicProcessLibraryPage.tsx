/**
 * CivicProcessLibraryPage — browse jurisdiction-bundled civic process packs.
 * Phase B.1 build-out.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, Library, Globe2 } from 'lucide-react';
import { getAuthHeader } from '../../lib/api';

interface ProcessPack {
  id: string;
  name: string;
  description: string | null;
  jurisdiction: string;
  authority: string | null;
  domain: string | null;
  version: string;
  source_url: string | null;
}

export default function CivicProcessLibraryPage() {
  const [packs, setPacks] = useState<ProcessPack[]>([]);
  const [filterJurisdiction, setFilterJurisdiction] = useState<string>('');
  const [filterDomain, setFilterDomain] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/civic/process-packs', { headers: getAuthHeader() })
      .then(r => r.json())
      .then((data: { packs?: ProcessPack[] }) => setPacks(data.packs ?? []))
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load packs'))
      .finally(() => setLoading(false));
  }, []);

  const jurisdictions = useMemo(() => Array.from(new Set(packs.map(p => p.jurisdiction))).sort(), [packs]);
  const domains       = useMemo(() => Array.from(new Set(packs.map(p => p.domain).filter(Boolean) as string[])).sort(), [packs]);

  const filtered = packs
    .filter(p => !filterJurisdiction || p.jurisdiction === filterJurisdiction)
    .filter(p => !filterDomain       || p.domain === filterDomain);

  return (
    <div className="min-h-screen bg-adv-dark text-adv-off-white">
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <Link to="/civic" className="text-adv-gray hover:text-adv-teal" aria-label="Back"><ChevronLeft size={20} /></Link>
          <Library className="text-adv-teal" size={24} />
          <div>
            <h1 className="text-2xl font-semibold">Process library</h1>
            <p className="text-adv-gray text-sm">Per-country / per-jurisdiction civic process packs. Each pack bundles eligibility rules + process descriptions for a domain.</p>
          </div>
        </div>

        <div className="flex gap-2 mb-4">
          <select value={filterJurisdiction} onChange={e => setFilterJurisdiction(e.target.value)}
            className="bg-adv-card border border-adv-card px-3 py-2 rounded text-sm">
            <option value="">All jurisdictions</option>
            {jurisdictions.map(j => <option key={j} value={j}>{j}</option>)}
          </select>
          <select value={filterDomain} onChange={e => setFilterDomain(e.target.value)}
            className="bg-adv-card border border-adv-card px-3 py-2 rounded text-sm">
            <option value="">All domains</option>
            {domains.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>

        {error && <div className="bg-adv-red/10 text-adv-red p-3 rounded mb-3">{error}</div>}

        {loading ? (
          <div className="text-center text-adv-gray py-12">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="bg-adv-card rounded-lg p-8 text-center text-adv-gray">
            No packs match. The seed includes 3 packs (SE tax, UK business reg, US-CA benefits). Import additional packs as <code>.anton civic-process-pack</code> bundles or via <code>POST /api/civic/process-packs</code>.
          </div>
        ) : (
          <ul className="space-y-2">
            {filtered.map(p => (
              <li key={p.id} className="bg-adv-card rounded-lg p-4">
                <div className="flex items-start gap-2 mb-1">
                  <Globe2 size={14} className="text-adv-gray mt-1" />
                  <code className="text-adv-teal text-xs">{p.jurisdiction}</code>
                  {p.domain && <span className="text-xs text-adv-gray">· {p.domain}</span>}
                  <span className="text-xs text-adv-gray ml-auto">v{p.version}</span>
                </div>
                <div className="font-medium">{p.name}</div>
                {p.description && <p className="text-sm text-adv-gray mt-1">{p.description}</p>}
                {p.authority && <p className="text-xs text-adv-gray mt-1">Authority: {p.authority}</p>}
                {p.source_url && (
                  <a href={p.source_url} target="_blank" rel="noopener noreferrer"
                     className="text-xs text-adv-teal hover:underline">
                    Canonical source →
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
