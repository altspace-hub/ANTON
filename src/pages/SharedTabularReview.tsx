/**
 * SharedTabularReview.tsx — public, no-auth view of a Tabular Review run.
 *
 * An owner generates a share link (via the workspace's "Share for review"
 * modal); they send it to a busy MLRO / compliance officer / lawyer. That
 * reviewer opens /shared/<token>, sees the grid, can drill into cells, and
 * — if the link allows feedback — marks each cell ✓ correct / ✗ FP / ✗ FN /
 * 🟡 partial / 🤷 unclear with an optional note. No ANTON account required.
 *
 * The reviewer's name (optional) is captured once + stored in localStorage
 * keyed on the token, so they don't get re-prompted every cell.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, X } from 'lucide-react';

interface PlaybookColumn {
  id: string;
  header: string;
  regulatoryRef: string;
  question: string;
}

interface PlaybookSnapshot {
  name: string;
  description: string;
  columns: PlaybookColumn[];
}

interface RunData {
  id: string;
  name: string;
  status: string;
  total_cells: number;
  completed_cells: number;
  failed_cells: number;
  playbook_snapshot: PlaybookSnapshot;
}

interface DocData {
  doc_id: string;
  file_name: string;
}

interface CellData {
  doc_id: string;
  column_id: string;
  status: string;
  result: { evidence?: string; rationale?: string } | null;
  error: string | null;
}

interface ShareInfo {
  token: string;
  expiresAt: string;
  allowFeedback: boolean;
  message: string | null;
}

interface FeedbackData {
  doc_id: string;
  column_id: string;
  verdict: 'correct' | 'false_positive' | 'false_negative' | 'partial' | 'unclear';
  reviewer_status?: 'covered' | 'partial' | 'missing' | 'not_applicable' | null;
  note?: string | null;
}

interface SharedResponse {
  share: ShareInfo;
  run: RunData;
  documents: DocData[];
  cells: CellData[];
  feedback: FeedbackData[];
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

const VERDICT_LABELS: Record<FeedbackData['verdict'], { label: string; bg: string; fg: string }> = {
  correct:         { label: '✓ Correct',          bg: '#E6F5EA', fg: '#1F7A3A' },
  false_positive:  { label: '✗ False positive',   bg: '#FBE6E6', fg: '#9F2424' },
  false_negative:  { label: '✗ False negative',   bg: '#FBE6E6', fg: '#9F2424' },
  partial:         { label: '🟡 Partial / mixed', bg: '#FBF3DC', fg: '#8A6A12' },
  unclear:         { label: '🤷 Unclear / N/A',   bg: '#F0F0F0', fg: '#666'    },
};

export default function SharedTabularReview() {
  const { token = '' } = useParams<{ token: string }>();
  const [data, setData] = useState<SharedResponse | null>(null);
  const [error, setError] = useState<string>('');
  const [drawerCell, setDrawerCell] = useState<{ doc: DocData; column: PlaybookColumn; cell: CellData | undefined } | null>(null);
  const [reviewerName, setReviewerName] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    return window.localStorage.getItem(`share:reviewer-name:${token}`) ?? '';
  });
  const [nameEditing, setNameEditing] = useState<boolean>(false);

  // Initial load + on-token-change.
  useEffect(() => {
    if (!token) return;
    void (async () => {
      try {
        const r = await fetch(`/api/tabular-review/shared/${token}`);
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.error ?? `HTTP ${r.status}`);
        }
        setData(await r.json() as SharedResponse);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
  }, [token]);

  const feedbackByKey = useMemo(() => {
    const m = new Map<string, FeedbackData>();
    if (data) for (const f of data.feedback) m.set(`${f.doc_id}::${f.column_id}`, f);
    return m;
  }, [data]);

  const saveFeedback = async (
    docId: string, columnId: string,
    verdict: FeedbackData['verdict'],
    reviewerStatus: FeedbackData['reviewer_status'],
    note: string | null,
  ) => {
    if (!data) return;
    try {
      const r = await fetch(`/api/tabular-review/shared/${token}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          docId, columnId, verdict,
          reviewerStatus, note,
          reviewerName: reviewerName.trim() || null,
        }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${r.status}`);
      }
      // Refresh — keeps everyone (incl. the owner) in sync via subsequent loads.
      const fresh = await fetch(`/api/tabular-review/shared/${token}`);
      if (fresh.ok) setData(await fresh.json() as SharedResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const persistName = (name: string) => {
    setReviewerName(name);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(`share:reviewer-name:${token}`, name);
    }
  };

  if (error) {
    return (
      <div className="min-h-screen bg-[#FAFAF6] flex items-center justify-center p-6">
        <div className="bg-white border border-[#E5E5DC] rounded-md p-6 max-w-md text-sm">
          <div className="font-semibold text-[#9F2424] mb-2">This link can&apos;t be opened</div>
          <div className="text-[#444]">{error}</div>
          <div className="text-xs text-[#666] mt-4">
            The link may have expired, been revoked, or never existed. Ask the person who
            shared it for a fresh one.
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-[#FAFAF6] flex items-center justify-center">
        <Loader2 className="animate-spin text-[#666]" />
      </div>
    );
  }

  const { share, run, documents, cells } = data;
  const playbook = run.playbook_snapshot;
  const cellByKey = new Map<string, CellData>();
  for (const c of cells) cellByKey.set(`${c.doc_id}::${c.column_id}`, c);

  return (
    <div className="min-h-screen bg-[#FAFAF6] text-[#1C1A14]">
      <header className="border-b border-[#E5E5DC] px-6 py-3 bg-white">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">{playbook.name}</h1>
            <div className="text-xs text-[#666] mt-0.5">
              {run.name} · {documents.length} document{documents.length !== 1 ? 's' : ''}
              {' '}· shared until {new Date(share.expiresAt).toLocaleDateString()}
              {share.allowFeedback ? ' · feedback enabled' : ' · read-only'}
            </div>
          </div>
          {share.allowFeedback && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-[#666]">Reviewer:</span>
              {nameEditing ? (
                <input
                  autoFocus
                  type="text"
                  placeholder="Your name (optional)"
                  value={reviewerName}
                  onChange={(e) => setReviewerName(e.target.value)}
                  onBlur={() => { persistName(reviewerName.trim()); setNameEditing(false); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { persistName(reviewerName.trim()); setNameEditing(false); } }}
                  className="px-2 py-1 border border-[#D9D9CE] rounded text-xs"
                />
              ) : (
                <button
                  onClick={() => setNameEditing(true)}
                  className="px-2 py-1 border border-[#D9D9CE] rounded hover:bg-[#F4F4F0]"
                >
                  {reviewerName.trim() || 'add your name'}
                </button>
              )}
            </div>
          )}
        </div>
        {share.message && (
          <div className="mt-2 text-sm text-[#444] bg-[#FBF8E9] border border-[#F0E0A6] rounded px-3 py-2">
            {share.message}
          </div>
        )}
      </header>

      <main className="px-4 py-4">
        <div className="overflow-auto border border-[#E5E5DC] rounded-md bg-white max-h-[calc(100vh-180px)]">
          <table className="text-sm border-collapse" style={{ minWidth: 'max-content' }}>
            <thead className="sticky top-0 bg-[#F4F4F0] z-10">
              <tr>
                <th className="text-left px-3 py-2 border-b border-r border-[#E5E5DC] font-medium sticky left-0 bg-[#F4F4F0] z-20 min-w-[200px]">
                  Document
                </th>
                {playbook.columns.map((col) => (
                  <th key={col.id} className="text-left px-3 py-2 border-b border-[#E5E5DC] font-medium min-w-[140px] max-w-[200px]" title={col.question}>
                    <div className="font-semibold">{col.header}</div>
                    <div className="text-xs text-[#666] font-normal">{col.regulatoryRef}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => (
                <tr key={doc.doc_id} className="border-b border-[#EBEBE2] last:border-b-0">
                  <td className="px-3 py-2 border-r border-[#E5E5DC] sticky left-0 bg-white truncate max-w-[280px]" title={doc.file_name}>
                    {doc.file_name}
                  </td>
                  {playbook.columns.map((col) => {
                    const cell = cellByKey.get(`${doc.doc_id}::${col.id}`);
                    const colour = STATUS_COLOURS[cell?.status ?? 'pending'] ?? STATUS_COLOURS.pending!;
                    const fb = feedbackByKey.get(`${doc.doc_id}::${col.id}`);
                    return (
                      <td
                        key={col.id}
                        className="px-2 py-1 cursor-pointer hover:opacity-80 relative"
                        style={{ backgroundColor: colour.bg, color: colour.fg }}
                        onClick={() => setDrawerCell({ doc, column: col, cell })}
                      >
                        <div className="text-xs font-medium">{colour.label}</div>
                        {cell?.result?.rationale && (
                          <div className="text-[10px] line-clamp-2 mt-0.5 opacity-80">
                            {cell.result.rationale}
                          </div>
                        )}
                        {fb && (
                          <div
                            className="absolute top-0.5 right-0.5 text-[10px] rounded px-1"
                            style={{
                              backgroundColor: VERDICT_LABELS[fb.verdict].bg,
                              color: VERDICT_LABELS[fb.verdict].fg,
                            }}
                            title={`Reviewer: ${VERDICT_LABELS[fb.verdict].label}`}
                          >
                            {fb.verdict === 'correct' ? '✓' : fb.verdict === 'unclear' ? '?' : '✗'}
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
                <div className="mt-1">{drawerCell.doc.file_name}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-[#666]">Reference</div>
                <div className="mt-1">{drawerCell.column.regulatoryRef}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-[#666]">Question</div>
                <div className="mt-1 text-[#333]">{drawerCell.column.question}</div>
              </div>
              {drawerCell.cell && (
                <>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-[#666]">AI status</div>
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
                  {drawerCell.cell.result?.rationale && (
                    <div>
                      <div className="text-xs uppercase tracking-wide text-[#666]">AI rationale</div>
                      <div className="mt-1 text-[#333]">{drawerCell.cell.result.rationale}</div>
                    </div>
                  )}
                  {drawerCell.cell.result?.evidence && (
                    <div>
                      <div className="text-xs uppercase tracking-wide text-[#666]">Evidence (verbatim)</div>
                      <blockquote className="mt-1 border-l-2 border-[#0D7D6C] pl-3 italic text-[#333]">
                        {drawerCell.cell.result.evidence}
                      </blockquote>
                    </div>
                  )}
                </>
              )}

              {share.allowFeedback && drawerCell.cell &&
               drawerCell.cell.status !== 'pending' && drawerCell.cell.status !== 'running' && (
                <FeedbackBlock
                  current={feedbackByKey.get(`${drawerCell.doc.doc_id}::${drawerCell.column.id}`) ?? null}
                  onSave={(v, rs, n) => void saveFeedback(drawerCell.doc.doc_id, drawerCell.column.id, v, rs, n)}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FeedbackBlock({
  current,
  onSave,
}: {
  current: FeedbackData | null;
  onSave: (
    verdict: FeedbackData['verdict'],
    reviewerStatus: FeedbackData['reviewer_status'],
    note: string | null,
  ) => void;
}) {
  const [verdict, setVerdict] = useState<FeedbackData['verdict'] | null>(current?.verdict ?? null);
  const [reviewerStatus, setReviewerStatus] = useState<FeedbackData['reviewer_status']>(current?.reviewer_status ?? null);
  const [note, setNote] = useState<string>(current?.note ?? '');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setVerdict(current?.verdict ?? null);
    setReviewerStatus(current?.reviewer_status ?? null);
    setNote(current?.note ?? '');
    setSaved(false);
  }, [current]);

  const handleSave = () => {
    if (!verdict) return;
    onSave(verdict, reviewerStatus, note.trim() || null);
    setSaved(true);
  };

  const verdicts: FeedbackData['verdict'][] = ['correct', 'false_positive', 'false_negative', 'partial', 'unclear'];

  return (
    <div className="border-t border-[#EBEBE2] pt-4">
      <div className="text-xs uppercase tracking-wide text-[#666] mb-2">Your review</div>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {verdicts.map((v) => {
          const colours = VERDICT_LABELS[v];
          const active = verdict === v;
          return (
            <button
              key={v}
              onClick={() => { setVerdict(v); setSaved(false); }}
              className={`px-2.5 py-1 text-xs rounded-md border ${active ? 'border-[#1C1A14] font-medium' : 'border-[#D9D9CE]'} hover:border-[#1C1A14]`}
              style={{ backgroundColor: active ? colours.bg : 'transparent', color: active ? colours.fg : '#444' }}
            >
              {colours.label}
            </button>
          );
        })}
      </div>
      {verdict && verdict !== 'correct' && verdict !== 'unclear' && (
        <div className="mb-3">
          <div className="text-xs uppercase tracking-wide text-[#666] mb-1">Right answer was…</div>
          <select
            className="w-full px-2 py-1.5 text-sm border border-[#D9D9CE] rounded-md bg-white"
            value={reviewerStatus ?? ''}
            onChange={(e) => { setReviewerStatus((e.target.value || null) as FeedbackData['reviewer_status']); setSaved(false); }}
          >
            <option value="">(don&apos;t specify)</option>
            <option value="covered">🟢 covered</option>
            <option value="partial">🟡 partial</option>
            <option value="missing">🔴 missing</option>
            <option value="not_applicable">⚪ not applicable</option>
          </select>
        </div>
      )}
      <textarea
        className="w-full px-2 py-1.5 text-sm border border-[#D9D9CE] rounded-md bg-white"
        placeholder="Optional — why? (helps prompt iteration)"
        rows={2}
        value={note}
        onChange={(e) => { setNote(e.target.value); setSaved(false); }}
      />
      <div className="flex items-center gap-2 mt-2">
        <button
          onClick={handleSave}
          disabled={!verdict}
          className="px-3 py-1 text-xs rounded-md bg-[#0D7D6C] text-white hover:bg-[#06655A] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Save review
        </button>
        {saved && <span className="text-xs text-[#1F7A3A]">Saved ✓</span>}
      </div>
    </div>
  );
}
