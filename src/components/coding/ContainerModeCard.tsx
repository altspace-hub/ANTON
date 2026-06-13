/**
 * ContainerModeCard — ANTON Studio Phase 6: container isolation (Docker).
 *
 * THE HONEST CEILING surface. Lets the user request that build/test commands run
 * inside a `docker run` container (workspace bind-mounted, network off) so a
 * hostile build.rs / setup.py / npm postinstall runs in a throwaway container,
 * not on the host. Self-contained: pass projectId, it fetches its own state.
 *
 * Honesty is the whole point of this card: when docker is REQUESTED but the
 * operator flag is off OR Docker is absent, we show a prominent banner —
 * "Runs will fall back to local — NOT isolated." We never imply isolation we
 * don't actually have.
 */
import { useCallback, useEffect, useState } from 'react';
import { Box, ShieldCheck, ShieldAlert, Loader2, CheckCircle2, ServerCog } from 'lucide-react';

function getAuthHeader(): Record<string, string> {
  const t = localStorage.getItem('openexpert-token');
  return t ? { Authorization: `Bearer ${t}` } : {};
}

interface ContainerProbe {
  dockerAvailable: boolean;
  dockerVersion: string | null;
  dockerError: string | null;
  enabledByFlag: boolean;
  enableEnvVar: string;
  environmentMode: string | null;
  requested: boolean;
  effectiveMode: 'docker' | 'local';
  isolated: boolean;
  reason: string;
}

interface ContainerModeCardProps {
  projectId: string;
  onChanged?: () => void;
}

export default function ContainerModeCard({ projectId, onChanged }: ContainerModeCardProps) {
  const [probe, setProbe] = useState<ContainerProbe | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProbe = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/coding/projects/${projectId}/container/probe`, { headers: getAuthHeader() });
      if (!res.ok) { setError('Could not load container status.'); return; }
      setProbe(await res.json() as ContainerProbe);
    } catch {
      setError('Could not reach the server.');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchProbe(); }, [fetchProbe]);

  const setMode = useCallback(async (mode: 'docker' | 'local') => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/coding/projects/${projectId}/container/mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ mode }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError((data as { error?: string }).error || 'Failed to set container mode.');
        return;
      }
      await fetchProbe();
      onChanged?.();
    } catch {
      setError('Could not reach the server.');
    } finally {
      setSaving(false);
    }
  }, [projectId, fetchProbe, onChanged]);

  const requested = probe?.requested ?? false;
  const isolated = probe?.isolated ?? false;
  // The honest red banner: docker requested, but NOT actually isolating.
  const fallbackWarning = requested && !isolated;

  return (
    <div className="rounded-lg border border-border bg-adv-card p-5">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-adv-white">
          <Box className="h-4 w-4 text-adv-teal" /> Container isolation
        </h2>
        {probe && (
          isolated ? (
            <span className="flex items-center gap-1 rounded-full bg-adv-green/10 px-2.5 py-0.5 text-xs font-medium text-adv-green">
              <ShieldCheck className="h-3 w-3" /> isolated
            </span>
          ) : (
            <span className="rounded-full bg-adv-dark px-2.5 py-0.5 text-xs font-medium text-adv-gray">not isolated</span>
          )
        )}
      </div>
      <p className="mt-1 text-xs text-adv-gray">
        By default, build/test commands run directly on this machine — a hostile{' '}
        <span className="font-mono">build.rs</span>/<span className="font-mono">setup.py</span>/<span className="font-mono">npm postinstall</span>{' '}
        runs on your host. Docker mode runs them inside a throwaway container (workspace bind-mounted, network off) so they cannot touch your machine.
      </p>

      {loading && (
        <div className="mt-3 flex items-center gap-2 text-xs text-adv-gray">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking Docker…
        </div>
      )}

      {probe && (
        <>
          {/* Honest fallback banner — requested but NOT isolating */}
          {fallbackWarning && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border-2 border-adv-red bg-adv-red/10 px-3 py-2.5">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-adv-red" />
              <div>
                <p className="text-xs font-bold text-adv-red">Docker requested — runs will FALL BACK to local (NOT isolated).</p>
                <p className="mt-0.5 text-[11px] text-adv-off-white">{probe.reason}</p>
              </div>
            </div>
          )}

          {/* Effective-state grid */}
          <div className="mt-3 space-y-1.5 rounded-lg border border-border bg-adv-dark px-3 py-2.5 text-[11px]">
            <div className="flex items-center justify-between">
              <span className="text-adv-gray">Docker detected</span>
              {probe.dockerAvailable ? (
                <span className="flex items-center gap-1 text-adv-green">
                  <CheckCircle2 className="h-3 w-3" /> yes{probe.dockerVersion ? ` (v${probe.dockerVersion})` : ''}
                </span>
              ) : (
                <span className="text-adv-gold">no</span>
              )}
            </div>
            {!probe.dockerAvailable && probe.dockerError && (
              <div className="text-adv-gray">{probe.dockerError}</div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-adv-gray">Operator flag (<span className="font-mono">{probe.enableEnvVar}</span>)</span>
              <span className={probe.enabledByFlag ? 'text-adv-green' : 'text-adv-gold'}>
                {probe.enabledByFlag ? 'enabled' : 'off'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-adv-gray">Effective mode</span>
              <span className={`flex items-center gap-1 font-medium ${isolated ? 'text-adv-green' : 'text-adv-off-white'}`}>
                <ServerCog className="h-3 w-3" />
                {probe.effectiveMode === 'docker' ? 'docker (isolated)' : 'local (not isolated)'}
              </span>
            </div>
          </div>

          {/* Mode toggle */}
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => setMode('docker')}
              disabled={saving || requested}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-adv-teal px-4 py-2 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Box className="h-3.5 w-3.5" />}
              {requested ? 'Docker mode requested' : 'Request Docker mode'}
            </button>
            <button
              onClick={() => setMode('local')}
              disabled={saving || !requested}
              className="flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-xs font-medium text-adv-gray hover:bg-adv-dark transition-colors disabled:opacity-50"
            >
              Use local
            </button>
          </div>

          {isolated && (
            <p className="mt-2 flex items-start gap-1.5 text-[11px] text-adv-green">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {probe.reason}
            </p>
          )}
          {!requested && (
            <p className="mt-2 text-[11px] text-adv-gray">
              Currently running locally (mode <span className="font-mono">{probe.environmentMode ?? 'auto'}</span>) — not isolated.
              Request Docker mode for hostile-code safety. Requires Docker installed and{' '}
              <span className="font-mono">{probe.enableEnvVar}=1</span> set by the operator.
            </p>
          )}
        </>
      )}

      {error && (
        <div className="mt-2 rounded-lg border border-adv-red/30 bg-adv-red/5 px-3 py-2 text-xs text-adv-red">{error}</div>
      )}
    </div>
  );
}
