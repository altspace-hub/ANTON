/**
 * SheetTitle — canonical title style for bottom sheets.
 *
 * UL6: was inline 15/700 in BottomSheet only — extracted so any sheet-like
 * component (InstanceSwitcher, ApprovalsScreen DetailSheet, future custom
 * sheets) can match the typography exactly without re-typing the magic
 * numbers.
 */

import type { HTMLAttributes, ReactNode } from 'react';

export interface SheetTitleProps extends HTMLAttributes<HTMLHeadingElement> {
  children?: ReactNode;
}

export function SheetTitle({ children, className = '', style, ...rest }: SheetTitleProps): JSX.Element {
  return (
    <h2
      {...rest}
      className={`text-base font-bold ${className}`}
      style={{ color: 'var(--color-text)', letterSpacing: '-0.2px', ...style }}
    >
      {children}
    </h2>
  );
}
