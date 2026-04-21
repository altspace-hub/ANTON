// ── CareerProfilePage.tsx ──────────────────────────────────────────────────
// /jobs/profile — build or edit the candidate's portable career profile
// (.anton bundle type #44). Minimal form for v1; PDF export uses the
// server's render endpoint.

import { useEffect, useState } from 'react';
import { Download, Upload, User, Target, TrendingUp } from 'lucide-react';
import { fetchWithAuth } from '@/lib/api';

interface Profile {
  profile_id: string;
  candidate_display_name: string;
  career_path: Array<{ title: string; organisation: string; start_date: string; end_date?: string | null; summary?: string }>;
  growth_map: { current_strengths: string[]; growth_areas: string[]; learning_goals_next_12_months: string[] };
  aspirations: { opt_in: boolean; target_roles?: string[]; timeline?: string };
}

export default function CareerProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetchWithAuth('/api/jobs/profile');
      if (res.ok) {
        const json = await res.json() as { profile: Profile | null };
        setProfile(json.profile);
      }
      setLoading(false);
    })();
  }, []);

  async function handleImport(file: File) {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const res = await fetchWithAuth('/api/jobs/profile/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      });
      if (res.ok) {
        const j = await fetchWithAuth('/api/jobs/profile').then(r => r.json());
        setProfile(j.profile);
        setMsg('Profile imported');
      } else {
        const j = await res.json().catch(() => ({}));
        setMsg(`Import failed: ${j.error || res.status}`);
      }
    } catch (err) {
      setMsg(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function downloadCv() {
    const res = await fetchWithAuth('/api/jobs/profile/render');
    if (!res.ok) { setMsg('Render failed'); return; }
    const text = await res.text();
    const blob = new Blob([text], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'career-profile.md';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function toggleAspirationOptIn() {
    if (!profile) return;
    const updated: Profile = { ...profile, aspirations: { ...profile.aspirations, opt_in: !profile.aspirations.opt_in } };
    const payload = {
      ...updated,
      bundle_type: 'career-profile',
      spec_version: '1.0',
      candidate_contact_hash: 'ANTON-XXXX-XXXX-XXXX-XXXX',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const res = await fetchWithAuth('/api/jobs/profile/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      setProfile(updated);
      setMsg(updated.aspirations.opt_in ? 'Aspiration profile opted IN' : 'Aspiration profile opted OUT');
    }
  }

  if (loading) return <div className="p-6 text-adv-gray">Loading…</div>;

  return (
    <div className="min-h-screen bg-adv-dark text-adv-off-white">
      <div className="max-w-3xl mx-auto p-6 space-y-6">
        <header className="flex items-center gap-3">
          <User size={22} className="text-adv-teal" />
          <div>
            <h1 className="text-2xl font-semibold">Career profile</h1>
            <p className="text-xs text-adv-gray">Portable. Signed. Yours.</p>
          </div>
        </header>

        {msg && <div className="rounded bg-adv-teal/10 text-adv-teal p-3 text-sm">{msg}</div>}

        {!profile ? (
          <section className="rounded-lg border border-dashed border-border bg-adv-card p-6 text-center space-y-4">
            <div className="text-sm text-adv-gray">No career profile yet. Import an existing one or build a new one.</div>
            <label className="inline-flex items-center gap-2 px-4 py-2 bg-adv-teal text-adv-dark rounded cursor-pointer">
              <Upload size={16} /> Import .anton profile
              <input
                type="file"
                className="hidden"
                accept=".json,.anton"
                onChange={e => { const f = e.target.files?.[0]; if (f) void handleImport(f); }}
              />
            </label>
            <div className="text-xs text-adv-gray">
              Guided build arrives in Phase 2.1 — for now, import an existing bundle or hand-author the JSON.
            </div>
          </section>
        ) : (
          <>
            <section className="rounded-lg border border-border bg-adv-card p-4 space-y-2">
              <div className="text-sm font-medium flex items-center gap-2"><User size={16} /> {profile.candidate_display_name}</div>
              <div className="text-xs text-adv-gray">Profile ID: <code>{profile.profile_id}</code></div>
            </section>

            <section className="rounded-lg border border-border bg-adv-card p-4 space-y-3">
              <div className="text-sm font-medium flex items-center gap-2"><TrendingUp size={16} /> Career path</div>
              {profile.career_path.length === 0 ? (
                <div className="text-xs text-adv-gray">No experience entries yet.</div>
              ) : (
                <ul className="space-y-3">
                  {profile.career_path.map((e, i) => (
                    <li key={i}>
                      <div className="text-sm font-medium">{e.title} — {e.organisation}</div>
                      <div className="text-xs text-adv-gray">{e.start_date} – {e.end_date ?? 'Present'}</div>
                      {e.summary && <div className="text-sm text-adv-off-white/80 mt-1">{e.summary}</div>}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-lg border border-border bg-adv-card p-4 space-y-2">
              <div className="text-sm font-medium">Growth map</div>
              <div className="text-xs">
                <div><span className="text-adv-gray">Current strengths:</span> {profile.growth_map.current_strengths.join(', ') || '—'}</div>
                <div className="mt-1"><span className="text-adv-gray">Growth areas:</span> {profile.growth_map.growth_areas.join(', ') || '—'}</div>
                <div className="mt-1"><span className="text-adv-gray">Learning goals (12 months):</span> {profile.growth_map.learning_goals_next_12_months.join('; ') || '—'}</div>
              </div>
            </section>

            <section className="rounded-lg border border-border bg-adv-card p-4 space-y-2">
              <div className="text-sm font-medium flex items-center gap-2"><Target size={16} /> Aspirations (internal mobility)</div>
              <div className="text-xs text-adv-gray">
                Opt-out-default per Talent spec. Turn on to surface your aspirations to your organisation's internal mobility pipeline.
              </div>
              <button
                onClick={() => void toggleAspirationOptIn()}
                className={`px-3 py-1.5 rounded text-xs ${profile.aspirations.opt_in ? 'bg-adv-teal text-adv-dark' : 'bg-adv-card border border-border text-adv-off-white'}`}
              >
                {profile.aspirations.opt_in ? 'Opted in' : 'Opt in'}
              </button>
            </section>

            <div className="flex items-center gap-3">
              <button
                onClick={() => void downloadCv()}
                className="inline-flex items-center gap-2 px-4 py-2 bg-adv-teal text-adv-dark rounded font-medium"
              >
                <Download size={16} /> Download CV (Markdown)
              </button>
              <label className="inline-flex items-center gap-2 px-4 py-2 border border-border text-adv-off-white rounded cursor-pointer hover:bg-adv-card">
                <Upload size={16} /> Replace profile
                <input
                  type="file"
                  className="hidden"
                  accept=".json,.anton"
                  onChange={e => { const f = e.target.files?.[0]; if (f) void handleImport(f); }}
                />
              </label>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
