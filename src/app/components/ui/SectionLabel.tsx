/**
 * SectionLabel — uppercase mono label, used above lists / cards.
 * 11 px, weight 600, tracking 0.8 px, colour textMuted.
 */

import type { HTMLAttributes, ReactNode } from 'react';

export interface SectionLabelProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
}

export function SectionLabel({ children, className = '', style, ...rest }: SectionLabelProps): JSX.Element {
  return (
    <div
      {...rest}
      className={`font-mono text-[11px] font-semibold uppercase text-[var(--color-text-muted)] ${className}`}
      style={{ letterSpacing: '0.8px', ...style }}
    >
      {children}
    </div>
  );
}
