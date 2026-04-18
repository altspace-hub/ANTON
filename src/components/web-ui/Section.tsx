/**
 * Section — Web UX v2 uppercase mono label.
 * 11 px, weight 600, tracking 0.4 px, colour textMuted, mono font.
 * Used above lists / cards / settings rows.
 */

import type { HTMLAttributes, ReactNode } from 'react';

export interface SectionProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
}

export function Section({ children, className = '', ...rest }: SectionProps): JSX.Element {
  return (
    <div
      {...rest}
      className={`font-mono text-[11px] font-semibold uppercase text-[var(--color-text-muted)] tracking-[0.4px] ${className}`}
    >
      {children}
    </div>
  );
}
