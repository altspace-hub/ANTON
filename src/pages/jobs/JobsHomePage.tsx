// ── JobsHomePage.tsx ───────────────────────────────────────────────────────
// Candidate-side Jobs landing at /jobs. Search + filters + result list.
// Salary range is always shown per EU Pay Transparency Directive.

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Briefcase, MapPin, BookmarkPlus } from 'lucide-react';
import { fetchWithAuth } from '@/lib/api';

interface JobCard {
  id: string;
  title: string;
  organisation: string | null;
  location: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  remote_mode: string | null;
  created_at: string;
}

export default function JobsHomePage() {
  const [q, setQ] = useState('');
  const [location, setLocation] = useState('');
  const [jobs, setJobs] = useState<JobCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasProfile, setHasProfile] = useState<boolean | null>(null);

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set('q', q.trim());
      if (location.trim()) params.set('location', location.trim());
      const res = await fetchWithAuth(`/api/jobs${params.toString() ? '?' + params.toString() : ''}`);
      if (res.ok) {
        const json = await res.json() as { jobs: JobCard[] };
        setJobs(json.jobs ?? []);
      }
    } finally { setLoading(false); }
  }

  useEffect(() => {
    void load();
    (async () => {
      try {
        const res = await fetchWithAuth('/api/jobs/profile');
        if (res.ok) {
          const json = await res.json() as { profile: unknown };
          setHasProfile(!!json.profile);
        }
      } catch { setHasProfile(false); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-adv-dark text-adv-off-white">
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <header className="flex items-center gap-3">
          <Briefcase size={22} className="text-adv-teal" />
          <div>
            <h1 className="text-2xl font-semibold">Jobs</h1>
            <p className="text-xs text-adv-gray">Transparent hiring or none at all.</p>
          </div>
        </header>

        {hasProfile === false && (
          <section className="rounded-lg border border-adv-gold/40 bg-adv-gold/5 p-4 flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Build your portable career profile</div>
              <div className="text-xs text-adv-gray">Upload a CV or answer a short guided conversation — export anywhere as an .anton bundle.</div>
            </div>
            <Link to="/jobs/profile" className="px-4 py-2 bg-adv-teal text-adv-dark rounded text-sm font-medium">
              Start profile
            </Link>
          </section>
        )}

        <form
          onSubmit={(e) => { e.preventDefault(); void load(); }}
          className="grid grid-cols-1 md:grid-cols-3 gap-2"
        >
          <div className="relative md:col-span-2">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-adv-gray" />
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Role, keyword…"
              className="w-full bg-adv-card border border-border rounded pl-10 pr-4 py-2 text-sm outline-none focus:ring-1 focus:ring-adv-teal"
            />
          </div>
          <div className="relative">
            <MapPin size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-adv-gray" />
            <input
              value={location}
              onChange={e => setLocation(e.target.value)}
              placeholder="Location"
              className="w-full bg-adv-card border border-border rounded pl-10 pr-4 py-2 text-sm outline-none focus:ring-1 focus:ring-adv-teal"
            />
          </div>
        </form>

        {loading && <div className="text-sm text-adv-gray">Searching…</div>}
        {!loading && jobs.length === 0 && (
          <div className="rounded-lg border border-border bg-adv-card p-6 text-center text-adv-gray text-sm">
            No open jobs matching your filters. Try clearing them.
          </div>
        )}
        <ul className="space-y-3">
          {jobs.map(j => (
            <li key={j.id}>
              <Link
                to={`/jobs/${j.id}`}
                className="block rounded-lg border border-border bg-adv-card p-4 hover:border-adv-teal transition"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="text-base font-medium">{j.title}</div>
                    <div className="text-xs text-adv-gray">
                      {j.organisation && <>{j.organisation} · </>}
                      {j.location ?? 'Location TBD'}
                      {j.remote_mode && <> · {j.remote_mode}</>}
                    </div>
                    <div className="text-sm mt-2 text-adv-teal">
                      {j.salary_min != null && j.salary_max != null
                        ? `${j.salary_min.toLocaleString()} – ${j.salary_max.toLocaleString()} ${j.salary_currency ?? ''}`
                        : <span className="text-adv-gold">Salary range pending (required by EU directive)</span>
                      }
                    </div>
                  </div>
                  <BookmarkPlus size={16} className="text-adv-gray flex-shrink-0" />
                </div>
              </Link>
            </li>
          ))}
        </ul>

        <div className="flex items-center justify-between pt-4 text-sm">
          <Link to="/jobs/applications" className="text-adv-teal hover:underline">My applications →</Link>
          <Link to="/jobs/profile" className="text-adv-teal hover:underline">My career profile →</Link>
        </div>
      </div>
    </div>
  );
}
