import { useState } from 'react';
import { ChevronDown, ChevronRight, Star, X } from 'lucide-react';

interface ReferenceOutputPanelProps {
  value: string;
  onChange: (v: string) => void;
}

export default function ReferenceOutputPanel({ value, onChange }: ReferenceOutputPanelProps) {
  const [expanded, setExpanded] = useState(value.length > 0);

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-sm text-adv-gray hover:text-adv-off-white transition-colors"
      >
        {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        <Star className="h-3 w-3" />
        <span className="font-medium">Reference output</span>
        <span className="text-[11px] text-adv-gray">(optional)</span>
        {value.trim().length > 0 && (
          <span className="rounded-full bg-adv-teal/20 px-1.5 py-0.5 text-xs text-adv-teal">set</span>
        )}
      </button>

      {expanded && (
        <div className="mt-2 rounded-lg border border-border bg-adv-dark-2 p-3">
          <p className="mb-2 text-[11px] text-adv-gray">
            Paste a high-quality example of the kind of output you want Claude to produce. Claude will match its structure, depth, and formatting.
          </p>

          <div className="relative">
            <textarea
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder="Paste a golden example output here — e.g. a previous high-quality gap analysis, report, or memo that Claude should emulate..."
              className="w-full rounded-lg border border-border bg-adv-dark p-2.5 pr-8 text-xs text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 focus:ring-1 focus:ring-adv-teal"
              rows={6}
            />
            {value.trim().length > 0 && (
              <button
                onClick={() => onChange('')}
                className="absolute right-2 top-2 text-adv-gray hover:text-adv-red transition-colors"
                title="Clear reference output"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {value.trim().length > 0 && (
            <p className="mt-1.5 text-xs text-adv-gray">
              {value.trim().length.toLocaleString()} chars · will be injected into the system prompt
            </p>
          )}
        </div>
      )}
    </div>
  );
}
