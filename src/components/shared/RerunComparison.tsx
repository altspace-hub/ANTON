/**
 * RerunComparison.tsx — side-by-side view of an original output vs a
 * "Rerun with…" output (Wave 2.3 recompose, Wave 5 verbatim replay).
 *
 * - Both sides rendered as markdown, paragraph by paragraph.
 * - Paragraph-level diff highlight computed client-side: paragraph split +
 *   LCS over normalized paragraphs (no heavy diff dependency).
 * - Per side: model, cost, tokens, quality score (polled — scoring is async).
 * - Recompose: source-drift banner when the pinned source manifests differ.
 * - Replay: an equality strip — model, prompt hash (always identical: the
 *   stored prompt was sent byte-for-byte) and output hash — with the one
 *   line that explains a differing output: sampling.
 */

import { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { X, AlertTriangle, ShieldCheck, Loader2, GitCompare, Equal, Shuffle, Fingerprint } from 'lucide-react';
import { getAuthHeader } from '@/lib/api';
import type { RerunResponse, RerunSide, RerunSourceDriftEntry } from '@/lib/types';

// ── Data shapes (mirror POST /api/rerun response) ────────────────────────────

export type { RerunSide };
export type SourceDriftEntry = RerunSourceDriftEntry;
/** The comparison renders the rerun response as-is; `mode` decides which banner shows. */
export type RerunComparisonData = RerunResponse;

// ── Paragraph LCS diff ───────────────────────────────────────────────────────

function splitParagraphs(text: string): string[] {
  return text.split(/\n{2,}/).map((p) => p.replace(/\s+$/, '')).filter((p) => p.trim().length > 0);
}

function normalizePara(p: string): string {
  return p.trim().replace(/\s+/g, ' ');
}

/**
 * Returns, per side, a boolean array: true = paragraph is NOT part of the
 * longest common subsequence (i.e. changed/unique → highlight).
 * Exported for tests.
 */
export function computeParagraphDiff(aText: string, bText: string): { a: string[]; b: string[]; aChanged: boolean[]; bChanged: boolean[] } {
  const a = splitParagraphs(aText);
  const b = splitParagraphs(bText);
  const an = a.map(normalizePara);
  const bn = b.map(normalizePara);

  const aChanged = a.map(() => true);
  const bChanged = b.map(() => true);

  // Size guard — fall back to "no highlight" rather than freezing the tab.
  if (a.length * b.length > 4_000_000) {
    return { a, b, aChanged: a.map(() => false), bChanged: b.map(() => false) };
  }

  // LCS dynamic programming over normalized paragraphs.
  const n = a.length;
  const m = b.length;
  const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i][j] = an[i - 1] === bn[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  // Backtrack: members of the LCS are common → not highlighted.
  let i = n, j = m;
  while (i > 0 && j > 0) {
    if (an[i - 1] === bn[j - 1]) {
      aChanged[i - 1] = false;
      bChanged[j - 1] = false;
      i--; j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }
  return { a, b, aChanged, bChanged };
}

// ── Quality polling ──────────────────────────────────────────────────────────

interface QualityScore { overall: number }

function useQualityScore(messageId: string | undefined): { score: QualityScore | null; loading: boolean } {
  const [score, setScore] = useState<QualityScore | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!messageId) return;
    let cancelled = false;
    setScore(null);
    setLoading(true);
    const tryFetch = async (attempt: number): Promise<void> => {
      if (cancelled) return;
      try {
        const r = await fetch(`/api/rerun/quality/${encodeURIComponent(messageId)}`, { headers: getAuthHeader() });
        if (r.ok) {
          const data = (await r.json()) as { score: QualityScore | null };
          if (cancelled) return;
          if (data.score) {
            setScore(data.score);
            setLoading(false);
            return;
          }
        }
      } catch { /* retry */ }
      if (attempt < 6 && !cancelled) {
        await new Promise<void>((res) => setTimeout(res, 1500 * attempt));
        return tryFetch(attempt + 1);
      }
      if (!cancelled) setLoading(false);
    };
    void tryFetch(1);
    return () => { cancelled = true; };
  }, [messageId]);

  return { score, loading };
}

// ── Component ────────────────────────────────────────────────────────────────

