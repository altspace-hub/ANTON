/**
 * AntonMark — the ANTON chevron mark: three white chevrons rising in opacity
 * on the locked brand green (#0D7D6C). Geometry from logo_app/ (the phone
 * apps' launcher icons); public/anton-logo.svg is the same drawing for the
 * browser tab. It replaced the green "A" badge (2026-10-01).
 */
import type { CSSProperties } from 'react';

interface AntonMarkProps {
  /** Width and height in pixels. */
  size?: number;
  className?: string;
  style?: CSSProperties;
  /** An accessible name; without one the mark is decorative (aria-hidden). */
  title?: string;
}

export default function AntonMark({ size = 32, className, style, title }: AntonMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 1024 1024"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
      {...(title ? { role: 'img', 'aria-label': title } : { 'aria-hidden': true })}
    >
      <rect width="1024" height="1024" rx="230" ry="230" fill="#0D7D6C" />
      <g fill="none" stroke="#FFFFFF" strokeWidth="111" strokeLinejoin="miter" strokeLinecap="square">
        <polyline points="213,469 512,239 811,469" opacity="0.45" />
        <polyline points="213,640 512,410 811,640" opacity="0.75" />
        <polyline points="213,811 512,580 811,811" />
      </g>
    </svg>
  );
}
