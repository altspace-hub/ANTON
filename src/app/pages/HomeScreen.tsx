/**
 * HomeScreen — Pro mode dashboard, Evolution design.
 *
 * Layout (matches design/screens-auth.jsx HomeScreen_D):
 *   • Greeting + sub line
 *   • Priority approval card (top-most pending checkpoint, severity-coloured)
 *   • Quick-actions grid (Voice / Capture / Ask / Missions)
 *   • Today list — recent activity from the user's app sessions
 *   • Optional announcements section (unchanged from v1)
 *
 * Data sources are real:
 *   • listPendingCheckpoints()                       → priority card + count
 *   • GET /api/app/org/:orgId/sessions               → today list
 *   • GET /api/app/org/:orgId/announcements          → announcements
 */

import { useEffect, useState } from 'react';
import { Btn, Card, Pill, SectionLabel, Ico } from '../components/ui';
import { listPendingCheckpoints, type Checkpoint } from '../services/checkpoints';
import { activeServerBase, activeAuthHeaders } from '../services/instances';
import { getIdentity } from '../services/identity';

interface Props {
  orgId: string;
  orgName: string;
  orgType: string;
  onNavigate: (tab: string) => void;
}

interface Announcement {
  id: string;
  title: string;
  content: string;
  priority: string;
  is_pinned: boolean;
  created_at: string;
}

interface SessionRow {
  id: string;
  title: string;
  status: string;
  message_count: number;
  total_input_tokens: number | null;
  total_output_tokens: number | null;
  created_at: string;
  updated_at: string;
}

const SEVERITY_TONE: Record<Checkpoint['severity'], 'red' | 'gold' | 'neutral'> = {
  critical: 'red',
  high:     'red',
  normal:   'gold',
  low:      'neutral',
};

function timeOfDayGreeting(): string {
  const h = new Date().getHours();
  if (h < 5)  return 'Working late';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function shortTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  } catch { return ''; }
}

function tokenSummary(s: SessionRow): string {
  const total = (s.total_input_tokens ?? 0) + (s.total_output_tokens ?? 0);
  if (!total) return `${s.message_count} msg`;
  const k = total >= 1000 ? `${(total / 1000).toFixed(1)}k` : `${total}`;
  return `${k} tokens · ${s.message_count} msg`;
}

