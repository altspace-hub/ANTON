/**
 * AppHeader — the ONE top-bar primitive for both app modes (design-review:
 * "converge chrome, keep the fork at IA level"). Two variants share one
 * component so Pro and Standard stop drifting into ad-hoc headers:
 *
 *   variant="compact"  Pro sub-screens — 52px, surface bg, hairline border,
 *                      16px title, 22px back. (the former PageHeader)
 *   variant="large"    Standard mode — iOS-large-title feel, bg, no border,
 *                      24px title, 26px back. Standard's friendlier voice.
 *
 *   <AppHeader title="Settings" onBack={fn} />                       // compact
 *   <AppHeader variant="large" title="Today" subtitle={sub} onBack={fn}
 *              right={<button …/>} />
 *
 * `PageHeader` stays exported as a back-compat alias (= compact) so existing
 * Pro screens need no change.
 */

import type { ReactNode } from 'react';
import { Ico } from './Ico';

export interface AppHeaderProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  /** Optional right-side action node (e.g., a cog or add button). */
  right?: ReactNode;
  /** compact = Pro sub-screen bar (default); large = Standard large-title. */
  variant?: 'compact' | 'large';
}

export function AppHeader({ title, subtitle, onBack, right, variant = 'compact' }: AppHeaderProps) {
  const large = variant === 'large';
  return (
    <div
      className={`flex flex-shrink-0 ${large ? 'items-start gap-3 px-[18px] py-3' : 'items-center gap-1 px-2 py-2'}`}
      style={{
        background: large ? 'var(--color-bg)' : 'var(--color-surface)',
        borderBottom: large ? 'none' : '1px solid var(--color-border-soft)',
      }}
    >
      {onBack ? (
        <button
          onClick={onBack}
          aria-label="Back"
          className={`flex flex-shrink-0 items-center justify-center transition active:opacity-50 ${large ? '-ml-2.5 h-11 w-11' : ''}`}
          style={large ? { color: 'var(--color-text)' } : { width: 44, height: 44, color: 'var(--color-text)' }}
        >
          <Ico name="chevronLeft" size={large ? 26 : 22} />
        </button>
      ) : (
        // compact reserves a back-sized spacer to keep the title centred-ish;
        // large lets the title sit flush-left (iOS large-title style).
        !large && <div style={{ width: 44, height: 44 }} />
      )}
      <div className={`min-w-0 flex-1 ${large ? '' : 'px-1'}`}>
        <h1
          className="truncate"
          style={
            large
              ? { fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-text)', letterSpacing: '-0.4px', lineHeight: 1.1 }
              : { fontSize: '1rem', fontWeight: 700, color: 'var(--color-text)', letterSpacing: '-0.2px', lineHeight: 1.2 }
          }
        >
          {title}
        </h1>
        {subtitle && (
          <p
            className={`truncate ${large ? 'mt-1 text-sm' : 'mt-0.5 text-[0.6875rem]'}`}
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

/** Back-compat alias — the compact variant (the former PageHeader). */
export type PageHeaderProps = Omit<AppHeaderProps, 'variant'>;
export function PageHeader(props: PageHeaderProps) {
  return <AppHeader variant="compact" {...props} />;
}
