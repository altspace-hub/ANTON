// GlossaryTooltip — hover/tap explainer for a domain term.
// Wraps a term inline so the user can hover (desktop) or tap (touch) to
// see a 1-2 sentence plain-English definition. The glossary itself comes
// from the active industry pack.

import { useState } from 'react';
import { HelpCircle } from 'lucide-react';

interface GlossaryTooltipProps {
  term: string;
  glossary: Record<string, string>;
  /** If true, render the term as the displayed text; otherwise render children. */
  children?: React.ReactNode;
}

export default function GlossaryTooltip({ term, glossary, children }: GlossaryTooltipProps) {
  const [open, setOpen] = useState(false);
  const definition = glossary[term];
  if (!definition) return <>{children ?? term}</>;

  return (
    <span className="relative inline-flex items-center gap-0.5">
      <span
        className="border-b border-dotted border-adv-teal/60 cursor-help"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onClick={() => setOpen(o => !o)}
      >
        {children ?? term}
      </span>
      <HelpCircle className="h-2.5 w-2.5 text-adv-teal/60 ml-0.5" />
      {open && (
        <span
          role="tooltip"
          className="absolute z-30 top-full left-0 mt-1 w-72 rounded-md border border-border bg-adv-card px-3 py-2 text-[11px] text-adv-off-white shadow-lg"
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
        >
          <div className="text-[10px] uppercase tracking-wider text-adv-teal mb-1">{term}</div>
          {definition}
        </span>
      )}
    </span>
  );
}