function SideHeader({ label, side, quality, qualityLoading, accent }: {
  label: string;
  side: RerunSide;
  quality: QualityScore | null;
  qualityLoading: boolean;
  accent: 'gray' | 'teal';
}) {
  const accentText = accent === 'teal' ? 'text-adv-teal' : 'text-adv-gray';
  return (
    <div className="sticky top-0 z-10 border-b border-border bg-adv-card px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <span className={`text-xs font-semibold uppercase tracking-wide ${accentText}`}>{label}</span>
        <span className="truncate text-xs font-medium text-adv-off-white" title={side.modelId ?? ''}>{side.modelId ?? 'unknown model'}</span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-adv-gray">
        <span>{side.cost !== null && side.cost !== undefined ? `$${Number(side.cost).toFixed(4)}` : 'cost n/a'}</span>
        <span>{side.outputTokens !== null && side.outputTokens !== undefined ? `${Number(side.outputTokens).toLocaleString()} tokens out` : 'tokens n/a'}</span>
        <span className="flex items-center gap-1">
          <ShieldCheck className="h-3 w-3" />
          {quality
            ? <span className={quality.overall >= 8 ? 'text-adv-green' : quality.overall >= 6 ? 'text-adv-teal' : 'text-adv-gold'}>{quality.overall.toFixed(1)}/10</span>
            : qualityLoading
              ? <Loader2 className="h-3 w-3 animate-spin" />
              : <span>not scored</span>}
        </span>
      </div>
    </div>
  );
}

function ParagraphColumn({ paras, changed, highlightClass }: { paras: string[]; changed: boolean[]; highlightClass: string }) {
  return (
    <div className="space-y-2 p-4">
      {paras.map((p, idx) => (
        <div key={idx} className={`rounded-md px-2 py-1 ${changed[idx] ? highlightClass : ''}`}>
          <div className="prose-output max-w-none text-sm text-adv-off-white">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{p}</ReactMarkdown>
          </div>
        </div>
      ))}
    </div>
  );
}

/** One row of the replay equality strip: what was compared, and whether it matched. */
function EqualityRow({ label, equal, detail, sameText, differentText }: {
  label: string;
  equal: boolean;
  detail?: string;
  sameText: string;
  differentText: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm" role="listitem">
      {equal
        ? <Equal className="h-3.5 w-3.5 shrink-0 text-adv-green" aria-hidden="true" />
        : <Shuffle className="h-3.5 w-3.5 shrink-0 text-adv-gold" aria-hidden="true" />}
      <span className="font-medium text-adv-off-white">{label}</span>
      <span className={equal ? 'text-adv-green' : 'text-adv-gold'}>{equal ? sameText : differentText}</span>
      {detail && <span className="truncate font-mono text-xs text-adv-gray" title={detail}>{detail}</span>}
    </div>
  );
}

function shortSha(sha: string | null | undefined): string | undefined {
  return sha ? `sha256 ${sha.slice(0, 12)}…` : undefined;
}

