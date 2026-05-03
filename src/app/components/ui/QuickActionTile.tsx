/**
 * QuickActionTile — 2x2-grid tile used on HomeScreen for the
 * Voice / Capture / Ask / Missions row.
 *
 * UL1: was an inline-styled tile rendered inside HomeScreen's .map().
 * Extracted so the typography + spacing math lives in one place; same
 * pattern can drop into Std mode quick actions when those land.
 */

import type { ReactNode } from 'react';
import { Ico, type IcoName } from './Ico';

export interface QuickActionTileProps {
  icon: IcoName;
  label: string;
  /** Subline — typically a hint (e.g. "Hold to talk") or count ("5 pending"). */
  desc?: ReactNode;
  onClick?: () => void;
  className?: string;
}

export function QuickActionTile({
  icon,
  label,
  desc,
  onClick,
  className = '',
}: QuickActionTileProps): JSX.Element {
  return (
    <button
      onClick={onClick}
      className={`rounded-[var(--radius-r2)] text-left transition active:scale-[0.97] ${className}`}
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        padding: 16,
      }}
    >
      <div
        className="flex items-center justify-center rounded-[var(--radius-r1)]"
        style={{
          width: 30, height: 30,
          background: 'var(--color-surface-alt)',
          color: 'var(--color-text)',
        }}
      >
        <Ico name={icon} color="currentColor" size={17} />
      </div>
      <div
        style={{
          marginTop: 12,
          fontSize: 14,
          fontWeight: 600,
          color: 'var(--color-text)',
          letterSpacing: '-0.1px',
          lineHeight: 1.2,
        }}
      >
        {label}
      </div>
      {desc && (
        <div
          style={{
            marginTop: 4,
            fontSize: 11.5,
            color: 'var(--color-text-muted)',
            lineHeight: 1.3,
          }}
        >
          {desc}
        </div>
      )}
    </button>
  );
}
