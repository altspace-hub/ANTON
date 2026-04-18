/**
 * Btn — Web UX v2 button primitive (Evolution direction).
 *
 * Six variants × three sizes. Min touch target ≥ 32 px (web is denser
 * than companion). Uses CSS vars so it picks up the active theme +
 * data-accent automatically.
 */

import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type BtnVariant = 'primary' | 'secondary' | 'subtle' | 'accent' | 'ghost' | 'danger';
export type BtnSize    = 'sm' | 'md' | 'lg';

export interface BtnProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant?: BtnVariant;
  size?: BtnSize;
  block?: boolean;
  icon?: ReactNode;
  iconRight?: ReactNode;
  children?: ReactNode;
}

const SIZE: Record<BtnSize, string> = {
  sm: 'px-3 py-1.5 text-[12px] min-h-[28px]',
  md: 'px-4 py-2 text-[13px] min-h-[34px]',
  lg: 'px-5 py-2.5 text-[14px] min-h-[40px]',
};

const VARIANT: Record<BtnVariant, string> = {
  primary:   'bg-[var(--color-adv-teal)] text-[var(--color-accent-fg)] border-[var(--color-adv-teal)] hover:bg-[var(--color-accent-hover)] hover:border-[var(--color-accent-hover)]',
  secondary: 'bg-[var(--color-surface)] text-[var(--color-text-body)] border-[var(--color-border)] hover:bg-[var(--color-surface-alt)]',
  subtle:    'bg-transparent text-[var(--color-text-muted)] border-transparent hover:bg-[var(--color-surface-alt)]',
  accent:    'bg-[var(--color-accent-soft)] text-[var(--color-adv-teal)] border-[var(--color-accent-dim)] hover:bg-[var(--color-accent-dim)]',
  ghost:     'bg-transparent text-[var(--color-text-body)] border-[var(--color-border)] hover:bg-[var(--color-surface-alt)]',
  danger:    'bg-[var(--color-red)] text-white border-[var(--color-red)] hover:opacity-90',
};

export function Btn({
  variant = 'primary',
  size = 'md',
  block,
  icon,
  iconRight,
  children,
  className = '',
  ...rest
}: BtnProps): JSX.Element {
  return (
    <button
      {...rest}
      className={`
        inline-flex items-center justify-center gap-2
        font-semibold leading-none whitespace-nowrap
        rounded-[var(--radius-r1)] border
        transition-colors disabled:opacity-50 disabled:cursor-not-allowed
        active:scale-[0.98]
        ${SIZE[size]} ${VARIANT[variant]} ${block ? 'w-full' : ''} ${className}
      `}
    >
      {icon}
      {children}
      {iconRight}
    </button>
  );
}
