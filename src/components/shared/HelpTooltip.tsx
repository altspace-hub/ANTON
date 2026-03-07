import { Info } from 'lucide-react';
import { useState } from 'react';

interface HelpTooltipProps {
  text: string;
}

export default function HelpTooltip({ text }: HelpTooltipProps) {
  const [show, setShow] = useState(false);

  return (
    <div className="relative inline-block">
      <button
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onFocus={() => setShow(true)}
        onBlur={() => setShow(false)}
        className="text-adv-gray hover:text-adv-gray transition-colors"
        aria-label="Help"
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      {show && (
        <div className="absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 rounded-lg border border-border bg-adv-card px-3 py-2 shadow-lg">
          <p className="whitespace-nowrap text-xs text-adv-off-white">{text}</p>
          <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-adv-card" />
        </div>
      )}
    </div>
  );
}
