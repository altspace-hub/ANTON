/**
 * RailCard — Web UX v2 right-rail panel.
 *
 * Used for Trust score, Citations, Run timeline, Session resources, etc.
 * Title row supports an optional `right` slot (e.g. a "High" pill).
 */

import type { CSSProperties, ReactNode } from 'react';
import { Section } from '../web-ui';

export interface RailCardProps {
  title: string;
  right?: ReactNode;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export function RailCard({ title, right, children, className = '', style }: RailCardProps): JSX.Element {
  return (
    <div
      className={`mb-2.5 p-3 ${className}`}
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-r2)',
        ...style,
      }}
    >
      <div className="mb-2 flex items-center justify-between">
        <Section>{title}</Section>
        {right}
      </div>
      {children}
    </div>
  );
}
