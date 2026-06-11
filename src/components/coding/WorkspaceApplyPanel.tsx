/**
 * WorkspaceApplyPanel — Wave 5.2 review-and-approve gate for applying
 * LLM-generated file blocks to the bound workspace.
 *
 * Shows the deterministic per-file diff the server computed; NOTHING is
 * written until the user clicks "Approve & write". After applying it shows
 * exactly what was written and where the backups live.
 */
import { useCallback, useState } from 'react';
import {
  FileCode, FilePlus2, FileDiff, ChevronDown, ChevronRight, ShieldAlert,
  CheckCircle2, XCircle, Loader2, Archive,
} from 'lucide-react';
import type {
  WorkspaceApplyPreview, WorkspaceApplyResult, WorkspaceDiffChunk, WorkspaceFilePreview,
} from '@/lib/coding-types';

function getAuthHeader(): Record<string, string> {
  const t = localStorage.getItem('openexpert-token');
  return t ? { Authorization: `Bearer ${t}` } : {};
}

function actionBadge(action: WorkspaceFilePreview['action']) {
  switch (action) {
    case 'create': return { label: 'new file', cls: 'bg-adv-green/10 text-adv-green', icon: FilePlus2 };
    case 'modify': return { label: 'modified', cls: 'bg-adv-gold/10 text-adv-gold', icon: FileDiff };
    default: return { label: 'unchanged', cls: 'bg-adv-dark text-adv-gray', icon: FileCode };
  }
}

function DiffChunkView({ chunk }: { chunk: WorkspaceDiffChunk }) {
  if (chunk.type === 'unchanged') {
    return (
      <>
        {(chunk.lines || []).map((l, i) => (
          <div key={i} className="whitespace-pre-wrap px-2 text-adv-gray">{` ${l}`}</div>
        ))}
      </>
    );
  }
  return (
    <>
      {(chunk.oldLines || []).map((l, i) => (
        <div key={`o${i}`} className="whitespace-pre-wrap bg-adv-red/10 px-2 text-adv-red">{`- ${l}`}</div>
      ))}
      {(chunk.newLines || []).map((l, i) => (
        <div key={`n${i}`} className="whitespace-pre-wrap bg-adv-green/10 px-2 text-adv-green">{`+ ${l}`}</div>
      ))}
    </>
  );
}

interface WorkspaceApplyPanelProps {
  projectId: string;
  preview: WorkspaceApplyPreview;
  onApplied?: (result: WorkspaceApplyResult) => void;
  onRejected?: () => void;
}

