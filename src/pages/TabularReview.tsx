/**
 * TabularReview.tsx — Wave 1 workspace for the folder-of-docs → grid-of-cells UX.
 *
 * State machine:
 *   empty       — pick a playbook (only AMLR for Wave 1) + upload docs
 *   uploading   — docs being POSTed to /api/files/upload, text extracted
 *   ready       — at least one doc uploaded, "Start review" enabled
 *   running     — POST /runs fired, SSE open, cells filling in live
 *   done        — all cells settled, "Export to XLSX" enabled
 *
 * The grid is just a CSS grid of status pills. Click a cell → side drawer
 * with the full rationale + verbatim evidence. No virtualisation in Wave 1;
 * the per-run cap is 200 docs × 12 cols = 2400 cells, which the DOM handles.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, FileText, Loader2, Trash2, Upload, X } from 'lucide-react';
import { getAuthHeader, fetchWithAuth } from '@/lib/api';

interface PlaybookColumnSummary {
  id: string;
  header: string;
  regulatoryRef: string;
  question: string;
}

interface PlaybookSummary {
  id: string;
  name: string;
  description: string;
  defaultModel: string;
  columns: PlaybookColumnSummary[];
}

interface UploadedDoc {
  fileName: string;
  byteSize: number;
  text: string;
  /** Tracks the upload lifecycle so the doc list can show spinners
   *  while extraction is in flight. */
  state: 'uploading' | 'ready' | 'error';
  error?: string;
}

interface CellState {
  status:
    | 'pending' | 'running'
    | 'covered' | 'partial' | 'missing' | 'not_applicable'
    | 'error';
  evidence?: string;
  rationale?: string;
  error?: string;
}

type GridState = Map<string, CellState>; // key = `${docId}::${columnId}`

interface RunSnapshot {
  run: {
    id: string;
    name: string;
    status: string;
    total_cells: number;
    completed_cells: number;
    failed_cells: number;
    playbook_snapshot: PlaybookSummary;
  };
  documents: Array<{ doc_id: string; file_name: string; byte_size: number }>;
  cells: Array<{
    doc_id: string;
    column_id: string;
    status: string;
    result: { evidence?: string; rationale?: string } | null;
    error: string | null;
  }>;
}

const STATUS_COLOURS: Record<string, { bg: string; fg: string; label: string }> = {
  pending:        { bg: '#F4F4F0', fg: '#666',    label: '·' },
  running:        { bg: '#E8F0FA', fg: '#2563EB', label: '…' },
  covered:        { bg: '#E6F5EA', fg: '#1F7A3A', label: 'covered' },
  partial:        { bg: '#FBF3DC', fg: '#8A6A12', label: 'partial' },
  missing:        { bg: '#FBE6E6', fg: '#9F2424', label: 'missing' },
  not_applicable: { bg: '#F0F0F0', fg: '#666',    label: 'n/a' },
  error:          { bg: '#FFEEEE', fg: '#9F2424', label: '⚠ error' },
};

