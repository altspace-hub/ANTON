// AtlasMigrationBanner — shown on the FCP modules whose output is a risk
// assessment, pointing to the Risk Atlas as the place to keep the scores
// between assessments. (Until 2026-09-22 it targeted four module ids that do
// not exist and so never rendered, and it said the module "now lives inside the
// Risk Atlas" — which has no AI analysis of its own.)
//
// Dismiss state is per-module + per-browser. The banner is non-blocking —
// the underlying module continues to work as before.

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldAlert, X } from 'lucide-react';

export const ATLAS_MODULES = new Set([
  'business-wide-risk-assessment',
  'risk-assessment',
]);

export default function AtlasMigrationBanner({ moduleId, areaId }: { moduleId: string | undefined; areaId: string | undefined }) {
  const dismissKey = `atlas-migration-banner-dismissed:${moduleId ?? ''}`;
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setDismissed(localStorage.getItem(dismissKey) === '1');
  }, [dismissKey]);

  if (areaId !== 'fcp') return null;
  if (!moduleId || !ATLAS_MODULES.has(moduleId)) return null;
  if (dismissed) return null;

  function dismiss(): void {
    localStorage.setItem(dismissKey, '1');
    setDismissed(true);
  }

  return (
    <div className="rounded-lg border border-adv-teal/40 bg-adv-teal/10 px-3 py-2 text-xs text-adv-off-white">
      <div className="flex items-start gap-2">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-adv-teal" />
        <div className="min-w-0 flex-1">
          <div className="font-medium text-adv-teal">Keep the scores in a Risk Atlas.</div>
          <div className="mt-0.5 text-adv-gray">
            The Risk Atlas is a living risk register: threat paths, controls, residual scores and appetite, scored by fixed
            rules and kept between assessments. This module writes the assessment; paste or upload an Atlas board pack and
            it writes around the scores you already maintain.
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Link to="/atlas" className="rounded border border-adv-teal bg-adv-teal/20 px-2 py-1 text-[11px] font-medium text-adv-teal hover:bg-adv-teal/30">
              Open Risk Atlas
            </Link>
            <Link to="/atlas/new" className="rounded border border-border px-2 py-1 text-[11px] text-adv-gray hover:text-adv-off-white">
              Create new Atlas
            </Link>
          </div>
        </div>
        <button
          onClick={dismiss}
          aria-label="Dismiss"
          className="rounded p-1 text-adv-gray hover:bg-adv-dark hover:text-adv-off-white"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