export default function WorkspaceApplyPanel({ projectId, preview, onApplied, onRejected }: WorkspaceApplyPanelProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<WorkspaceApplyResult | null>(null);
  const [rejected, setRejected] = useState(false);

  const toggle = useCallback((p: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p); else next.add(p);
      return next;
    });
  }, []);

  const handleApprove = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/coding/projects/${projectId}/applications/${preview.applicationId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Apply failed');
      setResult(data as WorkspaceApplyResult);
      onApplied?.(data as WorkspaceApplyResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Apply failed');
    } finally {
      setBusy(false);
    }
  }, [projectId, preview.applicationId, onApplied]);

  const handleReject = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/coding/projects/${projectId}/applications/${preview.applicationId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Reject failed');
      setRejected(true);
      onRejected?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reject failed');
    } finally {
      setBusy(false);
    }
  }, [projectId, preview.applicationId, onRejected]);

  return (
    <div className="rounded-lg border border-border bg-adv-card">
      <div className="border-b border-border px-4 py-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-adv-white">
          <FileDiff className="h-4 w-4 text-adv-teal" />
          Apply to workspace {preview.kind === 'revision' && <span className="rounded-full bg-adv-gold/10 px-2 py-0.5 text-[10px] font-medium text-adv-gold">revision round</span>}
        </h3>
        <p className="mt-0.5 text-xs text-adv-gray">
          {preview.totals.create} new · {preview.totals.modify} modified · {preview.totals.unchanged} unchanged
          {' — '}+{preview.totals.lines_added} / −{preview.totals.lines_removed} / ~{preview.totals.lines_modified} lines
        </p>
        <p className="mt-0.5 font-mono text-[11px] text-adv-gray">{preview.workspace}</p>
      </div>

      <div className="space-y-3 p-4">
        {/* Rejected blocks — security refusals shown loudly */}
        {preview.rejected_blocks.length > 0 && (
          <div className="rounded-lg border border-adv-red/30 bg-adv-red/5 p-3">
            <div className="flex items-center gap-1.5 text-xs font-medium text-adv-red">
              <ShieldAlert className="h-3.5 w-3.5" />
              {preview.rejected_blocks.length} block(s) refused — they will NOT be written
            </div>
            <ul className="mt-1 space-y-0.5">
              {preview.rejected_blocks.map((r, i) => (
                <li key={i} className="text-xs text-adv-off-white">
                  {r.path && <span className="font-mono">{r.path}</span>}{r.path ? ' — ' : ''}{r.reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Per-file diffs */}
        <div className="space-y-1.5">
          {preview.files.map((file) => {
            const badge = actionBadge(file.action);
            const isOpen = expanded.has(file.path);
            const Icon = badge.icon;
            return (
              <div key={file.path} className="rounded-lg border border-border bg-adv-dark overflow-hidden">
                <button
                  onClick={() => toggle(file.path)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-adv-card/40 transition-colors"
                >
                  {isOpen ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-adv-gray" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-adv-gray" />}
                  <Icon className="h-3.5 w-3.5 shrink-0 text-adv-gray" />
                  <span className="flex-1 truncate font-mono text-xs text-adv-off-white">{file.path}</span>
                  <span className="text-[11px] text-adv-gray">
                    +{file.stats.linesAdded} −{file.stats.linesRemoved} ~{file.stats.linesModified}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${badge.cls}`}>{badge.label}</span>
                </button>
                {isOpen && (
                  <div className="max-h-[320px] overflow-auto border-t border-border py-1 font-mono text-[11px] leading-snug">
                    {file.chunks.length === 0
                      ? <div className="px-2 text-adv-gray">(identical to the file already in the workspace)</div>
                      : file.chunks.map((chunk, i) => <DiffChunkView key={i} chunk={chunk} />)}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {error && (
          <div className="flex items-center gap-1.5 rounded-lg border border-adv-red/30 bg-adv-red/5 px-3 py-2 text-xs text-adv-red">
            <XCircle className="h-3.5 w-3.5 shrink-0" />{error}
          </div>
        )}

        {/* Approval gate / outcome */}
        {result ? (
          <div className="rounded-lg border border-adv-green/30 bg-adv-green/5 p-3">
            <div className="flex items-center gap-1.5 text-xs font-medium text-adv-green">
              <CheckCircle2 className="h-3.5 w-3.5" /> {result.verification}
            </div>
            {result.backup_dir && (
              <p className="mt-1 flex items-center gap-1 font-mono text-[11px] text-adv-gray">
                <Archive className="h-3 w-3" /> {result.backup_dir}
              </p>
            )}
          </div>
        ) : rejected ? (
          <div className="rounded-lg border border-border bg-adv-dark px-3 py-2 text-xs text-adv-gray">
            Discarded — no files were written.
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-adv-gray">
              Nothing has been written yet. Approving writes the files above into the workspace;
              originals are backed up to <span className="font-mono">.anton-coding-backup/</span> first.
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleApprove}
                disabled={busy}
                className="flex items-center gap-1.5 rounded-lg bg-adv-teal px-4 py-2 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                Approve &amp; write {preview.totals.create + preview.totals.modify} file(s)
              </button>
              <button
                onClick={handleReject}
                disabled={busy}
                className="flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-xs text-adv-gray hover:text-adv-red hover:border-adv-red transition-colors disabled:opacity-50"
              >
                <XCircle className="h-3.5 w-3.5" /> Discard
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
