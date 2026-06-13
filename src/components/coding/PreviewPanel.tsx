import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Play, Square, ExternalLink, RefreshCw, MonitorPlay, AlertTriangle,
  HelpCircle, Loader2,
} from 'lucide-react';
import { fetchWithAuth, API_BASE } from '../../lib/api';

// ── ANTON Studio — Live Local Preview Server panel (Studio P6) ─────────────
// Start/Stop a per-project dev server, open its preview URL (+ an optional
// embedded iframe), and tail its logs while running. Self-contained: the only
// prop is the coding project id. Honest states: preview-off (412), unknown
// (server restarted → no live handle), crashed. Light tokens; matches
// PanelVerdictPanel's card vocabulary.

type PreviewStatus = 'starting' | 'running' | 'stopped' | 'crashed' | 'unknown';

interface PreviewView {
  status: PreviewStatus;
  port: number | null;
  pid: number | null;
  preview_url: string | null;
  command: string[] | null;
  last_log: string | null;
  has_live_handle: boolean;
  started_at: string | null;
  stopped_at: string | null;
}

const STATUS_STYLE: Record<PreviewStatus, { dot: string; label: string; text: string }> = {
  starting: { dot: 'bg-adv-gold animate-pulse', label: 'Starting', text: 'text-adv-gold' },
  running:  { dot: 'bg-adv-green',               label: 'Running',  text: 'text-adv-green' },
  stopped:  { dot: 'bg-adv-gray-med',            label: 'Stopped',  text: 'text-adv-gray' },
  crashed:  { dot: 'bg-adv-red',                 label: 'Crashed',  text: 'text-adv-red' },
  unknown:  { dot: 'bg-adv-gold',                label: 'Unknown',  text: 'text-adv-gold' },
};

