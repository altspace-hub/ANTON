/**
 * CommandPalette — Web UX v2 ⌘K quick-action overlay.
 *
 * Per design/web-overlays.jsx WCommandPalette: 580px centered modal,
 * command-icon input row with Commands/Ask pills, grouped results
 * (Jump to / Recent sessions / Actions / Ask ANTON fallback), first
 * item highlighted with accent-soft bg + 2px left accent bar, footer
 * row with ↑↓ ↵ ⌘↵ Esc hints.
 *
 * v1: static action registry; ready to wire to real session/module
 * directories in a follow-up.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Command as CommandIcon, ArrowUp, CornerDownLeft,
  Home, Clock, Settings, Sparkles, BookOpen, Shield, Compass,
  Radar as RadarIcon, FileText, MessageSquare,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Kbd, KbdSequence, Section } from '../web-ui';

export interface CommandItem {
  id: string;
  label: string;
  icon?: LucideIcon;
  hint?: string;
  group: 'Jump to' | 'Recent' | 'Actions' | 'Ask ANTON';
  onRun?: () => void;
}

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  items?: CommandItem[];
}

const DEFAULT_ITEMS: CommandItem[] = [
  { id: 'home',       label: 'Home',                    icon: Home,        group: 'Jump to' },
  { id: 'sanctions',  label: 'Sanctions Advisory',      icon: Shield,      group: 'Jump to' },
  { id: 'pathfinder', label: 'Pathfinder',              icon: Compass,     group: 'Jump to' },
  { id: 'radar',      label: 'Horizon Radar',           icon: RadarIcon,   group: 'Jump to' },
  { id: 'kb',         label: 'Knowledge Base',          icon: BookOpen,    group: 'Jump to' },
  { id: 'settings',   label: 'Settings',                icon: Settings,    group: 'Jump to' },
  { id: 'recent-1',   label: 'Sanctions policy v4 — Board submission', icon: FileText, group: 'Recent', hint: 'yesterday' },
  { id: 'recent-2',   label: 'AMLR RTS research thread', icon: MessageSquare, group: 'Recent', hint: '2h ago' },
  { id: 'new-run',    label: 'New run',                 icon: Sparkles,    group: 'Actions' },
  { id: 'new-chat',   label: 'New chat',                icon: MessageSquare, group: 'Actions' },
  { id: 'history',    label: 'Open history',            icon: Clock,       group: 'Actions' },
];

export function CommandPalette({ open, onClose, items = DEFAULT_ITEMS }: CommandPaletteProps): JSX.Element | null {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const filtered = useMemo(() => {
    if (!query) return items;
    const q = query.toLowerCase();
    return items.filter(it => it.label.toLowerCase().includes(q));
  }, [items, query]);

  const asking = query.length > 0 && filtered.length === 0;

  const grouped = useMemo(() => {
    const groups = new Map<CommandItem['group'], CommandItem[]>();
    for (const it of filtered) {
      const g = groups.get(it.group) ?? [];
      g.push(it);
      groups.set(it.group, g);
    }
    return [...groups.entries()];
  }, [filtered]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, filtered.length - 1)); }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)); }
      if (e.key === 'Enter') {
        e.preventDefault();
        const it = filtered[selected];
        if (it) { it.onRun?.(); onClose(); }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, filtered, selected, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh]"
      style={{ background: 'rgba(0,0,0,0.35)' }}
      onClick={onClose}
    >
      <div
        className="w-[580px] overflow-hidden"
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 12,
          boxShadow: 'var(--shadow-web-lg)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input row */}
        <div
          className="flex items-center gap-2.5 px-4 py-3"
          style={{ borderBottom: '1px solid var(--color-border-soft)' }}
        >
          <CommandIcon size={15} strokeWidth={1.5} className="text-[var(--color-text-muted)]" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelected(0); }}
            placeholder="Jump to, search, or ask ANTON…"
            className="flex-1 bg-transparent text-[14px] text-[var(--color-text)] placeholder:text-[var(--color-text-faint)] focus:outline-none"
          />
          <div
            className="rounded-md px-2 py-1 text-[10.5px] font-mono"
            style={{ background: 'var(--color-surface-alt)', color: 'var(--color-text-muted)' }}
          >
            Commands
          </div>
          <div
            className="rounded-md px-2 py-1 text-[10.5px] font-mono"
            style={{ background: 'var(--color-accent-soft)', color: 'var(--color-adv-teal)', border: '1px solid var(--color-accent-dim)' }}
          >
            Ask
          </div>
        </div>

        {/* Results */}
        <div className="max-h-[440px] overflow-y-auto">
          {asking ? (
            <div className="px-4 py-5">
              <Section className="mb-2">Ask ANTON</Section>
              <div className="text-[13px] text-[var(--color-text-body)]">
                Press <Kbd>↵</Kbd> to ask ANTON about <b className="text-[var(--color-adv-teal)]">"{query}"</b>.
              </div>
            </div>
          ) : (
            grouped.map(([group, rows], gi) => (
              <div key={group} className={gi > 0 ? 'mt-1.5' : ''}>
                <Section className="px-4 pb-1 pt-3">{group}</Section>
                {rows.map((it) => {
                  const globalIndex = filtered.indexOf(it);
                  const isSel = globalIndex === selected;
                  const Icon = it.icon ?? Sparkles;
                  return (
                    <button
                      key={it.id}
                      type="button"
                      onMouseEnter={() => setSelected(globalIndex)}
                      onClick={() => { it.onRun?.(); onClose(); }}
                      className="flex w-full items-center gap-2.5 px-4 py-2 text-left"
                      style={{
                        background: isSel ? 'var(--color-accent-soft)' : 'transparent',
                        borderLeft: isSel ? '2px solid var(--color-adv-teal)' : '2px solid transparent',
                      }}
                    >
                      <Icon size={14} strokeWidth={1.5} className={isSel ? 'text-[var(--color-adv-teal)]' : 'text-[var(--color-text-muted)]'} />
                      <span className="flex-1 text-[13px] text-[var(--color-text)]">{it.label}</span>
                      {it.hint && (
                        <span className="font-mono text-[11px] text-[var(--color-text-faint)]">{it.hint}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center gap-4 px-4 py-2 font-mono text-[10.5px] text-[var(--color-text-muted)]"
          style={{ background: 'var(--color-surface-alt)', borderTop: '1px solid var(--color-border-soft)' }}
        >
          <span className="inline-flex items-center gap-1.5">
            <KbdSequence parts={[<ArrowUp size={10} />, <span style={{ transform: 'rotate(180deg)', display: 'inline-block' }}><ArrowUp size={10} /></span>]} />
            navigate
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Kbd><CornerDownLeft size={10} /></Kbd> select
          </span>
          <span className="inline-flex items-center gap-1.5">
            <KbdSequence parts={['⌘', <CornerDownLeft size={10} />]} /> open in new tab
          </span>
          <span className="flex-1" />
          <span className="inline-flex items-center gap-1.5">
            <Kbd>Esc</Kbd> close
          </span>
        </div>
      </div>
    </div>
  );
}
