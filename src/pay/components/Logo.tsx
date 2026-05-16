/**
 * Logo — ANTON Pay brand mark.
 *
 * Three-chevron geometry shared across the ANTON suite, coloured with
 * the Pay signature sunrise orange (#C97220). White rounded-rect tile
 * so it reads well on the cream canvas and on the Android splash.
 */
interface LogoProps {
  /** Pixel size of the square. Default 72. */
  size?: number;
  /** Corner-radius scale. */
  rounded?: 'lg' | 'md' | 'sm' | 'full' | 'none';
  className?: string;
  /** Override the chevron stroke colour. Default = sunrise accent. */
  color?: string;
  /** Override the tile background colour. Default = white. */
  tileColor?: string;
}

export default function Logo({
  size = 72,
  rounded = 'lg',
  className,
  color = '#C97220',
  tileColor = '#FFFFFF',
}: LogoProps) {
  const radius =
    rounded === 'full' ? Math.round(size / 2) :
    rounded === 'lg'   ? Math.round(size * 0.225) :
    rounded === 'md'   ? 16 :
    rounded === 'sm'   ? 8 :
                         0;

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
      aria-label="ANTON Pay logo"
    >
      <rect width="1024" height="1024" rx={radiusInCanvas} ry={radiusInCanvas} fill={tileColor} />
      <g
        fill="none"
        stroke={color}
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
