/**
 * CurriculumRegistryPage — admin surface for the per-country curriculum registry.
 * Teachers consult; admins maintain.
 *
 * Shipped per ANTON_Improvement_and_Investigation_Brief.md §E.3.
 * Backed by table `curriculum_registry` (mig 168). Seeded with 5 countries
 * (SE / UK / US / IN / KE) — 25-country expansion is a follow-up.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, Globe2, Library } from 'lucide-react';
import { getAuthHeader } from '../../lib/api';

interface CurriculumRow {
  id: string;
  country_code: string;
  jurisdiction: string | null;
  subject: string;
  year_level: string;
  learning_objective_code: string;
  learning_objective_text: string;
  source_url: string | null;
  last_verified_at: string;
  is_active: boolean;
}

export default function CurriculumRegistryPage() {
  const [rows, setRows] = useState<CurriculumRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterCountry, setFilterCountry] = useState<string>('');
  const [filterSubject, setFilterSubject] = useState<string>('');
  const [showInactive, setShowInactive] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/school/curriculum', { headers: getAuthHeader() })
      .then(async r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: { entries: CurriculumRow[] }) => { if (!cancelled) setRows(data.entries ?? []); })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const countries = useMemo(() => Array.from(new Set(rows.map(r => r.country_code))).sort(), [rows]);
  const subjects = useMemo(() => Array.from(new Set(rows.map(r => r.subject))).sort(), [rows]);
  const filtered = rows
    .filter(r => !filterCountry || r.country_code === filterCountry)
    .filter(r => !filterSubject || r.subject === filterSubject)
    .filter(r => showInactive || r.is_active);

  return (
    <div className="min-h-screen bg-adv-dark text-adv-off-white">
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <Link to="/school" className="text-adv-gray hover:text-adv-teal" aria-label="Back">
            <ChevronLeft size={20} />
          </Link>
          <Library className="text-adv-teal" size={24} />
          <div>
            <h1 className="text-2xl font-semibold">Curriculum Registry</h1>
            <p className="text-adv-gray text-sm">
              Per-country / per-jurisdiction learning objectives. Used by School-mode prompts to
              align lesson plans + assessments to local curriculum.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          <select
            value={filterCountry}
            onChange={e => setFilterCountry(e.target.value)}
            className="bg-adv-card border border-adv-card px-3 py-2 rounded text-sm"
          >
            <option value="">All countries</option>
            {countries.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select
            value={filterSubject}
            onChange={e => setFilterSubject(e.target.value)}
            className="bg-adv-card border border-adv-card px-3 py-2 rounded text-sm"
          >
            <option value="">All subjects</option>
            {subjects.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <label className="ml-auto inline-flex items-center gap-1 text-sm text-adv-gray">
            <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
            Show inactive
          </label>
        </div>

        {error && <div className="bg-adv-red/10 text-adv-red p-3 rounded mb-3">{error}</div>}
        {loading ? (
          <div className="text-adv-gray text-center py-12">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="bg-adv-card rounded-lg p-8 text-adv-gray text-center">
            No curriculum entries match the current filters. Seed loaded 5 countries (SE/UK/US/IN/KE).
            Expand via <code>POST /api/school/curriculum</code> or import a regulatory-knowledge-pack
            bundle that targets the registry.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-adv-card text-adv-gray">
                <tr>
                  <th className="text-left p-2"><Globe2 size={12} className="inline" /> Country</th>
                  <th className="text-left p-2">Jurisdiction</th>
                  <th className="text-left p-2">Subject</th>
                  <th className="text-left p-2">Year</th>
                  <th className="text-left p-2">Code</th>
                  <th className="text-left p-2">Objective</th>
                  <th className="text-left p-2">Verified</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id} className="border-b border-adv-card hover:bg-adv-card/40">
                    <td className="p-2 font-mono">{r.country_code}</td>
                    <td className="p-2 text-adv-gray">{r.jurisdiction ?? '—'}</td>
                    <td className="p-2">{r.subject}</td>
                    <td className="p-2">{r.year_level}</td>
                    <td className="p-2"><code className="text-adv-teal text-xs">{r.learning_objective_code}</code></td>
                    <td className="p-2">{r.learning_objective_text}</td>
                    <td className="p-2 text-xs text-adv-gray">{new Date(r.last_verified_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-6 text-xs text-adv-gray">
          Table: <code>curriculum_registry</code> (mig 168). Source URLs link to the canonical
          national-curriculum publication for each entry.
        </div>
      </div>
    </div>
  );
}
