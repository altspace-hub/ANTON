/**
 * MonogramTile — Colored 2-letter rounded-square module glyph.
 *
 * Replaces every emoji or icon-tile that represented a "module" or
 * domain. Color comes from the domain (`tone`), letters in white/light.
 * One shape, one weight — letters carry the load and stay legible at 24px.
 *
 * Tones map (Claude Design):
 *   red   = sanctions / risk / critical
 *   blue  = counsel / finance review
 *   gold  = autopilot / markets / financial flow
 *   teal  = research / knowledge / accent
 *   plum  = creative / generative
 *   slate = utility / civic / admin
 *
 * Usage:
 *   <MonogramTile letters="MI" tone="teal" />            // 36px default
 *   <MonogramTile letters="SA" tone="red"   size={28} />
 */

import type { CSSProperties } from 'react';

export type MonogramTone = 'red' | 'blue' | 'gold' | 'teal' | 'plum' | 'slate' | 'green';

const TONE: Record<MonogramTone, { bg: string; fg: string }> = {
  red:   { bg: '#B73A2B', fg: '#FFFFFF' },
  blue:  { bg: '#2D5BB8', fg: '#FFFFFF' },
  gold:  { bg: '#B98326', fg: '#FFFFFF' },
  teal:  { bg: 'var(--color-accent)', fg: '#FFFFFF' },
  plum:  { bg: '#6A3E8F', fg: '#FFFFFF' },
  slate: { bg: '#23252E', fg: '#F4EFE6' },
  green: { bg: '#1F8A5C', fg: '#FFFFFF' },
};

export interface MonogramTileProps {
  /** 1-3 letters — usually 2. Auto-uppercased. */
  letters: string;
  tone?: MonogramTone;
  /** Pixel size of the square (default 36px). Letters scale to ~50%. */
  size?: number;
  className?: string;
  style?: CSSProperties;
}

export function MonogramTile({
  letters,
  tone = 'teal',
  size = 36,
  className = '',
  style,
}: MonogramTileProps): JSX.Element {
  const t = TONE[tone];
  const text = letters.slice(0, 3).toUpperCase();
  return (
    <span
      className={`inline-flex flex-shrink-0 items-center justify-center font-semibold ${className}`}
      style={{
        width: size,
        height: size,
        background: t.bg,
        color: t.fg,
        borderRadius: Math.round(size * 0.25),
        fontSize: Math.round(size * 0.36),
        letterSpacing: '-0.4px',
        lineHeight: 1,
        ...style,
      }}
      aria-hidden="true"
    >
      {text}
    </span>
  );
}

/**
 * Module → monogram + tone lookup. Lifted from Claude Design's "Module
 * glyph system replaces every emoji tile." If a module isn't in the map,
 * caller can synthesize a fallback (first letter of each word, slate tone).
 */
export const MODULE_GLYPH: Record<string, { letters: string; tone: MonogramTone }> = {
  // Work / area modules
  markets:              { letters: 'MI', tone: 'teal' },
  marketsIntelligence:  { letters: 'MI', tone: 'teal' },
  sanctions:            { letters: 'SA', tone: 'red'  },
  sanctionsAdvisory:    { letters: 'SA', tone: 'red'  },
  counsel:              { letters: 'CD', tone: 'blue' },
  counselsDesk:         { letters: 'CD', tone: 'blue' },
  knowledge:            { letters: 'KB', tone: 'teal' },
  knowledgeBase:        { letters: 'KB', tone: 'teal' },
  finance:              { letters: 'FA', tone: 'gold' },
  financeAutopilot:     { letters: 'FA', tone: 'gold' },
  gap:                  { letters: 'GA', tone: 'green' },
  gapAssessment:        { letters: 'GA', tone: 'green' },
  presentation:         { letters: 'PB', tone: 'plum' },
  presentationBuilder:  { letters: 'PB', tone: 'plum' },
  orchestrator:         { letters: 'OR', tone: 'gold' },
  task:                 { letters: 'TA', tone: 'teal' },
  taskAgent:            { letters: 'TA', tone: 'teal' },
  risk:                 { letters: 'RA', tone: 'red'  },
  riskAtlas:            { letters: 'RA', tone: 'red'  },
  horizon:              { letters: 'HR', tone: 'blue' },
  horizonRadar:         { letters: 'HR', tone: 'blue' },
  civic:                { letters: 'CV', tone: 'slate' },
  talent:               { letters: 'TL', tone: 'teal' },
  travel:               { letters: 'TV', tone: 'teal' },

  // App-shell modules (More tiles, etc.)
  work:        { letters: 'WK', tone: 'teal'  },
  mail:        { letters: 'ML', tone: 'blue'  },
  calendar:    { letters: 'CA', tone: 'teal'  },
  school:      { letters: 'SC', tone: 'blue'  },
  schedule:    { letters: 'SD', tone: 'slate' },
  tasks:       { letters: 'TS', tone: 'green' },
  pathfinder:  { letters: 'PF', tone: 'teal'  },
  radar:       { letters: 'RD', tone: 'blue'  },
  wallet:      { letters: 'WL', tone: 'gold'  },
  history:     { letters: 'HI', tone: 'slate' },
  profile:     { letters: 'PR', tone: 'slate' },
  settings:    { letters: 'ST', tone: 'slate' },
};

/** Get monogram for a module key, falling back to a slate tile derived from the label. */
export function getModuleGlyph(key: string, fallbackLabel?: string): { letters: string; tone: MonogramTone } {
  const hit = MODULE_GLYPH[key];
  if (hit) return hit;
  if (fallbackLabel) {
    const parts = fallbackLabel.split(/\s+/).filter(Boolean);
    const letters = (parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? parts[0]?.[1] ?? '');
    return { letters, tone: 'slate' };
  }
  return { letters: '??', tone: 'slate' };
}
