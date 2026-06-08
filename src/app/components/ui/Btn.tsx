/**
 * Btn — primary / secondary / ghost / danger button.
 *
 * Ports design/primitives.jsx → Tailwind. Min touch target 44 × 44 px
 * (handhandoff README §Responsive). Inherits accent at runtime via
 * --color-accent (no need to re-render on accent change).
 */

import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type BtnSize    = 'sm' | 'md' | 'lg';

export interface BtnProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant?: BtnVariant;
  size?: BtnSize;
  block?: boolean;
  icon?: ReactNode;
  children?: ReactNode;
}

const SIZE: Record<BtnSize, string> = {
  sm: 'px-3.5 py-2 text-[0.8125rem] min-h-[36px]',
  md: 'px-[18px] py-3 text-sm min-h-[44px]',
  lg: 'px-5 py-3.5 text-base min-h-[48px]',
};

const VARIANT: Record<BtnVariant, string> = {
  primary:   'bg-[var(--color-accent)] text-[var(--color-accent-fg)] border-[var(--color-accent)] hover:bg-[var(--color-accent-dark)] hover:border-[var(--color-accent-dark)]',
  secondary: 'bg-[var(--color-surface)] text-[var(--color-text)] border-[var(--color-border)] hover:bg-[var(--color-surface-alt)]',
  ghost:     'bg-transparent text-[var(--color-text-body)] border-[var(--color-border)] hover:bg-[var(--color-surface-alt)]',
  danger:    'bg-[var(--color-red)] text-white border-[var(--color-red)] hover:opacity-90',
};

export function Btn({
  variant = 'primary',
  size = 'md',
  block,
  icon,
  children,
  className = '',
  ...rest
}: BtnProps): JSX.Element {
  return (
    <button
      {...rest}
      className={`
        inline-flex items-center justify-center gap-2
        font-semibold leading-none tracking-[-0.1px]
        rounded-[var(--radius-r1)] border
        transition-colors disabled:opacity-50 disabled:cursor-not-allowed
        active:scale-[0.98]
        ${SIZE[size]} ${VARIANT[variant]} ${block ? 'w-full' : ''} ${className}
      `}
    >
      {icon}
      {children}
    </button>
  );
}
