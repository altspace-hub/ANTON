// StageExplainer — collapsible per-stage explainer.
// Plain-English explanation of what the stage means, with a worked example
// from the loaded industry pack where available. Per spec §4.3 — "every
// stage has a plain-English explainer that is shown on first entry."

import { useState } from 'react';
import { Info, ChevronDown, ChevronRight } from 'lucide-react';

interface StageExplainerProps {
  stage: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  defaultOpen?: boolean;
  /** Optional pack-supplied Socratic script content for this stage */
  socraticScript?: string | null;
}

const STAGE_BLURB: Record<number, { title: string; lede: string; rule: string | null }> = {
  1: {
    title: 'Stage 1 — Exposure Map',
    lede: 'What in your business creates exposure? The surfaces where harm could land. We map first; we score later.',
    rule: null,
  },
  2: {
    title: 'Stage 2 — Threat Paths',
    lede: 'Which harm scenarios are credible? Each threat path is a short story — not a category. "Fake supplier sends an invoice and we pay it" beats "operational fraud risk".',
    rule: null,
  },
  3: {
    title: 'Stage 3 — Vulnerabilities',
    lede: 'Which weaknesses make threats plausible? Concrete ("no MFA on banking accounts"), not abstract ("weak access control"). Severity 1-5.',
    rule: null,
  },
  4: {
    title: 'Stage 4 — Inherent Risk',
    lede: 'How bad would the situation be without your controls? Score Exposure, Threat credibility, and Vulnerability each 1-5.',
    rule: 'Inherent = MAX of the three. Chain is as weak as its weakest link. The calculator owns this number.',
  },
  5: {
    title: 'Stage 5 — Controls',
    lede: 'Which controls Prevent, Detect, or Respond — and how strong? A control marked Strong needs evidence on file (the UI refuses Strong without it).',
    rule: 'Strong = -2 from inherent. Adequate = -1. Weak = 0. The rollup is the worst-of strengths across all controls touching the path.',
  },
  6: {
    title: 'Stage 6 — Residual Risk',
    lede: 'What\'s left after controls? Calculated automatically from the inherent score and the worst-of control rollup. Not editable by hand.',
    rule: 'Residual = Inherent − reduction(rollup), clamped [1, 5]. The calculator is deterministic; the same state always produces the same number.',
  },
  7: {
    title: 'Stage 7 — Risk Appetite',
    lede: 'Is what\'s left acceptable? You make the call. The calculator suggests a position; the board signs off.',
    rule: '1-2 = within. 3 = boundary (act when cost-effective). 4 = outside (act now). 5 = unacceptable (stop OR formally accept as tolerated non-compliance).',
  },
};

export default function StageExplainer({ stage, defaultOpen = false, socraticScript = null }: StageExplainerProps) {
  const [open, setOpen] = useState(defaultOpen);
  const meta = STAGE_BLURB[stage];

  return (
    <div className="rounded-lg border border-adv-blue/30 bg-adv-blue/5">
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-3 py-2 flex items-center gap-2 text-left text-xs hover:bg-adv-blue/10 transition-colors"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5 text-adv-blue" /> : <ChevronRight className="h-3.5 w-3.5 text-adv-blue" />}
        <Info className="h-3.5 w-3.5 text-adv-blue" />
        <span className="font-medium text-adv-blue">{meta.title}</span>
        <span className="text-adv-gray ml-auto">{open ? 'collapse' : 'what is this?'}</span>
      </button>

      {open && (
        <div className="px-4 pb-3 pt-1 space-y-2 text-[12px] text-adv-off-white border-t border-adv-blue/20">
          <p>{meta.lede}</p>
          {meta.rule && (
            <p className="rounded bg-adv-dark/40 border border-adv-blue/20 px-2 py-1.5 text-adv-blue text-[11px]">
              <span className="font-semibold">Rule:</span> {meta.rule}
            </p>
          )}
          {socraticScript && (
            <details className="text-[11px]">
              <summary className="cursor-pointer text-adv-gray hover:text-adv-off-white">Socratic walkthrough (from the loaded pack)</summary>
              <pre className="mt-2 whitespace-pre-wrap font-mono text-[10.5px] text-adv-gray bg-adv-dark/40 border border-border rounded p-2 leading-snug">
                {socraticScript.slice(0, 4000)}
                {socraticScript.length > 4000 && '\n…'}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
