import { useState, useEffect } from 'react';
import { RefreshCw, ChevronRight } from 'lucide-react';
import type { WorkRhythm } from './types';
import { apiGet } from './types';

export default function WorkRhythmsSection() {
  const [rhythms, setRhythms] = useState<WorkRhythm[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    apiGet<WorkRhythm[]>('/api/rhythms')
      .then(setRhythms)
      .catch(() => setRhythms([]))
      .finally(() => setLoading(false));
  }, [open]);

  return (
    <div className="mt-6 rounded-xl border border-border bg-adv-card">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-4"
      >
        <div className="flex items-center gap-2">
          <RefreshCw className="h-4 w-4 text-adv-blue" />
          <span className="text-sm font-semibold text-adv-off-white">Work Rhythms</span>
          <span className="text-xs text-adv-gray-med">Recurring patterns &amp; schedules</span>
        </div>
        <ChevronRight className={`h-4 w-4 text-adv-gray transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>

      {open && (
        <div className="border-t border-border px-5 pb-5">
          {loading ? (
            <p className="pt-4 text-sm text-adv-gray-med">Loading rhythms...</p>
          ) : rhythms.length === 0 ? (
            <div className="pt-4">
              <p className="text-sm text-adv-gray-med">No work rhythms defined yet.</p>
              <p className="mt-1 text-xs text-adv-gray-med">
                Work rhythms are recurring patterns — e.g., monthly board reports, quarterly reviews.
              </p>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {rhythms.map((r) => (
                <div key={r.id} className="rounded-lg border border-border bg-adv-dark px-4 py-3">
                  <p className="text-sm font-medium text-adv-off-white">{r.name}</p>
                  <p className="mt-0.5 text-xs text-adv-gray-med">
                    {r.frequency} &mdash; {r.anchor_expression}
                    {r.typical_effort_hours != null && ` · ~${r.typical_effort_hours}h effort`}
                  </p>
                  {r.description && (
                    <p className="mt-1 text-xs text-adv-gray">{r.description}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
