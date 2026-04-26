/**
 * ProcureVendorDirectoryPage — searchable vendor catalogue.
 * Phase B.2 build-out (Procure pillar).
 */

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, Building2, Globe2, ShieldCheck } from 'lucide-react';
import { getAuthHeader } from '../../lib/api';

interface Vendor {
  id: string;
  name: string;
  description: string | null;
  website: string | null;
  category: string;
  jurisdictions: string[] | null;
  certifications: string[] | null;
  size_band: 'startup' | 'sme' | 'mid' | 'enterprise' | null;
  trust_score: number | null;
}

export default function ProcureVendorDirectoryPage() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [filterCategory, setFilterCategory] = useState<string>('');
  const [filterJurisdiction, setFilterJurisdiction] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/procure/vendors', { headers: getAuthHeader() })
      .then(r => r.json())
      .then((data: { vendors?: Vendor[] }) => setVendors(data.vendors ?? []))
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load vendors'))
      .finally(() => setLoading(false));
  }, []);

  const categories    = useMemo(() => Array.from(new Set(vendors.map(v => v.category))).sort(), [vendors]);
  const jurisdictions = useMemo(() => Array.from(new Set(vendors.flatMap(v => v.jurisdictions ?? []))).sort(), [vendors]);
  const filtered = vendors
    .filter(v => !filterCategory     || v.category === filterCategory)
    .filter(v => !filterJurisdiction || v.jurisdictions?.includes(filterJurisdiction));

  return (
    <div className="min-h-screen bg-adv-dark text-adv-off-white">
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <Link to="/procure" className="text-adv-gray hover:text-adv-teal" aria-label="Back"><ChevronLeft size={20} /></Link>
          <Building2 className="text-adv-teal" size={24} />
          <div>
            <h1 className="text-2xl font-semibold">Vendor directory</h1>
            <p className="text-adv-gray text-sm">Searchable vendor catalogue. Trust scores are operator-curated; certifications are vendor-claimed (verify before use).</p>
          </div>
        </div>

        <div className="flex gap-2 mb-4">
          <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
            className="bg-adv-card border border-adv-card px-3 py-2 rounded text-sm">
            <option value="">All categories</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={filterJurisdiction} onChange={e => setFilterJurisdiction(e.target.value)}
            className="bg-adv-card border border-adv-card px-3 py-2 rounded text-sm">
            <option value="">All jurisdictions</option>
            {jurisdictions.map(j => <option key={j} value={j}>{j}</option>)}
          </select>
        </div>

        {error && <div className="bg-adv-red/10 text-adv-red p-3 rounded mb-3">{error}</div>}

        {loading ? (
          <div className="text-center text-adv-gray py-12">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="bg-adv-card rounded-lg p-8 text-center text-adv-gray">
            No vendors match. Seed includes 3 vendors (Anthropic, AWS, Stripe). Add more via <code>POST /api/procure/vendors</code>.
          </div>
        ) : (
          <ul className="space-y-2">
            {filtered.map(v => (
              <li key={v.id} className="bg-adv-card rounded-lg p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <code className="text-adv-teal text-xs">{v.category}</code>
                      {v.size_band && <span className="text-xs text-adv-gray">{v.size_band}</span>}
                      {v.trust_score != null && (
                        <span className="text-xs text-adv-gray flex items-center gap-1">
                          <ShieldCheck size={12} /> {(v.trust_score * 100).toFixed(0)}%
                        </span>
                      )}
                    </div>
                    <div className="font-medium">{v.name}</div>
                    {v.description && <p className="text-sm text-adv-gray mt-1">{v.description}</p>}
                    {v.jurisdictions && v.jurisdictions.length > 0 && (
                      <p className="text-xs text-adv-gray mt-1 flex items-center gap-1">
                        <Globe2 size={12} /> {v.jurisdictions.join(', ')}
                      </p>
                    )}
                    {v.certifications && v.certifications.length > 0 && (
                      <p className="text-xs text-adv-gray mt-1">
                        Certs: {v.certifications.join(' · ')}
                      </p>
                    )}
                  </div>
                  {v.website && (
                    <a href={v.website} target="_blank" rel="noopener noreferrer"
                       className="text-xs text-adv-teal hover:underline">website →</a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
