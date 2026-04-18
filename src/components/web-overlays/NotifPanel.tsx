/**
 * NotifPanel — Web UX v2 notifications dropdown.
 *
 * Per design/web-overlays.jsx WNotifPanel: 380px dropdown anchored to
 * the bell icon. Header with title + red "N new" pill + Mark all read.
 * Filter tabs (All / Mentions / Reviews / Radar / System). Item rows:
 * 28×28 tonal icon tile, title + mono timestamp, sub; unread items get
 * surfaceAlt bg + accent dot on the left.
 */

import { useState } from 'react';
import {
  Bell, Shield, Users, Radar as RadarIcon,
  Sparkles, CheckSquare, BookOpen,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Pill, Section, Dot } from '../web-ui';

type NotifTone = 'accent' | 'gold' | 'red' | 'green' | 'blue';

export interface NotifItem {
  id: string;
  icon: LucideIcon;
  tone: NotifTone;
  title: string;
  sub: string;
  when: string;
  unread?: boolean;
  filter: 'Mentions' | 'Reviews' | 'Radar' | 'System';
}

export interface NotifPanelProps {
  open: boolean;
  onClose: () => void;
  items?: NotifItem[];
  onMarkAllRead?: () => void;
  /** Optional top-right anchor offset (default 56px from right, 52px from top). */
  anchorStyle?: React.CSSProperties;
}

const DEFAULT: NotifItem[] = [
  { id: '1', icon: Shield,      tone: 'gold',   title: 'Sanctions policy v4 ready for review', sub: 'Board submission · Trust 87',           when: '14:02', unread: true, filter: 'Reviews' },
  { id: '2', icon: Users,       tone: 'blue',   title: 'Sara commented on Orion policy',       sub: '"Can we cite the AMLR final text?"',    when: '12:15', unread: true, filter: 'Mentions' },
  { id: '3', icon: RadarIcon,   tone: 'red',    title: '2 new regulatory consultations',       sub: 'AMLA CDD RTS · EBA screening GL',        when: '11:30', unread: true, filter: 'Radar' },
  { id: '4', icon: Sparkles,    tone: 'accent', title: 'Your 5-minute brief is ready',         sub: 'Overnight regulatory updates · 4 items', when: '09:12',                 filter: 'System' },
  { id: '5', icon: CheckSquare, tone: 'green',  title: 'Phase 2A complete',                    sub: 'Client Intelligence · ICA Eng 2',        when: '08:58',                 filter: 'System' },
  { id: '6', icon: BookOpen,    tone: 'blue',   title: 'KB updated: Sanctions training v3',    sub: '12 pages revised',                       when: 'Yst',                   filter: 'System' },
];

const TONE_BG: Record<NotifTone, string> = {
  accent: 'var(--color-accent-soft)',
  gold:   'var(--color-gold-soft)',
  red:    'var(--color-red-soft)',
  green:  'var(--color-green-soft)',
  blue:   'var(--color-blue-soft)',
};
const TONE_FG: Record<NotifTone, string> = {
  accent: 'var(--color-adv-teal)',
  gold:   'var(--color-gold)',
  red:    'var(--color-red)',
  green:  'var(--color-green)',
  blue:   'var(--color-blue)',
};

export function NotifPanel({ open, onClose, items = DEFAULT, onMarkAllRead, anchorStyle }: NotifPanelProps): JSX.Element | null {
  const [filter, setFilter] = useState<'All' | 'Mentions' | 'Reviews' | 'Radar' | 'System'>('All');
  if (!open) return null;

  const filtered = filter === 'All' ? items : items.filter(i => i.filter === filter);
  const unreadCount = items.filter(i => i.unread).length;

  return (
    <div className="fixed inset-0 z-40" onClick={onClose}>
      <div
        className="absolute overflow-hidden"
        style={{
          top: 52, right: 56, width: 380,
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 12,
          boxShadow: 'var(--shadow-web-lg)',
          ...anchorStyle,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center gap-2 px-4 py-3"
          style={{ borderBottom: '1px solid var(--color-border-soft)' }}
        >
          <Bell size={15} strokeWidth={1.5} className="text-[var(--color-text-muted)]" />
          <span className="text-[13px] font-semibold text-[var(--color-text)]">Notifications</span>
          {unreadCount > 0 && <Pill tone="red">{unreadCount} new</Pill>}
          <span className="flex-1" />
          <button
            type="button"
            onClick={onMarkAllRead}
            className="text-[11px] text-[var(--color-adv-teal)] hover:underline"
          >
            Mark all read
          </button>
        </div>

        {/* Filter tabs */}
        <div
          className="flex gap-0.5 px-2 py-2"
          style={{ borderBottom: '1px solid var(--color-border-soft)' }}
        >
          {(['All', 'Mentions', 'Reviews', 'Radar', 'System'] as const).map(t => {
            const active = t === filter;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setFilter(t)}
                className="rounded text-[11px]"
                style={{
                  padding: '3px 8px',
                  background: active ? 'var(--color-accent-soft)' : 'transparent',
                  color:      active ? 'var(--color-adv-teal)'    : 'var(--color-text-muted)',
                  fontWeight: active ? 600 : 500,
                }}
              >
                {t}
              </button>
            );
          })}
        </div>

        {/* Items */}
        <div className="max-h-[460px] overflow-y-auto">
          {filtered.length === 0 && (
            <div className="px-4 py-8 text-center">
              <div className="text-[12px] text-[var(--color-text-muted)]">Nothing here.</div>
            </div>
          )}
          {filtered.map((n, i) => {
            const Icon = n.icon;
            return (
              <div
                key={n.id}
                className="relative flex items-start gap-2.5 px-4 py-2.5"
                style={{
                  background: n.unread ? 'var(--color-surface-alt)' : 'transparent',
                  borderTop: i === 0 ? 'none' : '1px solid var(--color-border-soft)',
                }}
              >
                {n.unread && (
                  <div className="absolute left-1.5 top-4">
                    <Dot tone="accent" size={6} />
                  </div>
                )}
                <div
                  className="flex flex-shrink-0 items-center justify-center rounded-md"
                  style={{
                    width: 28, height: 28,
                    background: TONE_BG[n.tone],
                    color: TONE_FG[n.tone],
                    marginLeft: n.unread ? 8 : 0,
                  }}
                >
                  <Icon size={14} strokeWidth={1.5} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-0.5 flex items-baseline justify-between gap-2">
                    <span className="text-[12.5px] font-semibold text-[var(--color-text)]">{n.title}</span>
                    <span className="font-mono text-[10px] text-[var(--color-text-faint)]">{n.when}</span>
                  </div>
                  <div className="text-[11px] leading-snug text-[var(--color-text-muted)]">{n.sub}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
