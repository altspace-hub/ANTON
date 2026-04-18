/**
 * DeliberationToggle — Web UX v2 wrapper for the Deliberation Mode toggle.
 *
 * Replaces the inline JSX block in ModulePage. Same behaviour: when
 * enabled, shows a gold "Opus + Sonnet + Haiku ~3× cost" hint line.
 */

import { Layers } from 'lucide-react';

export interface DeliberationToggleProps {
  enabled: boolean;
  onChange: (v: boolean) => void;
}

export function DeliberationToggle({ enabled, onChange }: DeliberationToggleProps): JSX.Element {
  return (
    <div
      className="p-3"
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-r2)',
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers size={16} strokeWidth={1.5} className="text-[var(--color-adv-teal)]" />
          <h3 className="text-[13px] font-semibold text-[var(--color-text)]">Deliberation Mode</h3>
        </div>
        <button
          type="button"
          onClick={() => onChange(!enabled)}
          className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors"
          style={{
            background: enabled ? 'var(--color-adv-teal)' : 'var(--color-surface-muted)',
            border: `1px solid ${enabled ? 'var(--color-adv-teal)' : 'var(--color-border)'}`,
          }}
        >
          <span
            className="inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform"
            style={{ transform: enabled ? 'translateX(18px)' : 'translateX(2px)' }}
          />
        </button>
      </div>
      {enabled && (
        <p className="mt-2 text-[11px] text-[var(--color-gold)]">
          Opus + Sonnet + Haiku analyse in parallel · ~3× cost · Agreement-scored synthesis
        </p>
      )}
    </div>
  );
}
