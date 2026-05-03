/**
 * Spinner — circular loading indicator.
 *
 * Replaces 20+ inline copies that drifted in size (12/14/16/24/28px)
 * and color pattern (accent ring vs white ring vs single border).
 * Three tones: 'accent' (default — for page-level loading), 'on-accent'
 * (white — for use inside primary buttons / accent surfaces), and
 * 'currentColor' (inherits from parent — for ghost contexts).
 */

import type { CSSProperties } from 'react';

export type SpinnerSize = 'xs' | 'sm' | 'md' | 'lg';
export type SpinnerTone = 'accent' | 'on-accent' | 'currentColor';

export interface SpinnerProps {
  size?: SpinnerSize;
  tone?: SpinnerTone;
  className?: string;
  /** Override the SR-only label. Defaults to "Loading". */
  label?: string;
}

const SIZE_PX: Record<SpinnerSize, number> = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 24,
};

export function Spinner({
  size = 'md',
  tone = 'accent',
  className = '',
  label = 'Loading',
}: SpinnerProps): JSX.Element {
  const px = SIZE_PX[size];
  // Three tones, all 2px border:
  //   accent     — track in --color-border + moving arc in --color-accent
  //                (true loader feel for page-level loading)
  //   on-accent  — transparent track + white arc, sits on a primary
  //                button or accent-soft surface
  //   currentColor — transparent track + currentColor arc, inherits
  //                from the parent text color (ghost contexts)
  const trackColor =
    tone === 'accent' ? 'var(--color-border)' : 'transparent';
  const arcColor =
    tone === 'on-accent'    ? '#FFFFFF' :
    tone === 'currentColor' ? 'currentColor' :
                              'var(--color-accent)';
  const style: CSSProperties = {
    width: px,
    height: px,
    borderWidth: 2,
    borderStyle: 'solid',
    borderColor: trackColor,
    borderTopColor: arcColor,
  };
  return (
    <span
      role="status"
      aria-live="polite"
      className={`inline-block animate-spin rounded-full ${className}`}
      style={style}
    >
      <span className="sr-only">{label}</span>
    </span>
  );
}
