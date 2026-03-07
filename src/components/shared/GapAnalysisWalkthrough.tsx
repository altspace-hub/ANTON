/**
 * ONBOARD-02: Guided "first gap analysis" walkthrough.
 * Shows a 3-step inline guide on the first visit to the gap-analysis module.
 * Dismisses permanently when the user clicks "Got it" or completes step 3.
 */
import { useState } from 'react';
import { X, Upload, Package, Play, CheckCircle2 } from 'lucide-react';

const STORAGE_KEY = 'openexpert-gap-walkthrough-done';

interface Step {
  icon: React.ReactNode;
  title: string;
  body: string;
}

const STEPS: Step[] = [
  {
    icon: <Upload className="h-4 w-4 text-adv-teal shrink-0 mt-0.5" />,
    title: 'Step 1 — Upload your policy or framework document',
    body: 'Use the Files & Folders section below to upload your client\'s AML policy, programme document, or internal framework. PDF, Word (.docx), and plain text files are supported.',
  },
  {
    icon: <Package className="h-4 w-4 text-adv-teal shrink-0 mt-0.5" />,
    title: 'Step 2 — Select the AMLR 2024 knowledge pack',
    body: 'In the Knowledge Sources panel, enable "Claude\'s Own Knowledge" with web search on, and optionally activate the AMLR 2024 regulatory knowledge pack from the Knowledge Base. This gives Claude access to the full AMLR text as structured reference material.',
  },
  {
    icon: <Play className="h-4 w-4 text-adv-teal shrink-0 mt-0.5" />,
    title: 'Step 3 — Run the gap analysis',
    body: 'Select "Gap Scoring Matrix" and "Executive Summary" in the Output Formats panel. Set thinking to "Investigate" for the deepest analysis. Then click "Run Analysis" at the bottom. Claude will compare your document against AMLR requirements and produce a scored gap assessment.',
  },
];

interface Props {
  moduleId: string;
}

export default function GapAnalysisWalkthrough({ moduleId }: Props) {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return !!localStorage.getItem(STORAGE_KEY);
    } catch {
      return false;
    }
  });

  if (moduleId !== 'gap-analysis' || dismissed) return null;

  function dismiss() {
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      // ignore
    }
    setDismissed(true);
  }

  return (
    <div className="rounded-lg border border-adv-teal/30 bg-adv-teal-soft p-4 text-sm">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-adv-teal" />
          <span className="font-semibold text-adv-teal">Quick start — your first AMLR gap analysis</span>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="rounded p-0.5 text-adv-gray hover:text-adv-off-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-adv-teal"
          aria-label="Dismiss walkthrough"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="space-y-3">
        {STEPS.map((step, i) => (
          <div key={i} className="flex gap-2.5">
            {step.icon}
            <div>
              <p className="font-medium text-adv-off-white text-xs">{step.title}</p>
              <p className="mt-0.5 text-xs text-adv-gray leading-relaxed">{step.body}</p>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={dismiss}
        className="mt-3 rounded-lg bg-adv-teal px-3 py-1.5 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-adv-teal"
      >
        Got it — hide this guide
      </button>
    </div>
  );
}
