/**
 * Kbd — Web UX v2 keyboard-shortcut chip.
 * Used in the shortcuts overlay and command palette footer.
 * Renders one or more parts joined by a faint separator.
 */

import type { ReactNode } from 'react';

export interface KbdProps {
  children: ReactNode;
}

export function Kbd({ children }: KbdProps): JSX.Element {
  return (
    <span
      className="inline-flex items-center justify-center rounded-[4px] border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-1.5 py-[1px] font-mono text-[10.5px] font-semibold text-[var(--color-text-body)]"
      style={{ minWidth: 18 }}
    >
      {children}
    </span>
  );
}

export interface KbdSequenceProps {
  parts: ReactNode[];
  className?: string;
}

/** Render multiple Kbds as a "⌘ + K" style sequence. */
export function KbdSequence({ parts, className = '' }: KbdSequenceProps): JSX.Element {
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      {parts.map((p, i) => (
        <span key={i} className="inline-flex items-center gap-1">
          {i > 0 && <span className="text-[var(--color-text-faint)] text-[10px]">+</span>}
          <Kbd>{p}</Kbd>
        </span>
      ))}
    </span>
  );
}