export default function TabularReview() {
  const [playbooks, setPlaybooks] = useState<PlaybookSummary[]>([]);
  const [selectedPlaybookId, setSelectedPlaybookId] = useState<string>('amlr-obligation-mapping');
  const [runName, setRunName] = useState<string>('');
  const [docs, setDocs] = useState<UploadedDoc[]>([]);
  const [phase, setPhase] = useState<'empty' | 'ready' | 'running' | 'done' | 'error'>('empty');
  const [runId, setRunId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<RunSnapshot | null>(null);
  const [grid, setGrid] = useState<GridState>(new Map());
  const [drawerCell, setDrawerCell] = useState<{ docName: string; column: PlaybookColumnSummary; cell: CellState } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const selectedPlaybook = useMemo(
    () => playbooks.find((p) => p.id === selectedPlaybookId),
    [playbooks, selectedPlaybookId],
  );
  const readyDocs = docs.filter((d) => d.state === 'ready');

  // ── Load playbooks on mount ────────────────────────────────────────
  useEffect(() => {
    fetch('/api/tabular-review/playbooks', { headers: getAuthHeader() })
      .then((r) => r.json())
      .then((data: { playbooks: PlaybookSummary[] }) => {
        setPlaybooks(data.playbooks);
        if (data.playbooks[0] && !data.playbooks.find((p) => p.id === selectedPlaybookId)) {
          setSelectedPlaybookId(data.playbooks[0].id);
        }
      })
      .catch((e) => setErrorMsg(String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── SSE subscription while a run is in flight ──────────────────────
  useEffect(() => {
    if (!runId || (phase !== 'running' && phase !== 'done')) return;
    // Initial snapshot — catches any cells that already settled before we
    // attached the SSE listener (the executor starts immediately on POST).
    void (async () => {
      const r = await fetch(`/api/tabular-review/runs/${runId}`, { headers: getAuthHeader() });
      if (!r.ok) return;
      const data = (await r.json()) as RunSnapshot;
      setSnapshot(data);
      const g: GridState = new Map();
      for (const c of data.cells) {
        g.set(`${c.doc_id}::${c.column_id}`, {
          status: c.status as CellState['status'],
          evidence: c.result?.evidence,
          rationale: c.result?.rationale,
          error: c.error ?? undefined,
        });
      }
      setGrid(g);
      if (data.run.status === 'done' || data.run.status === 'error') {
        setPhase(data.run.status === 'done' ? 'done' : 'error');
      }
    })();

    // EventSource doesn't natively send auth headers — for solo-mode this
    // works as-is; team-mode auth happens via the cookie set on the
    // /api/tabular-review/runs/:id GET above (same origin, credentials
    // included by default). If team-mode rejects, we surface the error.
    const es = new EventSource(`/api/tabular-review/runs/${runId}/stream`, {
      withCredentials: true,
    });
    eventSourceRef.current = es;

    es.onmessage = (ev) => {
      try {
        const event = JSON.parse(ev.data) as {
          type: string;
          docId?: string;
          columnId?: string;
          status?: CellState['status'];
          evidence?: string;
          rationale?: string;
          error?: string;
        };
        if (event.type === 'cell_started' && event.docId && event.columnId) {
          setGrid((prev) => {
            const next = new Map(prev);
            next.set(`${event.docId}::${event.columnId}`, { status: 'running' });
            return next;
          });
        } else if (event.type === 'cell_done' && event.docId && event.columnId) {
          setGrid((prev) => {
            const next = new Map(prev);
            next.set(`${event.docId}::${event.columnId}`, {
              status: event.status ?? 'error',
              evidence: event.evidence,
              rationale: event.rationale,
              error: event.error,
            });
            return next;
          });
          setSnapshot((s) => s ? { ...s, run: { ...s.run, completed_cells: s.run.completed_cells + 1 } } : s);
        } else if (event.type === 'run_done') {
          setPhase('done');
          es.close();
        } else if (event.type === 'run_error') {
          setPhase('error');
          setErrorMsg(event.error ?? 'Run failed');
          es.close();
        }
      } catch { /* ignored */ }
    };
    es.onerror = () => { /* heartbeats keep this alive; transient errors are normal */ };

    return () => { es.close(); eventSourceRef.current = null; };
  }, [runId, phase]);

  // ── Upload handling ────────────────────────────────────────────────
  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    // Optimistic insert — show each row as "uploading" immediately.
    setDocs((prev) => [
      ...prev,
      ...list.map((f) => ({ fileName: f.name, byteSize: f.size, text: '', state: 'uploading' as const })),
    ]);
    setPhase('empty');

    for (const file of list) {
      const fd = new FormData();
      fd.append('file', file);
      try {
        const r = await fetch('/api/files/upload', {
          method: 'POST',
          body: fd,
          headers: getAuthHeader(),
        });
        if (!r.ok) throw new Error(`Upload failed: ${r.status}`);
        const data = (await r.json()) as { originalName: string; size: number; text?: string };
        if (!data.text || data.text.length < 50) {
          setDocs((prev) => prev.map((d) =>
            d.fileName === file.name && d.state === 'uploading'
              ? { ...d, state: 'error', error: 'No text extracted (empty or unsupported file?)' }
              : d,
          ));
          continue;
        }
        setDocs((prev) => prev.map((d) =>
          d.fileName === file.name && d.state === 'uploading'
            ? { ...d, text: data.text!, byteSize: data.size, state: 'ready' }
            : d,
        ));
      } catch (err) {
        setDocs((prev) => prev.map((d) =>
          d.fileName === file.name && d.state === 'uploading'
            ? { ...d, state: 'error', error: err instanceof Error ? err.message : String(err) }
            : d,
        ));
      }
    }
    setPhase('ready');
  };

  const removeDoc = (fileName: string) => {
    setDocs((prev) => prev.filter((d) => d.fileName !== fileName));
  };

  // ── Start the run ──────────────────────────────────────────────────
  const startRun = async () => {
    if (!selectedPlaybook || readyDocs.length === 0) return;
    setErrorMsg('');
    setPhase('running');
    try {
      const r = await fetchWithAuth('/api/tabular-review/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: runName.trim() || `${selectedPlaybook.name} — ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`,
          playbookId: selectedPlaybook.id,
          documents: readyDocs.map((d) => ({
            fileName: d.fileName,
            byteSize: d.byteSize,
            text: d.text,
          })),
        }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
        throw new Error(body.error ?? 'Failed to start run');
      }
      const data = (await r.json()) as { runId: string };
      setRunId(data.runId);
    } catch (err) {
      setPhase('error');
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  };

  const downloadXlsx = () => {
    if (!runId) return;
    // Force browser download via a hidden anchor — easier than a fetch+blob
    // dance when the server emits the right Content-Disposition header.
    window.location.href = `/api/tabular-review/runs/${runId}/export.xlsx`;
  };

  // ── Render ─────────────────────────────────────────────────────────
  const showGrid = phase === 'running' || phase === 'done' || phase === 'error';

  return (
    <div className="min-h-screen bg-[#FAFAF6] text-[#1C1A14]">
      <header className="border-b border-[#E5E5DC] px-6 py-3 flex items-center justify-between bg-white">
        <div className="flex items-center gap-3">
          <Link to="/" className="text-[#666] hover:text-[#1C1A14]" aria-label="Back">
            <ArrowLeft size={18} />
          </Link>
          <h1 className="text-lg font-semibold">Tabular Review</h1>
          {selectedPlaybook && (
            <span className="text-sm text-[#666]">· {selectedPlaybook.name}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {phase === 'done' && (
            <button
              onClick={downloadXlsx}
              className="px-3 py-1.5 text-sm rounded-md bg-[#0D7D6C] text-white hover:bg-[#06655A]"
            >
              Export to XLSX
            </button>
          )}
        </div>
      </header>

      {!showGrid && (
        <main className="max-w-3xl mx-auto px-6 py-8">
          <p className="text-sm text-[#666] mb-6">
            Drop a folder of policy or procedure documents. ANTON runs an AI checklist over each one
            and returns an interactive grid: rows are documents, columns are obligations, cells say
            <em> covered / partial / missing</em> with a quoted passage.
          </p>

          {/* Playbook picker */}
          <section className="mb-6">
            <label className="text-xs uppercase tracking-wide text-[#666] block mb-2">Playbook</label>
            <select
              className="w-full px-3 py-2 border border-[#D9D9CE] rounded-md bg-white"
              value={selectedPlaybookId}
              onChange={(e) => setSelectedPlaybookId(e.target.value)}
            >
              {playbooks.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            {selectedPlaybook && (
              <p className="text-xs text-[#666] mt-2">{selectedPlaybook.description}</p>
            )}
            {selectedPlaybook && (
              <details className="mt-2">
                <summary className="text-xs text-[#0D7D6C] cursor-pointer">
                  {selectedPlaybook.columns.length} columns — preview
                </summary>
                <ol className="mt-2 text-xs text-[#444] space-y-1 list-decimal pl-5">
                  {selectedPlaybook.columns.map((c) => (
                    <li key={c.id}><strong>{c.header}.</strong> {c.question}</li>
                  ))}
                </ol>
              </details>
            )}
          </section>

          {/* Run name */}
          <section className="mb-6">
            <label className="text-xs uppercase tracking-wide text-[#666] block mb-2">Run name (optional)</label>
            <input
              type="text"
              className="w-full px-3 py-2 border border-[#D9D9CE] rounded-md bg-white"
              placeholder={selectedPlaybook ? `${selectedPlaybook.name} — ${new Date().toLocaleDateString()}` : ''}
              value={runName}
              onChange={(e) => setRunName(e.target.value)}
            />
          </section>

          {/* Upload */}
          <section className="mb-6">
            <label className="text-xs uppercase tracking-wide text-[#666] block mb-2">Documents</label>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full border-2 border-dashed border-[#D9D9CE] rounded-md py-8 px-4 hover:border-[#0D7D6C] hover:bg-white flex flex-col items-center gap-2 text-[#666]"
            >
              <Upload size={20} />
              <span className="text-sm">Click to upload — PDF, DOCX, TXT, MD</span>
              <span className="text-xs text-[#999]">Each doc capped at ~30k chars for the AI pass; Wave 2 chunks long docs.</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.docx,.doc,.txt,.md,.html"
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
            {docs.length > 0 && (
              <ul className="mt-4 divide-y divide-[#EBEBE2] border border-[#EBEBE2] rounded-md bg-white">
                {docs.map((d) => (
                  <li key={d.fileName} className="flex items-center px-3 py-2 text-sm gap-3">
                    <FileText size={16} className="text-[#666] shrink-0" />
                    <span className="flex-1 truncate">{d.fileName}</span>
                    <span className="text-xs text-[#999]">{(d.byteSize / 1024).toFixed(0)} kB</span>
                    {d.state === 'uploading' && <Loader2 size={14} className="animate-spin text-[#666]" />}
                    {d.state === 'ready' && <span className="text-xs text-[#1F7A3A]">ready</span>}
                    {d.state === 'error' && (
                      <span className="text-xs text-[#9F2424]" title={d.error}>error</span>
                    )}
                    <button onClick={() => removeDoc(d.fileName)} className="text-[#999] hover:text-[#9F2424]">
                      <X size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Start */}
          <div className="flex items-center gap-3">
            <button
              onClick={startRun}
              disabled={readyDocs.length === 0 || !selectedPlaybook}
              className="px-4 py-2 rounded-md bg-[#0D7D6C] text-white font-medium hover:bg-[#06655A] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Start review — {readyDocs.length} docs × {selectedPlaybook?.columns.length ?? 0} cols
            </button>
            {errorMsg && <span className="text-sm text-[#9F2424]">{errorMsg}</span>}
          </div>
        </main>
      )}

      {showGrid && snapshot && (
        <main className="px-4 py-4">
          {/* Status bar */}
          <div className="flex items-center gap-3 mb-3 text-sm">
            <span className="font-medium">{snapshot.run.name}</span>
            <span className="text-[#666]">·</span>
            <span className="text-[#666]">
              {snapshot.run.completed_cells} / {snapshot.run.total_cells} cells
              {snapshot.run.failed_cells > 0 && (
                <span className="text-[#9F2424]"> · {snapshot.run.failed_cells} errored</span>
              )}
            </span>
            {phase === 'running' && (
              <>
                <Loader2 size={14} className="animate-spin text-[#666]" />
                <span className="text-[#666]">running…</span>
              </>
            )}
            {phase === 'done' && <span className="text-[#1F7A3A]">complete</span>}
            {phase === 'error' && <span className="text-[#9F2424]">{errorMsg || 'errored'}</span>}
          </div>

          {/* Grid */}
          <div className="overflow-auto border border-[#E5E5DC] rounded-md bg-white max-h-[calc(100vh-160px)]">
            <table className="text-sm border-collapse" style={{ minWidth: 'max-content' }}>
              <thead className="sticky top-0 bg-[#F4F4F0] z-10">
                <tr>
                  <th className="text-left px-3 py-2 border-b border-r border-[#E5E5DC] font-medium sticky left-0 bg-[#F4F4F0] z-20 min-w-[200px]">
                    Document
                  </th>
                  {snapshot.run.playbook_snapshot.columns.map((col) => (
                    <th key={col.id} className="text-left px-3 py-2 border-b border-[#E5E5DC] font-medium min-w-[140px] max-w-[200px]" title={col.question}>
                      <div className="font-semibold">{col.header}</div>
                      <div className="text-xs text-[#666] font-normal">{col.regulatoryRef}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {snapshot.documents.map((doc) => (
                  <tr key={doc.doc_id} className="border-b border-[#EBEBE2] last:border-b-0">
                    <td className="px-3 py-2 border-r border-[#E5E5DC] sticky left-0 bg-white truncate max-w-[280px]" title={doc.file_name}>
                      {doc.file_name}
                    </td>
                    {snapshot.run.playbook_snapshot.columns.map((col) => {
                      const cell = grid.get(`${doc.doc_id}::${col.id}`) ?? { status: 'pending' as const };
                      const colour = STATUS_COLOURS[cell.status] ?? STATUS_COLOURS.pending!;
                      return (
                        <td
                          key={col.id}
                          className="px-2 py-1 cursor-pointer hover:opacity-80"
                          style={{ backgroundColor: colour.bg, color: colour.fg }}
                          onClick={() => setDrawerCell({ docName: doc.file_name, column: col, cell })}
                        >
                          <div className="text-xs font-medium">{colour.label}</div>
                          {cell.rationale && (
                            <div className="text-[10px] line-clamp-2 mt-0.5 opacity-80">
                              {cell.rationale}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </main>
      )}

      {/* Cell detail drawer */}
      {drawerCell && (
        <div className="fixed inset-0 z-50 bg-black/30 flex justify-end" onClick={() => setDrawerCell(null)}>
          <div
            className="bg-white w-full max-w-md h-full overflow-y-auto shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#E5E5DC]">
              <h3 className="font-semibold text-sm">{drawerCell.column.header}</h3>
              <button onClick={() => setDrawerCell(null)} className="text-[#666] hover:text-[#1C1A14]">
                <X size={18} />
              </button>
            </div>
            <div className="p-4 space-y-4 text-sm">
              <div>
                <div className="text-xs uppercase tracking-wide text-[#666]">Document</div>
                <div className="mt-1">{drawerCell.docName}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-[#666]">Reference</div>
                <div className="mt-1">{drawerCell.column.regulatoryRef}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-[#666]">Question</div>
                <div className="mt-1 text-[#333]">{drawerCell.column.question}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-[#666]">Status</div>
                <div
                  className="mt-1 inline-block px-2 py-0.5 rounded text-xs font-medium"
                  style={{
                    backgroundColor: (STATUS_COLOURS[drawerCell.cell.status] ?? STATUS_COLOURS.pending!).bg,
                    color: (STATUS_COLOURS[drawerCell.cell.status] ?? STATUS_COLOURS.pending!).fg,
                  }}
                >
                  {(STATUS_COLOURS[drawerCell.cell.status] ?? STATUS_COLOURS.pending!).label}
                </div>
              </div>
              {drawerCell.cell.rationale && (
                <div>
                  <div className="text-xs uppercase tracking-wide text-[#666]">Rationale</div>
                  <div className="mt-1 text-[#333]">{drawerCell.cell.rationale}</div>
                </div>
              )}
              {drawerCell.cell.evidence && (
                <div>
                  <div className="text-xs uppercase tracking-wide text-[#666]">Evidence (verbatim)</div>
                  <blockquote className="mt-1 border-l-2 border-[#0D7D6C] pl-3 italic text-[#333]">
                    {drawerCell.cell.evidence}
                  </blockquote>
                </div>
              )}
              {drawerCell.cell.error && (
                <div>
                  <div className="text-xs uppercase tracking-wide text-[#666]">Error</div>
                  <div className="mt-1 text-[#9F2424] font-mono text-xs">{drawerCell.cell.error}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
