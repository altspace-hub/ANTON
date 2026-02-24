import { useEffect, useState } from 'react';
import { X, Plus, Minus, ArrowLeftRight, Columns2, AlignLeft } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface DiffChunk {
  type: 'unchanged' | 'added' | 'removed' | 'modified';
  oldLines?: string[];
  newLines?: string[];
  lines?: string[];
  sectionTitle?: string;
}

interface DiffStats {
  linesAdded: number;
  linesRemoved: number;
  linesModified: number;
  linesUnchanged: number;
  similarity: number;
  sectionsChanged: string[];
}

interface DiffResult {
  oldVersionId: string;
  newVersionId: string;
  oldLabel: string;
  newLabel: string;
  oldCreatedAt: string;
  newCreatedAt: string;
  chunks: DiffChunk[];
  stats: DiffStats;
  semanticSummary: string;
}

interface Props {
  oldVersionId: string | number;
  newVersionId: string | number;
  onClose: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem('openexpert-token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

function similarityColor(sim: number): string {
  if (sim >= 0.95) return 'text-adv-teal';
  if (sim >= 0.7) return 'text-adv-gold';
  return 'text-adv-red';
}

// ── Line-number column ────────────────────────────────────────────────────────

function LineNum({ n }: { n: number | null }) {
  return (
    <span className="select-none w-10 shrink-0 text-right pr-3 text-adv-gray-med text-xs leading-5">
      {n !== null ? n : ''}
    </span>
  );
}

// ── Unified diff view ─────────────────────────────────────────────────────────

function UnifiedView({ chunks }: { chunks: DiffChunk[] }) {
  let lineNum = 0;

  return (
    <div className="font-mono text-sm leading-5 overflow-x-auto">
      {chunks.map((chunk, ci) => {
        if (chunk.type === 'unchanged') {
          return (chunk.lines ?? []).map((line, li) => {
            lineNum++;
            const num = lineNum;
            return (
              <div key={`u-${ci}-${li}`} className="flex items-start bg-adv-dark-2">
                <LineNum n={num} />
                <span className="text-adv-gray whitespace-pre">{line || '\u00A0'}</span>
              </div>
            );
          });
        }

        if (chunk.type === 'added') {
          return (chunk.newLines ?? []).map((line, li) => {
            lineNum++;
            const num = lineNum;
            return (
              <div key={`a-${ci}-${li}`} className="flex items-start bg-[#0d2a1a]">
                <span className="select-none w-4 shrink-0 text-adv-teal text-xs leading-5 pl-1">+</span>
                <LineNum n={num} />
                <span className="text-[#4ade80] whitespace-pre">{line || '\u00A0'}</span>
              </div>
            );
          });
        }

        if (chunk.type === 'removed') {
          return (chunk.oldLines ?? []).map((line, li) => (
            <div key={`r-${ci}-${li}`} className="flex items-start bg-[#2a0d0d]">
              <span className="select-none w-4 shrink-0 text-adv-red text-xs leading-5 pl-1">-</span>
              <LineNum n={null} />
              <span className="text-[#f87171] whitespace-pre line-through decoration-[#f87171]/50">
                {line || '\u00A0'}
              </span>
            </div>
          ));
        }

        if (chunk.type === 'modified') {
          const oldRows = (chunk.oldLines ?? []).map((line, li) => (
            <div key={`mo-${ci}-${li}`} className="flex items-start bg-[#2a0d0d]">
              <span className="select-none w-4 shrink-0 text-adv-red text-xs leading-5 pl-1">~</span>
              <LineNum n={null} />
              <span className="text-[#f87171] whitespace-pre">{line || '\u00A0'}</span>
            </div>
          ));
          const newRows = (chunk.newLines ?? []).map((line, li) => {
            lineNum++;
            const num = lineNum;
            return (
              <div key={`mn-${ci}-${li}`} className="flex items-start bg-[#0d2a1a]">
                <span className="select-none w-4 shrink-0 text-adv-teal text-xs leading-5 pl-1">~</span>
                <LineNum n={num} />
                <span className="text-[#4ade80] whitespace-pre">{line || '\u00A0'}</span>
              </div>
            );
          });
          return [...oldRows, ...newRows];
        }

        return null;
      })}
    </div>
  );
}

// ── Split diff view ───────────────────────────────────────────────────────────

function SplitRow({
  leftLine,
  rightLine,
  leftBg,
  rightBg,
  leftColor,
  rightColor,
  leftNum,
  rightNum,
}: {
  leftLine: string | null;
  rightLine: string | null;
  leftBg: string;
  rightBg: string;
  leftColor: string;
  rightColor: string;
  leftNum: number | null;
  rightNum: number | null;
}) {
  return (
    <div className="flex min-w-0">
      {/* Left side */}
      <div className={`flex items-start flex-1 min-w-0 ${leftBg}`}>
        <LineNum n={leftNum} />
        <span className={`${leftColor} whitespace-pre overflow-hidden text-ellipsis flex-1 font-mono text-sm leading-5`}>
          {leftLine !== null ? leftLine || '\u00A0' : ''}
        </span>
      </div>
      {/* Divider */}
      <div className="w-px bg-[#1e2d45] shrink-0" />
      {/* Right side */}
      <div className={`flex items-start flex-1 min-w-0 ${rightBg}`}>
        <LineNum n={rightNum} />
        <span className={`${rightColor} whitespace-pre overflow-hidden text-ellipsis flex-1 font-mono text-sm leading-5`}>
          {rightLine !== null ? rightLine || '\u00A0' : ''}
        </span>
      </div>
    </div>
  );
}

function SplitView({ chunks }: { chunks: DiffChunk[] }) {
  let leftNum = 0;
  let rightNum = 0;
  const rows: React.ReactElement[] = [];

  chunks.forEach((chunk, ci) => {
    if (chunk.type === 'unchanged') {
      (chunk.lines ?? []).forEach((line, li) => {
        leftNum++;
        rightNum++;
        const ln = leftNum;
        const rn = rightNum;
        rows.push(
          <SplitRow
            key={`u-${ci}-${li}`}
            leftLine={line}
            rightLine={line}
            leftBg="bg-adv-dark-2"
            rightBg="bg-adv-dark-2"
            leftColor="text-adv-gray"
            rightColor="text-adv-gray"
            leftNum={ln}
            rightNum={rn}
          />
        );
      });
      return;
    }

    if (chunk.type === 'added') {
      (chunk.newLines ?? []).forEach((line, li) => {
        rightNum++;
        const rn = rightNum;
        rows.push(
          <SplitRow
            key={`a-${ci}-${li}`}
            leftLine={null}
            rightLine={line}
            leftBg="bg-adv-dark"
            rightBg="bg-[#0d2a1a]"
            leftColor=""
            rightColor="text-[#4ade80]"
            leftNum={null}
            rightNum={rn}
          />
        );
      });
      return;
    }

    if (chunk.type === 'removed') {
      (chunk.oldLines ?? []).forEach((line, li) => {
        leftNum++;
        const ln = leftNum;
        rows.push(
          <SplitRow
            key={`r-${ci}-${li}`}
            leftLine={line}
            rightLine={null}
            leftBg="bg-[#2a0d0d]"
            rightBg="bg-adv-dark"
            leftColor="text-[#f87171]"
            rightColor=""
            leftNum={ln}
            rightNum={null}
          />
        );
      });
      return;
    }

    if (chunk.type === 'modified') {
      const maxLen = Math.max(chunk.oldLines?.length ?? 0, chunk.newLines?.length ?? 0);
      for (let i = 0; i < maxLen; i++) {
        const oldLine = chunk.oldLines?.[i] ?? null;
        const newLine = chunk.newLines?.[i] ?? null;
        if (oldLine !== null) leftNum++;
        if (newLine !== null) rightNum++;
        const ln = oldLine !== null ? leftNum : null;
        const rn = newLine !== null ? rightNum : null;
        rows.push(
          <SplitRow
            key={`m-${ci}-${i}`}
            leftLine={oldLine}
            rightLine={newLine}
            leftBg={oldLine !== null ? 'bg-[#2a0d0d]' : 'bg-adv-dark'}
            rightBg={newLine !== null ? 'bg-[#0d2a1a]' : 'bg-adv-dark'}
            leftColor="text-[#f87171]"
            rightColor="text-[#4ade80]"
            leftNum={ln}
            rightNum={rn}
          />
        );
      }
    }
  });

  return <div className="overflow-x-auto">{rows}</div>;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function VersionDiffViewer({ oldVersionId, newVersionId, onClose }: Props) {
  const [diff, setDiff] = useState<DiffResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'unified' | 'split'>('unified');

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(
      `/api/versions/diff?oldId=${encodeURIComponent(oldVersionId)}&newId=${encodeURIComponent(newVersionId)}`,
      { headers: { ...getAuthHeader() } }
    )
      .then((r) => {
        if (!r.ok) return r.json().then((e: { error: string }) => { throw new Error(e.error); });
        return r.json();
      })
      .then((data: DiffResult) => {
        setDiff(data);
        setLoading(false);
      })
      .catch((e: Error) => {
        setError(e.message || 'Failed to load diff');
        setLoading(false);
      });
  }, [oldVersionId, newVersionId]);

  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    /* Full-screen overlay */
    <div
      className="fixed inset-0 z-50 bg-black/80 flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label="Version diff viewer"
    >
      {/* ── Header ── */}
      <div className="flex items-center gap-3 px-4 py-3 bg-adv-card border-b border-[#1e2d45] shrink-0 flex-wrap">
        <ArrowLeftRight className="text-adv-teal shrink-0" size={18} />
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <span className="text-adv-white font-semibold text-sm truncate">
            {diff?.oldLabel ?? `v${oldVersionId}`}
          </span>
          <ArrowLeftRight size={14} className="text-adv-gray shrink-0" />
          <span className="text-adv-white font-semibold text-sm truncate">
            {diff?.newLabel ?? `v${newVersionId}`}
          </span>
        </div>

        {/* Semantic summary pill */}
        {diff && (
          <span className="px-2 py-0.5 rounded-full bg-adv-teal-dim text-adv-teal text-xs font-medium whitespace-nowrap">
            {diff.semanticSummary}
          </span>
        )}

        {/* Stats chips */}
        {diff && (
          <div className="flex items-center gap-2 flex-wrap">
            {diff.stats.linesAdded > 0 && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#0d2a1a] text-[#4ade80] text-xs">
                <Plus size={11} /> {diff.stats.linesAdded}
              </span>
            )}
            {diff.stats.linesRemoved > 0 && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#2a0d0d] text-[#f87171] text-xs">
                <Minus size={11} /> {diff.stats.linesRemoved}
              </span>
            )}
            <span className={`text-xs font-medium ${similarityColor(diff.stats.similarity)}`}>
              {Math.round(diff.stats.similarity * 100)}% similar
            </span>
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          {/* View mode toggle */}
          <div className="flex rounded border border-[#1e2d45] overflow-hidden">
            <button
              onClick={() => setViewMode('unified')}
              className={`flex items-center gap-1 px-2 py-1 text-xs transition-colors ${
                viewMode === 'unified'
                  ? 'bg-adv-teal text-adv-dark font-medium'
                  : 'text-adv-gray hover:text-adv-white'
              }`}
              aria-pressed={viewMode === 'unified'}
            >
              <AlignLeft size={13} />
              Unified
            </button>
            <button
              onClick={() => setViewMode('split')}
              className={`flex items-center gap-1 px-2 py-1 text-xs transition-colors ${
                viewMode === 'split'
                  ? 'bg-adv-teal text-adv-dark font-medium'
                  : 'text-adv-gray hover:text-adv-white'
              }`}
              aria-pressed={viewMode === 'split'}
            >
              <Columns2 size={13} />
              Split
            </button>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-[#1e2d45] text-adv-gray hover:text-adv-white transition-colors"
            aria-label="Close diff viewer"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* ── Split view column headers ── */}
      {viewMode === 'split' && diff && (
        <div className="flex shrink-0 border-b border-[#1e2d45] bg-[#0F1B2D]">
          <div className="flex-1 px-3 py-1.5 text-xs text-adv-gray truncate">
            <span className="font-medium text-adv-off-white">{diff.oldLabel}</span>
            {' '}· {formatDate(diff.oldCreatedAt)}
          </div>
          <div className="w-px bg-[#1e2d45]" />
          <div className="flex-1 px-3 py-1.5 text-xs text-adv-gray truncate">
            <span className="font-medium text-adv-off-white">{diff.newLabel}</span>
            {' '}· {formatDate(diff.newCreatedAt)}
          </div>
        </div>
      )}

      {/* ── Diff body ── */}
      <div className="flex-1 overflow-auto bg-adv-dark">
        {loading && (
          <div className="flex items-center justify-center h-full text-adv-gray text-sm">
            Computing diff…
          </div>
        )}

        {error && (
          <div className="flex items-center justify-center h-full">
            <div className="bg-adv-card border border-adv-red/40 rounded-lg p-6 text-center max-w-md">
              <p className="text-adv-red font-medium mb-1">Failed to load diff</p>
              <p className="text-adv-gray text-sm">{error}</p>
              <button
                onClick={onClose}
                className="mt-4 px-4 py-2 rounded bg-adv-teal text-adv-dark text-sm font-medium hover:bg-adv-teal-dark"
              >
                Close
              </button>
            </div>
          </div>
        )}

        {!loading && !error && diff && (
          viewMode === 'unified'
            ? <UnifiedView chunks={diff.chunks} />
            : <SplitView chunks={diff.chunks} />
        )}
      </div>

      {/* ── Footer stats bar ── */}
      {diff && (
        <div className="shrink-0 flex flex-wrap items-center gap-4 px-4 py-2 bg-adv-card border-t border-[#1e2d45] text-xs text-adv-gray">
          <span>
            Similarity: <span className={`font-medium ${similarityColor(diff.stats.similarity)}`}>
              {Math.round(diff.stats.similarity * 100)}%
            </span>
          </span>
          {diff.stats.linesAdded > 0 && (
            <span className="text-[#4ade80]">+{diff.stats.linesAdded} lines added</span>
          )}
          {diff.stats.linesRemoved > 0 && (
            <span className="text-[#f87171]">-{diff.stats.linesRemoved} lines removed</span>
          )}
          {diff.stats.linesModified > 0 && (
            <span className="text-adv-gold">{diff.stats.linesModified} lines modified</span>
          )}
          <span>{diff.stats.linesUnchanged} lines unchanged</span>
          {diff.stats.sectionsChanged.length > 0 && (
            <span>
              Changed sections: <span className="text-adv-off-white">
                {diff.stats.sectionsChanged.slice(0, 3).join(', ')}
                {diff.stats.sectionsChanged.length > 3 && ` +${diff.stats.sectionsChanged.length - 3} more`}
              </span>
            </span>
          )}
          <span className="ml-auto text-adv-gray-med">
            {formatDate(diff.oldCreatedAt)} → {formatDate(diff.newCreatedAt)}
          </span>
        </div>
      )}
    </div>
  );
}
