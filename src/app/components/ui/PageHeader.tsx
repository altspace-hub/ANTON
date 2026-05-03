/**
 * PageHeader — Standard top bar for sub-screens (Settings, Profile, History,
 * Schedule, etc.). Single source of truth so screens stop drifting.
 *
 *   <PageHeader title="Settings" onBack={() => …} />
 *   <PageHeader title="Profile" subtitle="Daniel Bardun" onBack={fn} right={<Btn />} />
 *
 * Spec: 52px tall, surface bg, hairline bottom border, 44px back hit-zone,
 * 16px semibold title, optional 11px muted subtitle.
 */

import type { ReactNode } from 'react';
import { Ico } from './Ico';

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  /** Optional right-side action node (e.g., a settings cog button) */
  right?: ReactNode;
}

export function PageHeader({ title, subtitle, onBack, right }: PageHeaderProps) {
  return (
    <div
      className="flex flex-shrink-0 items-center gap-1 px-2 py-2"
      style={{
        background: 'var(--color-surface)',
        borderBottom: '1px solid var(--color-border-soft)',
      }}
    >
      {onBack ? (
        <button
          onClick={onBack}
          aria-label="Back"
          className="flex items-center justify-center transition active:opacity-50"
          style={{ width: 44, height: 44, color: 'var(--color-text)' }}
        >
          <Ico name="chevronLeft" size={22} />
        </button>
      ) : (
        <div style={{ width: 44, height: 44 }} />
      )}
      <div className="min-w-0 flex-1 px-1">
        <h1
          className="truncate"
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: 'var(--color-text)',
            letterSpacing: '-0.2px',
            lineHeight: 1.2,
          }}
        >
          {title}
        </h1>
        {subtitle && (
          <p
            className="mt-0.5 truncate text-[11px]"
            style={{ color: 'var(--color-text-muted)' }}
          >
            {subtitle}
          </p>
        )}
      </div>
      <div className="flex items-center" style={{ minWidth: 44, minHeight: 44, justifyContent: 'flex-end' }}>
        {right}
      </div>
    </div>
  );
}
