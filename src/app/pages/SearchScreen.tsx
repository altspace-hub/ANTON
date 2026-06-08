/**
 * SearchScreen — Pathfinder, "search that thinks before it answers".
 *
 * Layout from design/screens-modules.jsx PathfinderScreen:
 *   • Top bar — "Pathfinder · Search that thinks"
 *   • Query input pinned at top (composer-style)
 *   • Once a query lands:
 *       - Question card (echoes what was asked)
 *       - Thinking trace — N checked steps with connector line, header
 *         "ANTON THOUGHT FOR Xs · Y STEPS"
 *       - Answer card with inline numbered superscript citations
 *       - Sources list — numbered, private (accent-tinted, "YOURS" pill)
 *         vs public (neutral)
 *       - Privacy footer
 */

import { useState } from 'react';
import { Btn, Pill, SectionLabel, Ico, Spinner } from '../components/ui';
import { runPathfinderQuery, splitAnswer, type PathfinderResult, type PathfinderSource } from '../services/pathfinder';

interface Props { orgId: string }

function SourceCard({ s }: { s: PathfinderSource }) {
  const isPrivate = s.type === 'private';
  return (
    <div
      className="mb-1.5 flex gap-2.5 rounded-[var(--radius-r2)] p-2.5"
      style={{
        background: isPrivate ? 'var(--color-accent-soft)' : 'var(--color-surface-alt)',
        border: `1px solid ${isPrivate ? 'var(--color-accent-dim)' : 'var(--color-border-soft)'}`,
      }}
    >
      <div
        className="flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded-full font-mono font-bold text-white"
        style={{ background: 'var(--color-text)', fontSize: '0.6875rem' }}
      >
        {s.n}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[0.75rem] font-semibold leading-tight text-[var(--color-text)]">
          {s.title}
        </div>
        <div className="mt-0.5 font-mono text-[0.625rem] text-[var(--color-text-muted)]">
          {s.domain}
        </div>
        {s.snippet && (
          <div className="mt-1 line-clamp-2 text-[0.6875rem] leading-relaxed text-[var(--color-text-body)]">
            {s.snippet}
          </div>
        )}
      </div>
      {isPrivate && (
        <Pill tone="teal" style={{ fontSize: '0.5625rem', alignSelf: 'flex-start' }}>YOURS</Pill>
      )}
    </div>
  );
}

