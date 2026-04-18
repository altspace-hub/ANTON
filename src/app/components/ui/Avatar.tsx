/**
 * Avatar — flat initials circle, no images.
 * Defaults to accent-soft background with accent text; when `color` is
 * passed it becomes a coloured pill with white text (used for org badges).
 */

export interface AvatarProps {
  initials?: string;
  size?: number;
  /** When set, fills the avatar with this colour and uses white text. */
  color?: string;
  className?: string;
}

export function Avatar({ initials = 'AB', size = 36, color, className = '' }: AvatarProps): JSX.Element {
  return (
    <div
      className={`inline-flex items-center justify-center rounded-full font-semibold flex-shrink-0 ${className}`}
      style={{
        width: size,
        height: size,
        background: color || 'var(--color-accent-soft)',
        color: color ? '#fff' : 'var(--color-accent)',
        fontSize: size * 0.36,
        letterSpacing: '-0.2px',
        fontFamily: 'var(--font-sans)',
      }}
    >
      {initials}
    </div>
  );
}