export default function HomeScreen({ orgId, orgName, onNavigate }: Props) {
  const [pending,        setPending]        = useState<Checkpoint[]>([]);
  const [sessions,       setSessions]       = useState<SessionRow[]>([]);
  const [announcements,  setAnnouncements]  = useState<Announcement[]>([]);
  const identity = getIdentity();
  const firstName = (identity?.displayName || '').split(/\s+/)[0] || '';

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await listPendingCheckpoints({ orgId, limit: 10 });
        if (!cancelled) setPending(list);
      } catch { /* silent */ }

      try {
        const base = activeServerBase();
        const headers = await activeAuthHeaders();
        const r = await fetch(`${base}/api/app/org/${encodeURIComponent(orgId)}/sessions`, { headers });
        if (r.ok) {
          const rows = (await r.json()) as SessionRow[];
          if (!cancelled) setSessions(Array.isArray(rows) ? rows.slice(0, 4) : []);
        }
      } catch { /* silent */ }

      try {
        const base = activeServerBase();
        const headers = await activeAuthHeaders();
        const r = await fetch(`${base}/api/app/org/${encodeURIComponent(orgId)}/announcements`, { headers });
        if (r.ok) {
          const rows = await r.json();
          if (!cancelled) setAnnouncements(Array.isArray(rows) ? rows.slice(0, 3) : []);
        }
      } catch { /* silent */ }
    })();
    return () => { cancelled = true; };
  }, [orgId]);

  const top = pending[0];

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: 'var(--color-bg)' }}>
      <div className="mx-auto max-w-2xl px-4 pb-6 pt-5">
        {/* ── Greeting ─────────────────────────────────────────── */}
        <h1
          className="text-[var(--color-text)]"
          style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.6px', lineHeight: 1.1 }}
        >
          {timeOfDayGreeting()}{firstName && `, ${firstName}`}.
        </h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          {pending.length > 0
            ? `${pending.length} ${pending.length === 1 ? 'thing needs' : 'things need'} a look.`
            : `Connected to ${orgName}.`}
        </p>

        {/* ── Priority approval card ───────────────────────────── */}
        {top && (
          <button
            onClick={() => onNavigate('approvals')}
            className="mt-5 block w-full overflow-hidden rounded-[var(--radius-r3)] border border-[var(--color-border)] bg-[var(--color-surface)] text-left transition-shadow hover:shadow-sm active:scale-[0.99]"
          >
            <div
              className="flex items-center justify-between px-4 py-3"
              style={{
                background: 'var(--color-accent-soft)',
                color: 'var(--color-accent)',
                borderBottom: '1px solid var(--color-accent-dim)',
              }}
            >
              <div className="flex items-center gap-2">
                <Ico name="shield" color="currentColor" size={15} />
                <span
                  className="font-mono font-bold uppercase"
                  style={{ fontSize: 11, letterSpacing: '0.6px' }}
                >
                  {pending.length} approval{pending.length === 1 ? '' : 's'} waiting
                </span>
              </div>
              <span style={{ fontSize: 11, fontWeight: 600 }}>Review →</span>
            </div>
            <div className="px-4 py-4">
              <div className="text-sm font-semibold text-[var(--color-text)]">
                {top.title}
              </div>
              {top.summary && (
                <div className="mt-0.5 text-xs leading-relaxed text-[var(--color-text-muted)]">
                  {top.summary}
                </div>
              )}
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Pill tone={SEVERITY_TONE[top.severity]} mono>
                  {top.severity.toUpperCase()}
                </Pill>
                <Pill tone="neutral" mono>{top.id.slice(-8)}</Pill>
                {top.requires_biometric && (
                  <Pill tone="neutral">
                    <Ico name="fingerprint" size={11} /> Biometric
                  </Pill>
                )}
              </div>
            </div>
          </button>
        )}

        {/* ── Quick actions ────────────────────────────────────── */}
        <div className="mt-5 grid grid-cols-2 gap-2.5">
          {[
            { id: 'voice',    icon: 'mic'      as const, label: 'Voice',    desc: 'Hold to talk',   onTap: () => onNavigate('voice') },
            { id: 'capture',  icon: 'camera'   as const, label: 'Capture',  desc: 'Photo or share', onTap: () => onNavigate('capture') },
            { id: 'ask',      icon: 'message'  as const, label: 'Ask',      desc: 'Text chat',      onTap: () => onNavigate('chat') },
            { id: 'missions', icon: 'sparkles' as const, label: 'Missions', desc: `${pending.length} pending`, onTap: () => onNavigate('approvals') },
          ].map(a => (
            <button
              key={a.id}
              onClick={a.onTap}
              className="rounded-[var(--radius-r2)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3.5 text-left transition active:scale-[0.97]"
            >
              <div
                className="flex items-center justify-center rounded-[var(--radius-r1)]"
                style={{
                  width: 30, height: 30,
                  background: 'var(--color-surface-alt)',
                  color: 'var(--color-text)',
                }}
              >
                <Ico name={a.icon} color="currentColor" size={17} />
              </div>
              <div className="mt-2.5 text-[13px] font-semibold text-[var(--color-text)]">
                {a.label}
              </div>
              <div className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">
                {a.desc}
              </div>
            </button>
          ))}
        </div>

        {/* ── Today (recent activity) ──────────────────────────── */}
        {sessions.length > 0 && (
          <div className="mt-6">
            <div className="mb-3 flex items-center justify-between">
              <SectionLabel>Today</SectionLabel>
              <button
                onClick={() => onNavigate('history')}
                className="text-[11px] font-semibold"
                style={{ color: 'var(--color-accent)' }}
              >
                See all
              </button>
            </div>
            {sessions.map((s, i) => (
              <div
                key={s.id}
                className="flex items-start gap-3 py-3"
                style={{
                  borderBottom: i < sessions.length - 1
                    ? '1px solid var(--color-border-soft)'
                    : 'none',
                }}
              >
                <div
                  className="font-mono"
                  style={{ minWidth: 38, fontSize: 11, color: 'var(--color-text-muted)', paddingTop: 1 }}
                >
                  {shortTime(s.updated_at)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold leading-tight text-[var(--color-text)]">
                    {s.title || '(untitled session)'}
                  </div>
                  <div className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">
                    {tokenSummary(s)}
                  </div>
                </div>
                <Pill tone={s.status === 'archived' ? 'neutral' : 'teal'}>
                  {(s.status || 'open').toUpperCase()}
                </Pill>
              </div>
            ))}
          </div>
        )}

        {/* ── Announcements (legacy) ───────────────────────────── */}
        {announcements.length > 0 && (
          <div className="mt-6">
            <SectionLabel className="mb-3">Announcements</SectionLabel>
            <div className="space-y-2">
              {announcements.map(a => {
                const tone =
                  a.priority === 'urgent' ? 'red' :
                  a.priority === 'high'   ? 'gold' :
                  'neutral';
                return (
                  <Card key={a.id}>
                    <div className="mb-1 flex items-center gap-2">
                      {a.is_pinned && <Pill tone="neutral" mono>PINNED</Pill>}
                      <Pill tone={tone} mono>{a.priority.toUpperCase()}</Pill>
                    </div>
                    <div className="text-[13px] font-semibold text-[var(--color-text)]">
                      {a.title}
                    </div>
                    <p className="mt-1 line-clamp-3 text-[12px] leading-relaxed text-[var(--color-text-muted)]">
                      {a.content}
                    </p>
                    <p className="mt-2 text-[10px] text-[var(--color-text-faint)]">
                      {new Date(a.created_at).toLocaleDateString()}
                    </p>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Empty state when nothing is pending ──────────────── */}
        {pending.length === 0 && sessions.length === 0 && announcements.length === 0 && (
          <Card className="mt-6">
            <div className="text-center">
              <div className="text-[13px] font-semibold text-[var(--color-text)]">All clear.</div>
              <div className="mt-1 text-[11px] text-[var(--color-text-muted)]">
                Nothing waiting for you. Ask ANTON something below.
              </div>
              <div className="mt-3 flex justify-center gap-2">
                <Btn size="sm" variant="primary" onClick={() => onNavigate('chat')}
                     icon={<Ico name="message" color="currentColor" size={14} />}>
                  Start chat
                </Btn>
                <Btn size="sm" variant="secondary" onClick={() => onNavigate('voice')}
                     icon={<Ico name="mic" color="currentColor" size={14} />}>
                  Voice
                </Btn>
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
