import { useState } from 'react';
import { CheckCircle, AlertTriangle, ChevronDown, ChevronRight, ShieldCheck, Loader2 } from 'lucide-react';

// ── Types ───────────────────────────────────────────────────

interface CitationResult {
  citation: string;
  verified: boolean;
  comment: string;
}

interface CitationVerifierProps {
  /** The markdown output text to scan for citations */
  text: string;
  /** When true, skip the outer card wrapper (used when embedded in OutputToolbar) */
  embedded?: boolean;
}

// ── Component ───────────────────────────────────────────────

export default function CitationVerifier({ text, embedded }: CitationVerifierProps) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [citations, setCitations] = useState<CitationResult[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const verifiedCount = citations.filter((c) => c.verified).length;
  const flaggedCount = citations.filter((c) => !c.verified).length;

  async function handleVerify() {
    if (!text.trim()) return;
    setStatus('loading');
    setErrorMessage(null);
    setCitations([]);

    try {
      const res = await fetch('/api/claude/verify-citations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }

      const data = (await res.json()) as { citations: CitationResult[] };
      setCitations(data.citations);
      setStatus('done');

      // Auto-expand the list if there are flagged citations
      if (data.citations.some((c) => !c.verified)) {
        setExpanded(true);
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Verification failed.');
      setStatus('error');
    }
  }

  const content = (
    <>
      {/* Header row */}
      <div className={`flex items-center justify-between ${embedded ? '' : 'px-4 py-3'}`}>
        <div className="flex items-center gap-2">
          {!embedded && <ShieldCheck className="h-4 w-4 text-adv-gray" />}
          {!embedded && <span className="text-sm text-adv-gray">Citation Verification</span>}

          {/* Summary badges — shown after a completed run */}
          {status === 'done' && citations.length > 0 && (
            <div className="flex items-center gap-1.5 ml-1">
              <span className="inline-flex items-center gap-1 rounded-full bg-adv-green/20 px-2 py-0.5 text-xs font-medium text-adv-green">
                <CheckCircle className="h-3 w-3" />
                {verifiedCount} verified
              </span>
              {flaggedCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-adv-gold/20 px-2 py-0.5 text-xs font-medium text-adv-gold">
                  <AlertTriangle className="h-3 w-3" />
                  {flaggedCount} flagged
                </span>
              )}
            </div>
          )}

          {/* No citations found */}
          {status === 'done' && citations.length === 0 && (
            <span className="text-xs text-adv-gray-med ml-1">No regulatory citations detected.</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Expand/collapse toggle — only when there are results */}
          {status === 'done' && citations.length > 0 && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="text-adv-gray-med hover:text-adv-off-white transition-colors"
              aria-label={expanded ? 'Collapse citation list' : 'Expand citation list'}
            >
              {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </button>
          )}

          {/* Verify button */}
          {status !== 'loading' && (
            <button
              onClick={handleVerify}
              disabled={!text.trim()}
              className="flex items-center gap-1.5 rounded-md bg-adv-teal/10 border border-adv-teal/30 px-3 py-1 text-xs font-medium text-adv-teal hover:bg-adv-teal/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ShieldCheck className="h-3 w-3" />
              {status === 'done' ? 'Re-verify' : 'Verify Citations'}
            </button>
          )}

          {/* Loading state */}
          {status === 'loading' && (
            <div className="flex items-center gap-1.5 text-xs text-adv-gray">
              <Loader2 className="h-3 w-3 animate-spin" />
              Checking citations...
            </div>
          )}
        </div>
      </div>

      {/* Error message */}
      {status === 'error' && errorMessage && (
        <div className={`${embedded ? 'pt-2' : 'border-t border-border px-4 pb-3 pt-2'}`}>
          <p className="text-xs text-adv-red">{errorMessage}</p>
        </div>
      )}

      {/* Expandable citation list */}
      {status === 'done' && expanded && citations.length > 0 && (
        <div className={`space-y-2 ${embedded ? 'pt-3' : 'border-t border-border px-4 pb-4 pt-3'}`}>
          {citations.map((c, i) => (
            <div
              key={i}
              className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${
                c.verified
                  ? 'bg-adv-green/5 border border-adv-green/20'
                  : 'bg-adv-gold/5 border border-adv-gold/20'
              }`}
            >
              {c.verified ? (
                <CheckCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-adv-green" />
              ) : (
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-adv-gold" />
              )}
              <div className="min-w-0">
                <span className={`font-medium ${c.verified ? 'text-adv-off-white' : 'text-adv-gold'}`}>
                  {c.citation}
                </span>
                {c.comment && (
                  <p className="mt-0.5 text-adv-gray-med leading-relaxed">{c.comment}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );

  if (embedded) return content;

  return (
    <div className="rounded-xl border border-border bg-adv-card">
      {content}
    </div>
  );
}
