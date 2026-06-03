/**
 * AvatarCircle — a round avatar that shows a profile picture when one is
 * set, otherwise the first letter of the name (the previous behaviour).
 *
 * Used everywhere a person is shown (TopBar, chat list, chat header, event
 * attendees, contact rows) so swapping the letter for a photo is a one-line
 * change at each call site. Pass a peer's Contact avatarImage/avatarMime, or
 * the identity's, or nothing for the letter fallback.
 */
interface Props {
  name: string;
  avatarImage?: string | null;
  avatarMime?: string | null;
  /** Pixel diameter. */
  size: number;
  className?: string;
  /** Override the letter-fallback colours (defaults match the old circles). */
  bg?: string;
  fg?: string;
}

export default function AvatarCircle({ name, avatarImage, avatarMime, size, className, bg, fg }: Props) {
  const dim = { width: size, height: size };
  if (avatarImage) {
    return (
      <img
        src={`data:${avatarMime || 'image/jpeg'};base64,${avatarImage}`}
        alt={name}
        className={`rounded-full object-cover shrink-0 ${className ?? ''}`}
        style={dim}
        draggable={false}
      />
    );
  }
  const letter = (name || '?').trim().slice(0, 1).toUpperCase() || '?';
  return (
    <div
      className={`rounded-full flex items-center justify-center font-semibold shrink-0 ${className ?? ''}`}
      style={{
        ...dim,
        backgroundColor: bg ?? 'var(--color-accent-dim)',
        color: fg ?? 'var(--color-accent-dark)',
        fontSize: Math.round(size * 0.42),
      }}
    >
      {letter}
    </div>
  );
}
