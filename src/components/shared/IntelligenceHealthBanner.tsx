/**
 * IntelligenceHealthBanner.tsx — Wave 3.9: NGO degradation honesty banner.
 *
 * Compact banner shown on Home ONLY when background intelligence is
 * degraded/off (never renders on all-green). Copy is built from the real
 * per-feature reasons returned by GET /api/system/intelligence-health, e.g.
 * "Background intelligence partially off: embeddings unavailable (no
 * embedding provider configured) — knowledge search falls back to keyword".
 */

import { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getAuthHeader } from '@/lib/api';

export type FeatureStatus = 'ok' | 'degraded' | 'off';

export interface FeatureHealth {
  status: FeatureStatus;
  reason: string;
  provider?: string;
  model?: string;
  last_atom_at?: string | null;
}

export interface IntelligenceHealth {
  generated_at: string;
  overall: FeatureStatus;
  features: Record<string, FeatureHealth>;
}

const DISMISS_KEY = 'openexpert-intel-health-banner-dismissed';

export function useIntelligenceHealth(): IntelligenceHealth | null {
  const [health, setHealth] = useState<IntelligenceHealth | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/system/intelligence-health', { headers: getAuthHeader() })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data: IntelligenceHealth) => { if (!cancelled) setHealth(data); })
      .catch(() => { /* endpoint unavailable — show nothing rather than fake state */ });
    return () => { cancelled = true; };
  }, []);
  return health;
}

export default function IntelligenceHealthBanner() {
  const navigate = useNavigate();
  const health = useIntelligenceHealth();
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try { return sessionStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
  });

  if (dismissed || !health || health.overall === 'ok') return null;

  const degradedReasons = Object.values(health.features)
    .filter((f) => f.status !== 'ok')
    .map((f) => f.reason);

  return (
    <div className="mb-4 flex items-start gap-3 rounded-xl border border-adv-gold/30 bg-adv-gold/10 px-4 py-3">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-adv-gold" />
      <div className="min-w-0 flex-1 text-sm">
        <span className="font-medium text-adv-gold">Background intelligence partially off:</span>{' '}
        <span className="text-adv-gray">{degradedReasons.join(' · ')}</span>{' '}
        <button
          onClick={() => navigate('/settings?tab=general')}
          className="text-adv-teal hover:underline"
        >
          Review in Settings
        </button>
      </div>
      <button
        onClick={() => {
          setDismissed(true);
          try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ }
        }}
        className="shrink-0 rounded p-0.5 text-adv-gray hover:text-adv-off-white transition-colors"
        aria-label="Dismiss intelligence status banner"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