export default function SearchScreen({ orgId }: Props): JSX.Element {
  const [draft,    setDraft]    = useState('');
  const [running,  setRunning]  = useState(false);
  const [result,   setResult]   = useState<PathfinderResult | null>(null);
  const [error,    setError]    = useState<string | null>(null);

  async function ask() {
    const q = draft.trim();
    if (!q || running) return;
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const r = await runPathfinderQuery(orgId, q);
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Pathfinder failed');
    } finally {
      setRunning(false);
    }
  }

  // Derive the thinking-trace header copy: "ANTON THOUGHT FOR Xs · Y STEPS"
  const traceHeader = result
    ? `ANTON THOUGHT FOR ${(result.took_ms / 1000).toFixed(1)}S · ${result.thoughts.length} STEP${result.thoughts.length === 1 ? '' : 'S'}`
    : null;

  const segments = result ? splitAnswer(result.answer) : [];

  return (
    <div className="flex flex-1 flex-col overflow-hidden" style={{ background: 'var(--color-bg)' }}>
      {/* ── Top bar ─────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{
          background: 'var(--color-surface-alt)',
          borderBottom: '1px solid var(--color-border-soft)',
          minHeight: 44,
        }}
      >
        <div>
          <h1
            className="text-[var(--color-text)]"
            style={{ fontSize: '0.875rem', fontWeight: 700, letterSpacing: '-0.3px', lineHeight: 1.05 }}
          >
            Pathfinder
          </h1>
          <div
            className="font-mono text-[0.625rem] text-[var(--color-text-muted)]"
            style={{ letterSpacing: '0.3px' }}
          >
            Search that thinks
          </div>
        </div>
        <Ico name="more" color="var(--color-text-muted)" size={18} />
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3.5">
        {/* ── Query composer ──────────────────────────────────── */}
        <div
          className="mb-3 flex items-end gap-2 rounded-[var(--radius-r2)] p-2.5"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
        >
          <label htmlFor="search-query" className="sr-only">Search query</label>
          <textarea
            id="search-query"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void ask();
              }
            }}
            rows={2}
            placeholder="Ask anything about your instance, the regulations you track, your portfolio…"
            className="min-h-[44px] flex-1 resize-none bg-transparent text-[0.875rem] leading-relaxed text-[var(--color-text)] placeholder:text-[var(--color-text-faint)] focus:outline-none"
            disabled={running}
          />
          <Btn
            size="sm"
            variant="primary"
            onClick={() => void ask()}
            disabled={running || !draft.trim()}
            icon={running
              ? <Spinner size="xs" tone="on-accent" />
              : <Ico name="arrowUp" color="currentColor" size={14} />}
          >
            {running ? 'Thinking' : 'Ask'}
          </Btn>
        </div>

        {error && (
          <div className="mb-3 rounded-[var(--radius-r2)] border border-[var(--color-red-dim)] bg-[var(--color-red-dim)] px-3 py-2 text-xs text-[var(--color-red)]">
            {error}
          </div>
        )}

        {/* ── Live "thinking" placeholder ─────────────────────── */}
        {running && !result && (
          <div className="rounded-[var(--radius-r2)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3.5">
            <div className="mb-2 flex items-center gap-1.5">
              <Spinner size="xs" />
              <span
                className="font-mono font-bold uppercase"
                style={{ fontSize: '0.625rem', color: 'var(--color-accent)', letterSpacing: '0.5px' }}
              >
                ANTON is thinking…
              </span>
            </div>
            <p className="text-[0.75rem] leading-relaxed text-[var(--color-text-muted)]">
              Searching your instance, then synthesising a cited answer.
            </p>
          </div>
        )}

        {/* ── Result ──────────────────────────────────────────── */}
        {result && (
          <>
            {/* Question card */}
            <div
              className="mb-3.5 rounded-[var(--radius-r2)] p-3.5"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
            >
              <div
                className="mb-1 font-mono text-[var(--color-text-muted)]"
                style={{ fontSize: '0.625rem', letterSpacing: '0.5px' }}
              >
                YOUR QUESTION
              </div>
              <div
                className="text-[var(--color-text)]"
                style={{ fontSize: '0.9375rem', fontWeight: 600, lineHeight: 1.35, letterSpacing: '-0.1px' }}
              >
                {result.question}
              </div>
            </div>

            {/* Thinking trace */}
            {result.thoughts.length > 0 && (
              <div className="mb-3.5">
                <div className="mb-2 flex items-center gap-1.5">
                  <Ico name="sparkles" color="var(--color-accent)" size={13} />
                  <span
                    className="font-mono font-bold uppercase"
                    style={{ fontSize: '0.625rem', color: 'var(--color-accent)', letterSpacing: '0.5px' }}
                  >
                    {traceHeader}
                  </span>
                </div>
                {result.thoughts.map((t, i) => (
                  <div key={i} className="mb-1 flex gap-2.5">
                    <div className="flex w-4 flex-shrink-0 flex-col items-center">
                      <div
                        className="flex h-3 w-3 items-center justify-center rounded-full text-white"
                        style={{ background: 'var(--color-accent)' }}
                      >
                        <Ico name="check" size={8} color="#fff" />
                      </div>
                      {i < result.thoughts.length - 1 && (
                        <div
                          className="w-px flex-1"
                          style={{ background: 'var(--color-accent-dim)', minHeight: 10 }}
                        />
                      )}
                    </div>
                    <div className="flex-1 pb-1 text-[0.75rem] leading-relaxed text-[var(--color-text-body)]">
                      {t}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Answer */}
            <div
              className="mb-3 rounded-[var(--radius-r3)] p-3.5"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
            >
              <div
                className="text-[0.875rem] leading-relaxed text-[var(--color-text)]"
                style={{ wordBreak: 'break-word' }}
              >
                {segments.length > 0 ? segments.map((seg, i) => (
                  seg.kind === 'text'
                    ? <span key={i}>{seg.value}</span>
                    : <sup
                        key={i}
                        className="font-bold"
                        style={{ color: 'var(--color-accent)', fontSize: '0.625rem', padding: '0 1px' }}
                      >[{seg.n}]</sup>
                )) : result.answer}
              </div>
            </div>

            {/* Sources */}
            {result.sources.length > 0 && (
              <>
                <SectionLabel className="mb-2">Sources · {result.sources.length}</SectionLabel>
                {result.sources.map(s => <SourceCard key={s.n} s={s} />)}
              </>
            )}

            {/* Privacy footer */}
            <div
              className="mt-4 text-center text-[0.6875rem] leading-relaxed text-[var(--color-text-faint)]"
            >
              You're never the product. No tracking. Your question stays on your instance.
            </div>
          </>
        )}

        {/* Empty state */}
        {!result && !running && !error && (
          <div className="mt-8 text-center">
            <Ico name="search" color="var(--color-text-faint)" size={32} />
            <p className="mt-3 text-sm text-[var(--color-text-muted)]">
              Ask Pathfinder anything.
            </p>
            <p className="mt-1 text-[0.6875rem] text-[var(--color-text-faint)]">
              It searches your instance and shows its reasoning before answering.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
