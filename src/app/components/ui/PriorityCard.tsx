/**
 * PriorityCard — A "things needing your attention" card with an accent-
 * colored left border. Used for: approvals waiting, morning briefings,
 * critical alerts on Home, Markets, Radar.
 *
 * Pattern (Claude Design — "Same Home, four people"):
 *   ┌─────────────────────────────────────────────┐
 *   │█│ ● 3 APPROVALS WAITING       Review →     │
 *   │█│                                            │
 *   │█│ Sanctions policy v4.0 — sign-off          │
 *   │█│ ANTON drafted Phase 1 controls. Legal +   │
 *   │█│ Compliance already signed. You're last.   │
 *   │█│                                            │
 *   │█│ [HIGH] [REQ-8741] [Biometric]             │
 *   └─────────────────────────────────────────────┘
 *    ↑ 3px accent-colored left border
 *
 * The header strip (background tinted in the same accent) signals "this
 * is the one to deal with first." The content area is plain white.
 *
 * Usage:
 *   <PriorityCard
 *     headerLeft={<>● 3 approvals waiting</>}
 *     headerRight="Review →"
 *     onClick={...}
 *   >
 *     <div>Title</div>
 *     <div>Body</div>
 *     <div>Pills</div>
 *   </PriorityCard>
 */

import type { CSSProperties, ReactNode } from 'react';

export type PriorityTone = 'accent' | 'red' | 'gold' | 'blue';

const TONE: Record<PriorityTone, { border: string; headerBg: string; headerFg: string }> = {
  accent: {
    border:   'var(--color-accent)',
    headerBg: 'var(--color-accent-soft)',
    headerFg: 'var(--color-accent)',
  },
  red: {
    border:   'var(--color-red)',
    headerBg: 'var(--color-red-dim)',
    headerFg: 'var(--color-red)',
  },
  gold: {
    border:   'var(--color-gold)',
    headerBg: 'var(--color-gold-dim)',
    headerFg: 'var(--color-gold)',
  },
  blue: {
    border:   'var(--color-blue)',
    headerBg: 'var(--color-blue-dim)',
    headerFg: 'var(--color-blue)',
  },
};

export interface PriorityCardProps {
  tone?: PriorityTone;
  /** Header left content (e.g. count + label, often with a bullet dot). */
  headerLeft?: ReactNode;
  /** Header right content — usually a "Review →" CTA hint. */
  headerRight?: ReactNode;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export function PriorityCard({
  tone = 'accent',
  headerLeft,
  headerRight,
  onClick,
  children,
  className = '',
  style,
}: PriorityCardProps): JSX.Element {
  const t = TONE[tone];
  const Tag = onClick ? 'button' : 'div';

  return (
    <Tag
      onClick={onClick}
      className={`block w-full overflow-hidden rounded-[var(--radius-r3)] text-left transition active:scale-[0.99] ${className}`}
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderLeft: `3px solid ${t.border}`,
        ...style,
      }}
    >
      {(headerLeft || headerRight) && (
        <div
          className="flex items-center justify-between px-4 py-2.5"
          style={{ background: t.headerBg, color: t.headerFg }}
        >
          <span
            className="font-mono font-bold uppercase"
            style={{ fontSize: '0.6875rem', letterSpacing: '0.6px' }}
          >
            {headerLeft}
          </span>
          {headerRight && (
            <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>{headerRight}</span>
          )}
        </div>
      )}
      <div className="px-4 py-3.5">
        {children}
      </div>
    </Tag>
  );
}
