// AtlasMigrationBanner — shown on legacy FCP modules that overlap with the
// Risk Atlas seven-stage methodology. Encourages the user to anchor their
// work in an Atlas (single source of truth) rather than producing one-off
// outputs that drift away from the live risk register.
//
// Dismiss state is per-module + per-browser. The banner is non-blocking —
// the underlying module continues to work as before.

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldAlert, X } from 'lucide-react';

const ATLAS_MODULES = new Set([
  'business-wide-risk-assessment',
  'amlr-gap-analysis',
  'sanctions-compliance-assessment',
  'kyc-cdd-framework-review',
  'transaction-monitoring-assessment',
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
          <div className="font-medium text-adv-teal">This module now lives inside the Risk Atlas.</div>
          <div className="mt-0.5 text-adv-gray">
            The Risk Atlas is the seven-stage threat-path source of truth — exposures, threats, vulnerabilities,
            inherent / residual scoring, controls, appetite and review cycles in one place. Run this module standalone for a
            one-off output, or open / create an Atlas to maintain it as a living register.
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
