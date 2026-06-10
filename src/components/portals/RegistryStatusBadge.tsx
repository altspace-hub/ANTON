/**
 * RegistryStatusBadge
 *
 * Surfaces the registry's readiness state in one decisive pill.
 * Calls /api/portals/registry-status — drops in anywhere that needs to tell
 * the user whether portals they publish will go to the federated registry,
 * stay local-only, or fall back during an outage.
 *
 * Two display modes:
 *  - compact (default) → small inline pill, suits headers + dashboards
 *  - detailed          → expanded card with hint text + how-to-configure copy
 */

import { useEffect, useState } from 'react';
import { Globe, Wifi, WifiOff, AlertCircle, CheckCircle2 } from 'lucide-react';
import { fetchWithAuth } from '@/lib/api';

type RegistryState = 'ready' | 'placeholder' | 'unreachable' | 'local_only';

interface RegistryStatus {
  state: RegistryState;
  /** Which publishing path is configured: the relay HTTP registry (active),
   *  the legacy transparency-log registry (dormant), or none. */
  activePath?: 'relay' | 'legacy' | 'none';
  registryUrl: string | null;
  relaySubmitUrl?: string | null;
  reachable: boolean | null;
  reachabilityError: string | null;
  futurechainPlaceholder: boolean;
  hint: string;
}

const META: Record<RegistryState, {
  label: string;
  Icon: typeof Globe;
  tone: 'green' | 'gold' | 'red' | 'gray';
}> = {
  ready:       { label: 'Relay registry',  Icon: CheckCircle2, tone: 'green' },
  placeholder: { label: 'Placeholder key (legacy)', Icon: AlertCircle, tone: 'gold' },
  unreachable: { label: 'Registry offline', Icon: WifiOff,    tone: 'red'  },
  local_only:  { label: 'Local + LAN only', Icon: Wifi,       tone: 'gray' },
};

const TONE_CLASSES: Record<'green' | 'gold' | 'red' | 'gray', { bg: string; border: string; text: string; iconColor: string }> = {
  green: { bg: 'bg-adv-green/10', border: 'border-adv-green/30', text: 'text-adv-green', iconColor: 'text-adv-green' },
  gold:  { bg: 'bg-adv-gold/10',  border: 'border-adv-gold/30',  text: 'text-adv-gold',  iconColor: 'text-adv-gold'  },
  red:   { bg: 'bg-adv-red/10',   border: 'border-adv-red/30',   text: 'text-adv-red',   iconColor: 'text-adv-red'   },
  gray:  { bg: 'bg-adv-card',     border: 'border-border',       text: 'text-adv-gray',  iconColor: 'text-adv-gray'  },
};

interface Props {
  variant?: 'compact' | 'detailed';
  className?: string;
}

export default function RegistryStatusBadge({ variant = 'compact', className = '' }: Props) {
  const [status, setStatus] = useState<RegistryStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetchWithAuth('/api/portals/registry-status');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as RegistryStatus;
        if (!cancelled) setStatus(data);
      } catch {
        // Silent — leaves the badge in 'unknown' state which renders as a neutral pill
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading || !status) {
    return (
      <div className={`inline-flex items-center gap-1.5 text-xs text-adv-gray ${className}`}>
        <Globe className="h-3.5 w-3.5 animate-pulse" />
        Checking registry…
      </div>
    );
  }

  const meta = META[status.state];
  const tone = TONE_CLASSES[meta.tone];
  const Icon = meta.Icon;
  // 'ready' can mean either path — label the dormant legacy protocol honestly.
  const label = status.state === 'ready' && status.activePath === 'legacy'
    ? 'Legacy registry'
    : meta.label;
  const shownUrl = status.relaySubmitUrl ?? status.registryUrl;

  if (variant === 'compact') {
    return (
      <div
        className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border ${tone.bg} ${tone.border} ${tone.text} ${className}`}
        title={status.hint}
      >
        <Icon className={`h-3.5 w-3.5 ${tone.iconColor}`} />
        <span className="font-medium">{label}</span>
      </div>
    );
  }

  // Detailed variant — for the publish flow and Settings panels
  return (
    <div className={`rounded-lg border p-3 ${tone.bg} ${tone.border} ${className}`}>
      <div className="flex items-start gap-2">
        <Icon className={`h-4 w-4 ${tone.iconColor} shrink-0 mt-0.5`} />
        <div className="flex-1 min-w-0">
          <div className={`text-sm font-medium ${tone.text}`}>{label}</div>
          <p className="text-xs text-adv-gray mt-0.5 leading-relaxed">{status.hint}</p>
          {shownUrl && (
            <p className="text-[10px] font-mono text-adv-gray/70 mt-1 break-all">{shownUrl}</p>
          )}
          {status.reachabilityError && (
            <p className="text-[10px] text-adv-red/70 mt-0.5">{status.reachabilityError}</p>
          )}
          {status.state === 'local_only' && (
            <p className="text-[11px] text-adv-gray mt-2">
              To publish portals to the relay registry (federated discovery), set <code className="bg-adv-dark px-1 py-0.5 rounded text-[10px]">RELAY_PORTAL_SUBMIT_URL</code> (e.g. <code className="bg-adv-dark px-1 py-0.5 rounded text-[10px]">https://relay.futurechain.eu/v1</code>) in your <code className="bg-adv-dark px-1 py-0.5 rounded text-[10px]">.env</code> and restart ANTON.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
