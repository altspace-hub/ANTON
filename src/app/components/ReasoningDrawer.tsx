/**
 * ReasoningDrawer — Expandable reasoning trail below assistant messages.
 */

import { useState } from 'react';
import { Ico } from './ui';

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
        className="flex items-center gap-1.5 text-[12px] transition"
        style={{ color: 'var(--color-text-muted)' }}
        aria-expanded={open}
      >
        <span
          className="inline-flex transition-transform"
          style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}
          aria-hidden="true"
        >
          <Ico name="chevronRight" size={12} />
        </span>
        {open ? 'Hide reasoning' : 'View reasoning'}
      </button>
      {open && (
        <div
          className="mt-2 rounded-[var(--radius-r2)] px-3 py-2.5 text-[12px] leading-relaxed whitespace-pre-wrap max-h-60 overflow-y-auto"
          style={{
            background: 'var(--color-surface)',
            color: 'var(--color-text-muted)',
            border: '1px solid var(--color-border-soft)',
          }}
        >
          {thinking}
        </div>
      )}
    </div>
  );
}
