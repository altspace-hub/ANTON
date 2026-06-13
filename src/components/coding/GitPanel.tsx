/**
 * GitPanel — ANTON Studio REAL GIT surface (Studio P6).
 *
 * Self-contained: fetches the project's git status + recent commits and renders
 * the current branch, dirty-file count, and the last commits. Honest about a
 * not-yet-initialized repo (shows the note + an Initialize action). Styling
 * follows the existing coding panels (light design tokens / adv-* classes).
 *
 * NOT imported anywhere here — CodingStudioPage wires it in centrally.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  GitBranch, GitCommit, RefreshCw, Loader2, AlertCircle, FolderGit2, FilePen,
} from 'lucide-react';

interface GitCommitSummary {
  hash: string;
  subject: string;
}

interface GitStatusSummary {
  isRepo: boolean;
  branch: string | null;
  ahead: number;
  dirtyFiles: number;
  lastCommits: GitCommitSummary[];
  note?: string;
}

interface GitPanelProps {
  projectId: string;
}

function getAuthHeader(): Record<string, string> {
  const t = localStorage.getItem('openexpert-token');
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export default function GitPanel({ projectId }: GitPanelProps) {
  const [status, setStatus] = useState<GitStatusSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/coding/projects/${projectId}/git/status`, {
        headers: { ...getAuthHeader() },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load git status');
      setStatus(data.status as GitStatusSummary);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load git status');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const handleInit = useCallback(async () => {
    setInitializing(true);
    setError(null);
    try {
      const res = await fetch(`/api/coding/projects/${projectId}/git/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to initialize repository');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to initialize repository');
    } finally {
      setInitializing(false);
    }
  }, [projectId, load]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="rounded-lg border border-border bg-adv-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-adv-off-white">
          <FolderGit2 className="h-4 w-4 text-adv-teal" /> Version control
        </h3>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] text-adv-gray hover:text-adv-off-white transition-colors disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Refresh
        </button>
      </div>

      <div className="space-y-3 p-4">
        {error && (
          <div className="flex items-start gap-1.5 rounded-lg border border-adv-red/30 bg-adv-red/5 px-3 py-2 text-xs text-adv-red">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{error}
          </div>
        )}

        {/* Not a repo yet — honest, with an Initialize action. */}
        {status && !status.isRepo && (
          <div className="space-y-2">
            <p className="text-xs text-adv-gray">
              {status.note || 'No git repository yet for this workspace.'}
            </p>
            <button
              onClick={() => void handleInit()}
              disabled={initializing}
              className="flex items-center gap-1.5 rounded-lg border border-adv-teal px-4 py-2 text-xs font-medium text-adv-teal hover:bg-adv-teal/10 transition-colors disabled:opacity-50"
            >
              {initializing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitBranch className="h-3.5 w-3.5" />}
              {initializing ? 'Initializing…' : 'Initialize repository'}
            </button>
          </div>
        )}

        {/* A repo — branch + dirty count + commits. */}
        {status && status.isRepo && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-adv-teal/30 bg-adv-teal/10 px-3 py-1 text-xs font-medium text-adv-teal">
                <GitBranch className="h-3.5 w-3.5" />
                {status.branch || '(detached HEAD)'}
              </span>
              {status.ahead > 0 && (
                <span className="rounded-full border border-border px-2 py-1 text-[11px] text-adv-gray">
                  {status.ahead} ahead
                </span>
              )}
              <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] ${
                status.dirtyFiles > 0
                  ? 'border-adv-gold/30 bg-adv-gold/10 text-adv-gold'
                  : 'border-adv-green/30 bg-adv-green/10 text-adv-green'
              }`}>
                <FilePen className="h-3 w-3" />
                {status.dirtyFiles > 0 ? `${status.dirtyFiles} uncommitted` : 'clean'}
              </span>
            </div>

            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-adv-gray">Recent commits</p>
              {status.lastCommits.length === 0 ? (
                <p className="text-xs text-adv-gray">No commits yet — the orchestrator commits one per completed task.</p>
              ) : (
                <ul className="space-y-1">
                  {status.lastCommits.map((c) => (
                    <li key={c.hash} className="flex items-start gap-2 rounded-lg border border-border bg-adv-dark px-2.5 py-1.5">
                      <GitCommit className="mt-0.5 h-3.5 w-3.5 shrink-0 text-adv-teal" />
                      <span className="font-mono text-[11px] text-adv-gray">{c.hash}</span>
                      <span className="text-xs text-adv-off-white">{c.subject}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}

        {loading && !status && (
          <div className="flex items-center gap-2 text-xs text-adv-gray">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading git status…
          </div>
        )}
      </div>
    </div>
  );
}
