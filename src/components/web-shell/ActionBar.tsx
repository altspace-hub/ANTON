/**
 * ActionBar — Web UX v2 left+right action row.
 *
 * Used below the output card for Export/Share/Tools (left) and
 * Rate/Status (right). Wraps on narrow viewports.
 */

import type { CSSProperties, ReactNode } from 'react';

export interface ActionBarProps {
  left?: ReactNode;
  right?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export function ActionBar({ left, right, className = '', style }: ActionBarProps): JSX.Element {
  return (
    <div
      className={`flex flex-wrap items-center gap-1.5 px-3.5 py-2.5 ${className}`}
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-r2)',
        ...style,
      }}
    >
      {left}
      <div className="flex-1" />
      {right}
    </div>
  );
}
