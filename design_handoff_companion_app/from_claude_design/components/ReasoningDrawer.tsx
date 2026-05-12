/**
 * ReasoningDrawer — Expandable reasoning trail below assistant messages.
 */

import { useState } from 'react';

interface Props {
  thinking: string;
}

export default function ReasoningDrawer({ thinking }: Props) {
  const [open, setOpen] = useState(false);

  if (!thinking) return null;

  return (
    <div className="mt-1.5">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-[11px] text-adv-gray/60 hover:text-adv-teal/80 transition"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`transition-transform ${open ? 'rotate-90' : ''}`}>
          <path d="M9 18l6-6-6-6"/>
        </svg>
        {open ? 'Hide reasoning' : 'View reasoning'}
      </button>
      {open && (
        <div className="mt-2 rounded-lg border border-border/50 bg-adv-dark/50 px-3 py-2.5 text-xs text-adv-gray/70 leading-relaxed whitespace-pre-wrap max-h-60 overflow-y-auto">
          {thinking}
        </div>
      )}
    </div>
  );
}
