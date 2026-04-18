/**
 * Breadcrumbs — Web UX v2 mono-uppercase trail.
 *
 * Used at the top of every run page. Last item is rendered in accent
 * (current location); earlier items are clickable navigation.
 */

import type { ReactNode } from 'react';

export interface BreadcrumbItem {
  label: string;
  onClick?: () => void;
}

export interface BreadcrumbsProps {
  items: (string | BreadcrumbItem)[];
  className?: string;
}

function normalise(it: string | BreadcrumbItem): BreadcrumbItem {
  return typeof it === 'string' ? { label: it } : it;
}

export function Breadcrumbs({ items, className = '' }: BreadcrumbsProps): JSX.Element {
  const list = items.map(normalise);
  return (
    <div
      className={`inline-flex items-center gap-1.5 font-mono text-[11.5px] uppercase tracking-[0.2px] text-[var(--color-text-muted)] ${className}`}
    >
      {list.map((it, i) => {
        const isLast = i === list.length - 1;
        const node: ReactNode = it.onClick && !isLast
          ? (
            <button
              onClick={it.onClick}
              className="hover:text-[var(--color-text-body)]"
              type="button"
            >
              {it.label}
            </button>
          )
          : <span className={isLast ? 'text-[var(--color-adv-teal)]' : ''}>{it.label}</span>;
        return (
          <span key={i} className="inline-flex items-center gap-1.5">
            {i > 0 && <span className="text-[var(--color-text-faint)]">/</span>}
            {node}
          </span>
        );
      })}
    </div>
  );
}
