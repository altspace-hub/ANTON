/**
 * RunHeader — Web UX v2 page header for module runs.
 *
 * Layout per design/web-shell-v2.jsx WRunHeader:
 *   • Breadcrumbs row
 *   • 22px title (weight 600, -0.4 tracking)
 *   • 12.5px subtitle (max 680px width)
 *   • Chip row (Think Hard · model · precision · status etc.)
 *   • Right-aligned actions slot (Share / Export / Approve)
 *
 * The chip row reflects the active run config so the user can verify
 * settings at a glance without expanding the configuration panel.
 */

import type { ReactNode } from 'react';
import { Pill, type PillTone } from '../web-ui';
import { Breadcrumbs, type BreadcrumbItem } from './Breadcrumbs';

export type RunChip = string | { label: string; tone?: PillTone };

export interface RunHeaderProps {
  crumbs?: (string | BreadcrumbItem)[];
  title: string;
  subtitle?: string;
  chips?: RunChip[];
  actions?: ReactNode;
  className?: string;
}

export function RunHeader({
  crumbs, title, subtitle, chips = [], actions, className = '',
}: RunHeaderProps): JSX.Element {
  return (
    <div
      className={`px-7 pt-4 pb-3.5 ${className}`}
      style={{
        background: 'var(--color-surface)',
        borderBottom: '1px solid var(--color-border-soft)',
      }}
    >
      {crumbs && crumbs.length > 0 && (
        <div className="mb-2.5">
          <Breadcrumbs items={crumbs} />
        </div>
      )}
      <div className="flex items-end justify-between gap-5">
        <div className="min-w-0 flex-1">
          <h1
            className="text-[var(--color-text)] m-0"
            style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.4px', marginBottom: 4 }}
          >
            {title}
          </h1>
          {subtitle && (
            <div
              className="text-[var(--color-text-muted)]"
              style={{ fontSize: 12.5, lineHeight: 1.45, maxWidth: 680 }}
            >
              {subtitle}
            </div>
          )}
          {chips.length > 0 && (
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              {chips.map((c, i) => {
                if (typeof c === 'string') return <Pill key={i} tone="neutral">{c}</Pill>;
                return <Pill key={i} tone={c.tone ?? 'neutral'}>{c.label}</Pill>;
              })}
            </div>
          )}
        </div>
        {actions && <div className="flex flex-shrink-0 gap-1.5">{actions}</div>}
      </div>
    </div>
  );
}
