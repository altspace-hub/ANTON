/**
 * SettingBlock — Web UX v2 setting cell.
 *
 * Mono-uppercase label on top + content body. Optional `right` slot
 * for inline hints ("Controls temperature across providers"). Used as
 * the building block of the RunConfigPanel grid.
 */

import type { ReactNode } from 'react';
import { Section } from '../web-ui';

export interface SettingBlockProps {
  label: string;
  right?: ReactNode;
  /** Span across N grid columns (default 1). */
  span?: 1 | 2 | 3 | 4;
  children?: ReactNode;
  className?: string;
}

const SPAN: Record<1 | 2 | 3 | 4, string> = {
  1: '',
  2: 'col-span-2',
  3: 'col-span-3',
  4: 'col-span-4',
};

export function SettingBlock({ label, right, span = 1, children, className = '' }: SettingBlockProps): JSX.Element {
  return (
    <div className={`${SPAN[span]} ${className}`}>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <Section>{label}</Section>
        {right && <div className="text-[10px] text-[var(--color-text-faint)]">{right}</div>}
      </div>
      {children}
    </div>
  );
}