export default function PreviewPanel({ projectId }: { projectId: string }) {
  const [view, setView] = useState<PreviewView | null>(null);
  const [logs, setLogs] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [disabled, setDisabled] = useState(false);
  const [showIframe, setShowIframe] = useState(true);
  const [port, setPort] = useState<string>('4321');
  const logRef = useRef<HTMLPreElement | null>(null);

  const refresh = useCallback(async () => {
    try {
      const sres = await fetchWithAuth(`${API_BASE}/coding/projects/${projectId}/preview/status`);
      if (sres.ok) {
        const sj = await sres.json();
        setView(sj.preview as PreviewView);
      }
      const lres = await fetchWithAuth(`${API_BASE}/coding/projects/${projectId}/preview/logs`);
      if (lres.ok) {
        const lj = await lres.json();
        setLogs(typeof lj.logs === 'string' ? lj.logs : '');
      }
    } catch {
      /* transient — keep last view */
    }
  }, [projectId]);

  // Initial load.
  useEffect(() => { void refresh(); }, [refresh]);

  // Poll while the preview is live (running/starting).
  useEffect(() => {
    if (!view || (view.status !== 'running' && view.status !== 'starting')) return;
    const t = setInterval(() => { void refresh(); }, 2000);
    return () => clearInterval(t);
  }, [view, refresh]);

  // Keep the log view scrolled to the tail.
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  const start = useCallback(async () => {
    setBusy(true); setError(null);
    try {
      const portNum = parseInt(port, 10);
      const body: Record<string, unknown> = { language: 'typescript' };
      if (Number.isInteger(portNum) && portNum >= 1 && portNum <= 65535) body.port = portNum;
      const res = await fetchWithAuth(`${API_BASE}/coding/projects/${projectId}/preview/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.status === 412) {
        setDisabled(true);
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? 'Preview is disabled.');
        return;
      }
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setError(j.error ?? 'Failed to start preview.'); return; }
      setDisabled(false);
      setView(j.preview as PreviewView);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start preview.');
    } finally {
      setBusy(false);
      void refresh();
    }
  }, [projectId, port, refresh]);

  const stop = useCallback(async () => {
    setBusy(true); setError(null);
    try {
      const res = await fetchWithAuth(`${API_BASE}/coding/projects/${projectId}/preview/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setError(j.error ?? 'Failed to stop preview.'); return; }
      if (j.message) setError(j.message); // e.g. "no live handle; marked stopped"
      setView(j.preview as PreviewView);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to stop preview.');
    } finally {
      setBusy(false);
      void refresh();
    }
  }, [projectId, refresh]);

  const status = view?.status ?? 'stopped';
  const isLive = status === 'running' || status === 'starting';
  const style = STATUS_STYLE[status];

  return (
    <div className="space-y-4">
      {/* Disabled / opt-in state */}
      {disabled && (
        <div className="flex items-start gap-3 rounded-xl border border-adv-gold/40 bg-adv-gold/10 px-4 py-3">
          <HelpCircle className="mt-0.5 h-5 w-5 shrink-0 text-adv-gold" />
          <div>
            <p className="text-sm font-semibold text-adv-off-white">Live preview is off</p>
            <p className="mt-0.5 text-xs text-adv-gray">
              The local dev-server runner is opt-in. Set{' '}
              <code className="rounded bg-adv-dark px-1 py-0.5 text-adv-teal">CODING_STUDIO_PREVIEW=true</code>{' '}
              on the server and restart to enable Start/Stop here.
            </p>
          </div>
        </div>
      )}

      {/* Header / controls */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-adv-card px-4 py-3">
        <MonitorPlay className="h-5 w-5 shrink-0 text-adv-teal" />
        <div className="flex items-center gap-2">
          <span className={`inline-block h-2.5 w-2.5 rounded-full ${style.dot}`} />
          <span className={`text-sm font-semibold ${style.text}`}>{style.label}</span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-adv-gray">
            Port
            <input
              type="text"
              inputMode="numeric"
              value={port}
              onChange={(e) => setPort(e.target.value.replace(/[^0-9]/g, ''))}
              disabled={isLive || busy}
              className="w-20 rounded-lg border border-border bg-adv-dark px-2 py-1 text-xs text-adv-off-white disabled:opacity-50"
              aria-label="Preview port"
            />
          </label>

          {!isLive ? (
            <button
              type="button"
              onClick={() => void start()}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-adv-teal px-3 py-1.5 text-sm font-semibold text-white hover:bg-adv-teal-dark disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Start
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void stop()}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-adv-red/40 bg-adv-red/10 px-3 py-1.5 text-sm font-semibold text-adv-red hover:bg-adv-red/20 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
              Stop
            </button>
          )}

          <button
            type="button"
            onClick={() => void refresh()}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-gray hover:text-adv-off-white disabled:opacity-50"
            aria-label="Refresh preview status"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Unknown / crashed honest banners */}
      {status === 'unknown' && (
        <div className="flex items-start gap-3 rounded-xl border border-adv-gold/40 bg-adv-gold/10 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-adv-gold" />
          <div>
            <p className="text-sm font-semibold text-adv-off-white">Preview status unknown</p>
            <p className="mt-0.5 text-xs text-adv-gray">
              The database says a preview was running, but this server process holds no live handle for it
              (it was likely restarted). Stopping here only updates the record — it does not (and cannot)
              kill a process this server did not spawn.
            </p>
          </div>
        </div>
      )}
      {status === 'crashed' && (
        <div className="flex items-start gap-3 rounded-xl border-2 border-adv-red/60 bg-adv-red/10 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-adv-red" />
          <div>
            <p className="text-sm font-bold text-adv-red">Preview server crashed</p>
            <p className="mt-0.5 text-xs text-adv-off-white">The dev server exited with a non-zero code. Check the logs below.</p>
          </div>
        </div>
      )}

      {/* Error line (start/stop failures, no-handle stop note) */}
      {error && !disabled && (
        <p className="rounded-lg border border-adv-red/30 bg-adv-red/5 px-3 py-2 text-xs text-adv-red">{error}</p>
      )}

      {/* Preview URL + iframe */}
      {view?.preview_url && isLive && (
        <div className="rounded-xl border border-border bg-adv-card p-3">
          <div className="mb-2 flex items-center gap-2">
            <a
              href={view.preview_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-adv-teal hover:underline"
            >
              <ExternalLink className="h-4 w-4" /> {view.preview_url}
            </a>
            <label className="ml-auto flex items-center gap-1.5 text-xs text-adv-gray">
              <input
                type="checkbox"
                checked={showIframe}
                onChange={(e) => setShowIframe(e.target.checked)}
              />
              Embed
            </label>
          </div>
          {showIframe && (
            <iframe
              title="Live preview"
              src={view.preview_url}
              className="h-96 w-full rounded-lg border border-border bg-white"
              sandbox="allow-scripts allow-same-origin allow-forms"
            />
          )}
        </div>
      )}

      {/* Logs */}
      <div className="rounded-xl border border-border bg-adv-card p-3">
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-adv-gray">Logs</p>
        {logs ? (
          <pre
            ref={logRef}
            className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-adv-dark p-3 text-[11px] leading-relaxed text-adv-off-white"
          >
            {logs}
          </pre>
        ) : (
          <p className="px-1 py-2 text-xs text-adv-gray">
            {isLive
              ? 'Waiting for output…'
              : 'No live logs. Logs are captured in-memory while the server runs and are not retained across a restart.'}
          </p>
        )}
      </div>
    </div>
  );
}