export default function RerunComparison({ data, onClose }: { data: RerunComparisonData; onClose: () => void }) {
  const diff = useMemo(
    () => computeParagraphDiff(data.original.content, data.rerun.content),
    [data.original.content, data.rerun.content],
  );
  const originalQuality = useQualityScore(data.original.messageId);
  const rerunQuality = useQualityScore(data.rerun.messageId);

  const isReplay = data.mode === 'replay';
  const changedSources = (data.sourceDrift ?? []).filter((d) => d.changed);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label={isReplay ? 'Verbatim replay comparison' : 'Rerun comparison'}>
      <div className="flex h-full max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-border bg-adv-dark shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border bg-adv-card px-4 py-3">
          <div className="flex items-center gap-2">
            <GitCompare className="h-4 w-4 text-adv-teal" />
            <span className="text-sm font-semibold text-adv-off-white">{isReplay ? 'Verbatim replay' : 'Model comparison'}</span>
            <span className="rounded-full bg-adv-teal/10 px-2 py-0.5 text-[11px] font-medium text-adv-teal">
              {isReplay ? `Replay of ${data.original.modelId ?? 'original'} output` : `Rerun of ${data.original.modelId ?? 'original'} output`}
            </span>
          </div>
          <button
            onClick={onClose}
            aria-label="Close comparison"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-adv-gray transition-colors hover:bg-adv-dark hover:text-adv-off-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Replay equality strip (Wave 5): model, prompt, output — and why an output can still differ */}
        {isReplay && data.model && data.prompt && data.output && (
          <div className="border-b border-border bg-adv-card/60 px-4 py-3" role="list" aria-label="Replay equality">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-adv-teal">
              <Fingerprint className="h-3.5 w-3.5" aria-hidden="true" />
              What matched
            </div>
            <div className="grid grid-cols-1 gap-1.5 md:grid-cols-3">
              <EqualityRow
                label="Model"
                equal={data.model.equalsOriginal}
                detail={data.model.served}
                sameText="same model served"
                differentText={`different — ${data.model.served}`}
              />
              <EqualityRow
                label="Prompt"
                equal={data.prompt.equalsOriginal}
                detail={shortSha(data.prompt.sha256)}
                sameText="identical, sent byte-for-byte"
                differentText="differs"
              />
              <EqualityRow
                label="Output"
                equal={data.output.equalsOriginal}
                detail={shortSha(data.output.sha256)}
                sameText="identical hash"
                differentText={`differs (${data.output.chars.toLocaleString()} vs ${data.output.originalChars.toLocaleString()} chars)`}
              />
            </div>
            <p className="mt-2 text-sm leading-relaxed text-adv-gray">
              {data.note ?? 'Same prompt, same history, same model — an identical output is still not guaranteed: sampling can differ even with identical inputs.'}
            </p>
          </div>
        )}

        {/* Recompose: output hash in one line (the drift view below explains the rest) */}
        {!isReplay && data.output && (
          <div className="flex flex-wrap items-center gap-2 border-b border-border bg-adv-card/50 px-4 py-2 text-sm" aria-label="Output equality">
            {data.output.equalsOriginal
              ? <Equal className="h-3.5 w-3.5 text-adv-green" aria-hidden="true" />
              : <Shuffle className="h-3.5 w-3.5 text-adv-gold" aria-hidden="true" />}
            <span className="font-medium text-adv-off-white">Output</span>
            <span className={data.output.equalsOriginal ? 'text-adv-green' : 'text-adv-gold'}>
              {data.output.equalsOriginal ? 'identical hash' : 'differs'}
            </span>
            {data.prompt && (
              <span className="text-adv-gray">
                · prompt {data.prompt.equalsOriginal ? 'identical' : 'recomposed — knowledge and composer may have moved on'}
              </span>
            )}
          </div>
        )}

        {/* Source-drift banner (recompose only — a replay reuses the pinned sources by construction) */}
        {!isReplay && data.sourceDriftAvailable && changedSources.length > 0 && (
          <div className="flex items-start gap-2 border-b border-adv-gold/30 bg-adv-gold/10 px-4 py-2.5">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-adv-gold" />
            <p className="text-xs leading-relaxed text-adv-gold">
              <span className="font-semibold">Source drift:</span> the knowledge sources resolved for the rerun differ from the original run —{' '}
              {changedSources.slice(0, 4).map((s) => `${s.name} (${s.status})`).join(', ')}
              {changedSources.length > 4 ? ` and ${changedSources.length - 4} more` : ''}.
              {' '}Differences between the outputs may come from the sources, not the model.
            </p>
          </div>
        )}
        {!isReplay && !data.sourceDriftAvailable && (
          <div className="border-b border-border bg-adv-card/50 px-4 py-2">
            <p className="text-[11px] text-adv-gray">Source-drift check unavailable — the original run predates pinned source manifests.</p>
          </div>
        )}
        {data.warning && (
          <div className="border-b border-adv-gold/30 bg-adv-gold/10 px-4 py-2">
            <p className="text-[11px] text-adv-gold">{data.warning}</p>
          </div>
        )}

        {/* Legend */}
        <div className="flex items-center gap-4 border-b border-border px-4 py-1.5 text-[11px] text-adv-gray">
          <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-adv-gold/20 ring-1 ring-adv-gold/40" /> differs between outputs</span>
          <span>Both outputs are saved in this session&apos;s history.</span>
        </div>

        {/* Side-by-side body */}
        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-2">
          <div className="min-h-0 overflow-y-auto border-b border-border md:border-b-0 md:border-r">
            <SideHeader label="Original" side={data.original} quality={originalQuality.score} qualityLoading={originalQuality.loading} accent="gray" />
            <ParagraphColumn paras={diff.a} changed={diff.aChanged} highlightClass="bg-adv-gold/10 ring-1 ring-adv-gold/30" />
          </div>
          <div className="min-h-0 overflow-y-auto">
            <SideHeader label={isReplay ? 'Replay' : 'Rerun'} side={data.rerun} quality={rerunQuality.score} qualityLoading={rerunQuality.loading} accent="teal" />
            <ParagraphColumn paras={diff.b} changed={diff.bChanged} highlightClass="bg-adv-teal/10 ring-1 ring-adv-teal/30" />
          </div>
        </div>
      </div>
    </div>
  );
}
