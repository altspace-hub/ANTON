/**
 * StatTriplet — Three-column stat header used at the top of dashboard
 * screens (Horizon Radar, Markets). Big number on top, mono caps label
 * below; values can be tone-coloured (accent / red / gold).
 *
 * Pattern (Claude Design Horizon Radar):
 *   ┌──────────┬──────────────┬──────────────────┐
 *   │   42     │      3       │       1          │
 *   │ NEW TODAY│HIGH RELEVANCE│ ACTION SUGGESTED │
 *   └──────────┴──────────────┴──────────────────┘
 */

import type { CSSProperties } from 'react';

export type StatTone = 'text' | 'accent' | 'red' | 'gold' | 'green' | 'blue';

const TONE_COLOR: Record<StatTone, string> = {
  text:   'var(--color-text)',
  accent: 'var(--color-accent)',
  red:    'var(--color-red)',
  gold:   'var(--color-gold)',
  green:  'var(--color-green)',
  blue:   'var(--color-blue)',
};

export interface Stat {
  value: string | number;
  label: string;
  tone?: StatTone;
}

export interface StatTripletProps {
  stats: Stat[];
  className?: string;
  style?: CSSProperties;
}

export function StatTriplet({ stats, className = '', style }: StatTripletProps): JSX.Element {
  return (
    <div
      className={`grid w-full ${className}`}
      style={{
        gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))`,
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-r2)',
        overflow: 'hidden',
        ...style,
      }}
    >
      {stats.map((s, i) => (
        <div
          key={i}
          className="flex flex-col items-center justify-center px-2 py-3.5 text-center"
          style={{
            borderLeft: i > 0 ? '1px solid var(--color-border-soft)' : 'none',
          }}
        >
          <span
            className="font-mono"
            style={{
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: '-0.6px',
              lineHeight: 1,
              color: TONE_COLOR[s.tone ?? 'text'],
            }}
          >
            {s.value}
          </span>
          <span
            className="mt-1.5 font-mono uppercase"
            style={{
              fontSize: 9.5,
              fontWeight: 600,
              letterSpacing: '0.6px',
              color: 'var(--color-text-muted)',
              lineHeight: 1.1,
            }}
          >
            {s.label}
          </span>
        </div>
      ))}
    </div>
  );
}
