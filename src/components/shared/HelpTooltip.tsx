import { Info } from 'lucide-react';
import { useId, useState } from 'react';

interface HelpTooltipProps {
  text: string;
  /** Optional wider tooltip for long descriptions (default: max-w-xs) */
  wide?: boolean;
}

export default function HelpTooltip({ text, wide = false }: HelpTooltipProps) {
  const [show, setShow] = useState(false);
  const tooltipId = useId();

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onFocus={() => setShow(true)}
        onBlur={() => setShow(false)}
        className="text-adv-gray hover:text-adv-teal transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-adv-teal rounded"
        aria-label="Help"
        aria-describedby={show ? tooltipId : undefined}
        aria-expanded={show}
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      {show && (
        <div
          id={tooltipId}
          role="tooltip"
          className={`absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 rounded-lg border border-border bg-adv-card px-3 py-2 shadow-lg ${wide ? 'w-72' : 'max-w-xs'}`}
        >
          <p className="text-xs text-adv-off-white whitespace-pre-line leading-relaxed">{text}</p>
          <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-adv-card" />
        </div>
      )}
    </div>
  );
}
