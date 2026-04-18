/**
 * ShortcutsOverlay — Web UX v2 keyboard shortcuts modal.
 *
 * Per design/web-overlays.jsx WShortcutsOverlay: 780px centered modal,
 * title + close, 2-col grid of groups (Navigation / Actions / Depth /
 * View), each group has an accent label + rows of [Kbd parts] · label.
 * Press `?` to open from anywhere; Esc to close.
 */

import { useEffect } from 'react';
import { X } from 'lucide-react';
import { Kbd, KbdSequence } from '../web-ui';

export interface ShortcutRow {
  parts: (string | JSX.Element)[];
  label: string;
}

export interface ShortcutGroup {
  group: string;
  rows: ShortcutRow[];
}

export interface ShortcutsOverlayProps {
  open: boolean;
  onClose: () => void;
  groups?: ShortcutGroup[];
}

const DEFAULT_GROUPS: ShortcutGroup[] = [
  {
    group: 'Navigation',
    rows: [
      { parts: ['⌘', 'K'],       label: 'Open command palette' },
      { parts: ['⌘', 'B'],       label: 'Toggle sidebar' },
      { parts: ['⌘', '⇧', 'H'],  label: 'Go home' },
      { parts: ['G', 'R'],       label: 'Open Horizon Radar' },
    ],
  },
  {
    group: 'Actions',
    rows: [
      { parts: ['⌘', '↵'],      label: 'Send / run' },
      { parts: ['⌘', '⇧', 'N'], label: 'New session' },
      { parts: ['⌘', 'S'],      label: 'Share current run' },
      { parts: ['⌘', 'E'],      label: 'Export DOCX' },
    ],
  },
  {
    group: 'Depth',
    rows: [
      { parts: ['1'], label: 'Quick' },
      { parts: ['2'], label: 'Think' },
      { parts: ['3'], label: 'Think Hard' },
      { parts: ['4'], label: 'Investigate' },
      { parts: ['5'], label: 'Plan First' },
    ],
  },
  {
    group: 'View',
    rows: [
      { parts: ['⌘', '.'], label: 'Toggle run configuration' },
      { parts: ['⌘', "'"], label: 'Toggle right rail' },
      { parts: ['?'],      label: 'Show this overlay' },
      { parts: ['Esc'],    label: 'Close overlays' },
    ],
  },
];

export function ShortcutsOverlay({ open, onClose, groups = DEFAULT_GROUPS }: ShortcutsOverlayProps): JSX.Element | null {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.35)' }}
      onClick={onClose}
    >
      <div
        className="w-[780px] overflow-hidden"
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 14,
          boxShadow: 'var(--shadow-web-lg)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: '1px solid var(--color-border-soft)' }}
        >
          <div>
            <div className="text-[15px] font-semibold text-[var(--color-text)]">Keyboard shortcuts</div>
            <div className="mt-0.5 text-[11.5px] text-[var(--color-text-muted)]">Press ? anywhere to open · Esc to close</div>
          </div>
          <button type="button" onClick={onClose} className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-x-8 gap-y-6 px-6 py-5">
          {groups.map(g => (
            <div key={g.group}>
              <div className="mb-2 text-[11.5px] font-semibold uppercase tracking-[0.6px] text-[var(--color-adv-teal)]">
                {g.group}
              </div>
              <div className="space-y-2">
                {g.rows.map((r, i) => (
                  <div key={i} className="flex items-center justify-between gap-3">
                    <KbdSequence parts={r.parts} />
                    <span className="text-[12px] text-[var(--color-text-body)]">{r.label}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
