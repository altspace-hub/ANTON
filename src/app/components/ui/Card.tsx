/**
 * Card — surface with 1 px border + r2 radius.
 * Default padding 16 px (matches design/primitives.jsx).
 */

import type { HTMLAttributes, ReactNode } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Padding in pixels (default 16). Pass 0 for no padding. */
  p?: number;
  children?: ReactNode;
}

export function Card({ p = 16, children, className = '', style, ...rest }: CardProps): JSX.Element {
  return (
    <div
      {...rest}
      className={`bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-r2)] ${className}`}
      style={{ padding: p, ...style }}
    >
      {children}
    </div>
  );
}
