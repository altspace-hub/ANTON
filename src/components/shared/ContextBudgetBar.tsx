/**
 * ContextBudgetBar
 * Shows a live breakdown of token usage before running:
 *   System prompt · History · Message · Documents → Total / Max
 * Turns amber at 75%, red at 90%.
 */

import { useMemo } from 'react';
import { AlertTriangle, Info } from 'lucide-react';

const CHARS_PER_TOKEN = 4;

function est(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

// Context windows per model: Opus 4.8 + Sonnet 4.6 = 1M (GA)
const CONTEXT_WINDOWS: Record<string, number> = {
  'claude-fable-5': 1_000_000,
  'claude-opus-4-8': 1_000_000,
  'claude-sonnet-4-6': 1_000_000,
  'claude-sonnet-4-5-20250929': 200_000,
  'claude-haiku-4-5-20251001': 200_000,
  'gpt-4o': 128_000,
  'gpt-4o-mini': 128_000,
  'gemini-2.0-flash': 1_000_000,
  'mistral-large-latest': 128_000,
};

function fmt(n: number): string {
  if (n < 1000) return `${n}`;
  return `${(n / 1000).toFixed(1)}k`;
}

interface Props {
  systemPrompt: string;
  userInput: string;
  history: { role: string; content: string }[];
  model: string;
  /** estimated tokens from uploaded/fetched documents */
  documentTokens?: number;
}

export default function ContextBudgetBar({ systemPrompt, userInput, history, model, documentTokens = 0 }: Props) {
  const breakdown = useMemo(() => {
    const system = est(systemPrompt);
    const historyTokens = history.reduce((sum, m) => sum + est(m.content), 0);
    const message = est(userInput);
    const docs = documentTokens;
    const total = system + historyTokens + message + docs;
    const maxCtx = CONTEXT_WINDOWS[model] ?? 200_000;
    const pct = Math.min(100, (total / maxCtx) * 100);
    const level: 'ok' | 'warning' | 'critical' =
      pct >= 90 ? 'critical' : pct >= 75 ? 'warning' : 'ok';
    return { system, history: historyTokens, message, docs, total, maxCtx, pct, level };
  }, [systemPrompt, userInput, history, model, documentTokens]);

  const barColor =
    breakdown.level === 'critical'
      ? 'bg-adv-red'
      : breakdown.level === 'warning'
      ? 'bg-adv-gold'
      : 'bg-adv-teal';

  const textColor =
    breakdown.level === 'critical'
      ? 'text-adv-red'
      : breakdown.level === 'warning'
      ? 'text-adv-gold'
      : 'text-adv-gray';

  // Only show when there's something meaningful to show
  if (breakdown.total < 100) return null;

  return (
    <div className="rounded-lg border border-border bg-adv-dark px-3 py-2 space-y-1.5">
      {/* Progress bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 rounded-full bg-adv-dark-2 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${barColor}`}
            style={{ width: `${breakdown.pct}%` }}
          />
        </div>
        <span className={`text-[11px] font-medium tabular-nums shrink-0 ${textColor}`}>
          {fmt(breakdown.total)} / {fmt(breakdown.maxCtx)}
        </span>
      </div>

      {/* Breakdown row */}
      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
        <span className="text-xs text-adv-gray">
          <span className="text-adv-gray">Prompt</span> {fmt(breakdown.system)}
        </span>
        {breakdown.docs > 0 && (
          <span className="text-xs text-adv-gray">
            <span className="text-adv-gray">Docs</span> {fmt(breakdown.docs)}
          </span>
        )}
        {breakdown.history > 0 && (
          <span className="text-xs text-adv-gray">
            <span className="text-adv-gray">History</span> {fmt(breakdown.history)}
          </span>
        )}
        <span className="text-xs text-adv-gray">
          <span className="text-adv-gray">Message</span> {fmt(breakdown.message)}
        </span>
      </div>

      {/* Warning / critical message */}
      {breakdown.level === 'warning' && (
        <div className="flex items-center gap-1.5 text-[11px] text-adv-gold">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          Approaching context limit — consider reducing document load or conversation history.
        </div>
      )}
      {breakdown.level === 'critical' && (
        <div className="flex items-center gap-1.5 text-[11px] text-adv-red">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          Context nearly full. Reduce documents or start a new session to continue.
        </div>
      )}
      {breakdown.level === 'ok' && breakdown.pct > 30 && (
        <div className="flex items-center gap-1 text-xs text-adv-gray">
          <Info className="h-2.5 w-2.5 shrink-0" />
          {Math.round(breakdown.pct)}% of {fmt(breakdown.maxCtx)} token window used
        </div>
      )}
      {model === 'claude-haiku-4-5-20251001' && breakdown.pct > 60 && breakdown.level !== 'critical' && (
        <div className="flex items-center gap-1.5 text-[11px] text-adv-blue">
          <Info className="h-3 w-3 shrink-0" />
          Haiku has a 200k context window. Switch to Opus or Sonnet 4.6 for 1M context and automatic compaction.
        </div>
      )}
    </div>
  );
}
