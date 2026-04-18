/**
 * SuggestedNext — Web UX v2 follow-up cards.
 *
 * Renders below the output card. Each item: 28×28 accent-tinted icon
 * tile + 13px title + 11.5px description. Grid auto-sizes to item count.
 */

import { ChevronRight, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Section } from '../web-ui';

export interface SuggestedItem {
  title: string;
  desc: string;
  icon?: LucideIcon;
  onClick?: () => void;
}

export interface SuggestedNextProps {
  items: SuggestedItem[];
  label?: ReactNode;
  className?: string;
}

export function SuggestedNext({
  items, label = 'Suggested next', className = '',
}: SuggestedNextProps): JSX.Element {
  if (items.length === 0) return <></>;
  return (
    <div className={`mt-3.5 ${className}`}>
      <Section className="mb-2 inline-flex items-center gap-1.5">{label}</Section>
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${Math.min(items.length, 4)}, minmax(0, 1fr))` }}
      >
        {items.map((n, i) => {
          const Icon = n.icon ?? ChevronRight;
          return (
            <button
              key={i}
              onClick={n.onClick}
              className="flex items-start gap-2.5 p-3 text-left"
              style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-r2)',
              }}
              type="button"
            >
              <span
                className="inline-flex items-center justify-center rounded-md flex-shrink-0"
                style={{
                  width: 28, height: 28,
                  background: 'var(--color-accent-soft)',
                  color: 'var(--color-adv-teal)',
                }}
              >
                <Icon size={14} strokeWidth={1.5} />
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className="block text-[13px] font-medium text-[var(--color-text)]"
                  style={{ marginBottom: 2 }}
                >
                  {n.title}
                </span>
                <span
                  className="block text-[11.5px] text-[var(--color-text-muted)]"
                  style={{ lineHeight: 1.4 }}
                >
                  {n.desc}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
