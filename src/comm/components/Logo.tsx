/**
 * Logo — ANTON Communication App brand mark.
 *
 * Cream-chevron variant from the Companion App's Logo.tsx (skin
 * 'cream-chevron'), simplified — the Comm App ships one logo, not a
 * picker. Geometry mirrors `logo_app/icon-launcher-master.svg`.
 */

interface LogoProps {
  /** Pixel size of the square. Default 72. */
  size?: number;
  /** Corner-radius scale. 'lg' = 22.5% of size (matches launcher icon),
   *  'md' = fixed 16px, 'sm' = fixed 8px, 'full' = circle. Default 'lg'. */
  rounded?: 'lg' | 'md' | 'sm' | 'full';
  /** Optional className passthrough for layout. */
  className?: string;
}

export default function Logo({ size = 72, rounded = 'lg', className }: LogoProps) {
  const radius =
    rounded === 'full' ? Math.round(size / 2) :
    rounded === 'lg'   ? Math.round(size * 0.225) :
    rounded === 'md'   ? 16 :
                         8;

  const strokeWidth = 111;
  const radiusInCanvas = Math.round((radius / size) * 1024);

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 1024 1024"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="ANTON logo"
    >
      <rect width="1024" height="1024" rx={radiusInCanvas} ry={radiusInCanvas} fill="#F5F1EA" />
      <g
        fill="none"
        stroke="#0B1426"
        strokeWidth={strokeWidth}
        strokeLinejoin="miter"
        strokeLinecap="square"
      >
        <polyline points="213,469 512,239 811,469" opacity={0.22} />
        <polyline points="213,640 512,410 811,640" opacity={0.55} />
        <polyline points="213,811 512,580 811,811" opacity={1} />
      </g>
    </svg>
  );
}
