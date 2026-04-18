/**
 * Dot — Web UX v2 small coloured circle.
 * Used inline in run timelines, status chips, etc.
 * Pass any colour via the `c` prop or use a tone shortcut.
 */

export type DotTone = 'accent' | 'gold' | 'red' | 'green' | 'blue' | 'muted';

export interface DotProps {
  c?: string;            // raw colour overrides tone
  tone?: DotTone;
  size?: number;
  pulse?: boolean;
  className?: string;
}

const TONE_VAR: Record<DotTone, string> = {
  accent: 'var(--color-adv-teal)',
  gold:   'var(--color-gold)',
  red:    'var(--color-red)',
  green:  'var(--color-green)',
  blue:   'var(--color-blue)',
  muted:  'var(--color-text-faint)',
};

export function Dot({ c, tone = 'accent', size = 6, pulse, className = '' }: DotProps): JSX.Element {
  const colour = c ?? TONE_VAR[tone];
  return (
    <span
      className={`inline-block rounded-full ${className}`}
      style={{
        width: size,
        height: size,
        background: colour,
        boxShadow: pulse ? `0 0 0 3px color-mix(in srgb, ${colour} 22%, transparent)` : undefined,
      }}
    />
  );
}
