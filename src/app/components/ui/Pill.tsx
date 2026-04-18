/**
 * Pill — small status badge. 11 px text, 999 px radius.
 * Tones use status colours (LOCKED — never change with accent), with
 * `teal` as the accent-tinted variant (which DOES follow the accent).
 */

import type { HTMLAttributes, ReactNode } from 'react';

export type PillTone = 'neutral' | 'teal' | 'gold' | 'red' | 'green' | 'blue';

export interface PillProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: PillTone;
  /** Use mono font (for hashes, codes, IDs). */
  mono?: boolean;
  children?: ReactNode;
}

const TONE: Record<PillTone, string> = {
  neutral: 'bg-[var(--color-surface-alt)] text-[var(--color-text-body)] border-[var(--color-border)]',
  teal:    'bg-[var(--color-accent-soft)] text-[var(--color-accent)] border-[var(--color-accent-dim)]',
  gold:    'bg-[var(--color-gold-dim)] text-[var(--color-gold)] border-[var(--color-gold-dim)]',
  red:     'bg-[var(--color-red-dim)] text-[var(--color-red)] border-[var(--color-red-dim)]',
  green:   'bg-[var(--color-green-dim)] text-[var(--color-green)] border-[var(--color-green-dim)]',
  blue:    'bg-[var(--color-blue-dim)] text-[var(--color-blue)] border-[var(--color-blue-dim)]',
};

export function Pill({ tone = 'neutral', mono, children, className = '', style, ...rest }: PillProps): JSX.Element {
  return (
    <span
      {...rest}
      className={`
        inline-flex items-center gap-1
        px-2 py-[3px] rounded-full border
        text-[11px] font-semibold whitespace-nowrap
        ${mono ? 'font-mono tracking-normal' : 'tracking-[0.2px]'}
        ${TONE[tone]} ${className}
      `}
      style={style}
    >
      {children}
    </span>
  );
}
