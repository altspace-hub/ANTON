/**
 * StatusDot — small coloured circle, optionally with a pulsing ring.
 * Tones map to status colours (LOCKED) and the textFaint grey.
 */

export type DotTone = 'green' | 'gold' | 'red' | 'gray' | 'accent';

export interface StatusDotProps {
  tone?: DotTone;
  size?: number;
  pulse?: boolean;
  className?: string;
}

const TONE_VAR: Record<DotTone, string> = {
  green:  'var(--color-green)',
  gold:   'var(--color-gold)',
  red:    'var(--color-red)',
  gray:   'var(--color-text-faint)',
  accent: 'var(--color-accent)',
};

export function StatusDot({ tone = 'green', size = 8, pulse, className = '' }: StatusDotProps): JSX.Element {
  const c = TONE_VAR[tone];
  return (
    <span
      className={`inline-block rounded-full ${className}`}
      style={{
        width: size,
        height: size,
        background: c,
        boxShadow: pulse ? `0 0 0 3px color-mix(in srgb, ${c} 22%, transparent)` : undefined,
      }}
    />
  );
}
