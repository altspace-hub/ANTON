/**
 * Logo — switchable Companion App brand mark.
 *
 * Renders one of three skins (`'a-letter'` / `'green-chevron'` / `'cream-chevron'`)
 * as a self-contained square SVG-or-DOM block. Reads the user's selected
 * skin from `services/logo-skin` by default; pass `skin` to force a
 * specific variant (e.g. settings preview chips).
 *
 * Geometry of the chevron skins follows the SVG masters in
 * `logo_app/icon-launcher-master.svg` and `icon-signature-master.svg` —
 * keep these in sync if you ever bump the masters.
 */

import { useEffect, useState } from 'react';
import { getLogoSkin, onLogoSkinChange, type LogoSkin } from '../services/logo-skin';

interface LogoProps {
  /** Pixel size of the square. Default 72. */
  size?: number;
  /**
   * Force a specific skin (used by the settings picker preview chips).
   * Omit to use the user's selected skin.
   */
  skin?: LogoSkin;
  /** Corner-radius scale. 'lg' = 22.5% of size (matches launcher icon),
   *  'md' = fixed 16px, 'sm' = fixed 8px. Default 'lg'. */
  rounded?: 'lg' | 'md' | 'sm';
  /** Optional className passthrough for layout. */
  className?: string;
}

export default function Logo({ size = 72, skin: skinOverride, rounded = 'lg', className }: LogoProps) {
  const [activeSkin, setActiveSkin] = useState<LogoSkin>(getLogoSkin());
  useEffect(() => onLogoSkinChange(setActiveSkin), []);

  const skin = skinOverride ?? activeSkin;
  const radius =
    rounded === 'lg' ? Math.round(size * 0.225) :
    rounded === 'md' ? 16 :
                       8;

  if (skin === 'a-letter') {
    return (
      <div
        className={className}
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          background: 'var(--color-accent-soft)',
          border: '1px solid var(--color-accent-dim)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        aria-label="ANTON logo"
      >
        <span
          style={{
            color: 'var(--color-accent)',
            fontSize: Math.round(size * 0.47),
            fontWeight: 800,
            letterSpacing: '-0.5px',
            lineHeight: 1,
          }}
        >
          A
        </span>
      </div>
    );
  }

  if (skin === 'cream-chevron') {
    return (
      <ChevronMark
        size={size}
        radius={radius}
        bg="#F5F1EA"
        stroke="#0B1426"
        opacities={[0.22, 0.55, 1]}
        className={className}
      />
    );
  }

  // default + 'green-chevron'
  return (
    <ChevronMark
      size={size}
      radius={radius}
      bg="var(--color-accent)"
      stroke="#FFFFFF"
      opacities={[0.45, 0.75, 1]}
      className={className}
    />
  );
}

interface ChevronProps {
  size: number;
  radius: number;
  bg: string;
  stroke: string;
  opacities: [number, number, number];
  className?: string;
}

/**
 * Three-chevron mark, identical geometry to the SVG masters at 1024×1024
 * but rendered inline as SVG so it scales crisp at any size.
 */
function ChevronMark({ size, radius, bg, stroke, opacities, className }: ChevronProps) {
  // Master geometry in the 1024-canvas space — preserved verbatim from the
  // SVG masters in logo_app/. Stroke width 111 ≈ 10.8% of the canvas.
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
      <rect width="1024" height="1024" rx={radiusInCanvas} ry={radiusInCanvas} fill={bg} />
      <g
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinejoin="miter"
        strokeLinecap="square"
      >
        <polyline points="213,469 512,239 811,469" opacity={opacities[0]} />
        <polyline points="213,640 512,410 811,640" opacity={opacities[1]} />
        <polyline points="213,811 512,580 811,811" opacity={opacities[2]} />
      </g>
    </svg>
  );
}
