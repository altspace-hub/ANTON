/**
 * HomeScreen — Pro mode dashboard (Claude-Design IRE pass, May 3).
 *
 * Layout matches the "Same Home, four people" target:
 *   • Big greeting + "X things need a look" subtitle
 *   • PriorityCard — top approval, accent left border, header strip showing
 *     "{N} APPROVALS WAITING / Review →", title + summary + pills
 *   • 2x2 quick actions grid (smaller than before — content card leads)
 *   • TODAY · See all — rich session rows with module monogram + time +
 *     title + meta + status pill (COMPLETED / TRANSFORM / OPENED)
 *   • Announcements (legacy)
 */

import { useEffect, useState } from 'react';
import {
  Btn, Card, Pill, SectionLabel, Ico,
  PriorityCard, MonogramTile, getModuleGlyph, ErrorPill,
} from '../components/ui';
import { listPendingCheckpoints, type Checkpoint } from '../services/checkpoints';
import { activeServerBase, activeAuthHeaders } from '../services/instances';
import { getIdentity } from '../services/identity';

interface Props {
  orgId: string;
  orgName: string;
  orgType: string;
  onNavigate: (tab: string) => void;
  onOpenSession?: (sessionId: string) => void;
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
  resolved_module_id?: string | null;
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

function sessionStatusTreatment(status: string): { label: string; tone: 'green' | 'gold' | 'blue' | 'neutral' } {
  const s = (status || 'open').toLowerCase();
  if (s === 'completed' || s === 'closed')  return { label: 'COMPLETED', tone: 'green'  };
  if (s === 'transform')                    return { label: 'TRANSFORM', tone: 'blue'   };
  if (s === 'archived')                     return { label: 'ARCHIVED',  tone: 'neutral'};
  if (s === 'open' || s === 'active')       return { label: 'ACTIVE',    tone: 'green'  };
  return { label: s.toUpperCase(), tone: 'neutral' };
}

export default function HomeScreen({ orgId, onNavigate, onOpenSession }: Props) {
  const [pending,        setPending]        = useState<Checkpoint[]>([]);
  const [sessions,       setSessions]       = useState<SessionRow[]>([]);
  const [announcements,  setAnnouncements]  = useState<Announcement[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const identity = getIdentity();
  const firstName = (identity?.displayName || '').split(/\s+/)[0] || '';

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    // Pending approvals is the load-bearing fetch — surface its failure.
    // Sessions + announcements are secondary; if either of those silently
    // returns empty, the home screen still renders, just without history.
    void (async () => {
      try {
        const list = await listPendingCheckpoints({ orgId, limit: 10 });
        if (!cancelled) setPending(list);
      } catch {
        if (!cancelled) setLoadError('Couldn\'t load approvals.');
      }

      try {
        const base = activeServerBase();
        const headers = await activeAuthHeaders();
        const r = await fetch(`${base}/api/app/org/${encodeURIComponent(orgId)}/sessions`, { headers });
        if (r.ok) {
          const rows = (await r.json()) as SessionRow[];
          if (!cancelled) setSessions(Array.isArray(rows) ? rows.slice(0, 4) : []);
        }
      } catch { /* secondary — sessions list stays empty */ }

      try {
        const base = activeServerBase();
        const headers = await activeAuthHeaders();
        const r = await fetch(`${base}/api/app/org/${encodeURIComponent(orgId)}/announcements`, { headers });
        if (r.ok) {
          const rows = await r.json();
          if (!cancelled) setAnnouncements(Array.isArray(rows) ? rows.slice(0, 3) : []);
        }
      } catch { /* secondary — announcements stay empty */ }
    })();
    return () => { cancelled = true; };
  }, [orgId, reloadTick]);

  const top = pending[0];
  const greeting = timeOfDayGreeting();
  const subline =
    pending.length > 0
      ? `${pending.length} ${pending.length === 1 ? 'thing needs' : 'things need'} a look.`
      : sessions.length > 0
      ? `Picking up where you left off.`
      : `Ready when you are.`;

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: 'var(--color-bg)' }}>
      <div className="mx-auto max-w-2xl px-4 pb-8 pt-5">
        {/* ── Greeting ─────────────────────────────────────────── */}
        <h1
          style={{
            fontSize: 26,
            fontWeight: 700,
            letterSpacing: '-0.7px',
            lineHeight: 1.1,
            color: 'var(--color-text)',
          }}
        >
          {greeting}{firstName && `, ${firstName}`}.
        </h1>
        <p
          className="mt-1.5"
          style={{
            fontSize: 13.5,
            color: 'var(--color-text-muted)',
            letterSpacing: '-0.1px',
          }}
        >
          {subline}
        </p>

        {loadError && (
          <div className="mt-4">
            <ErrorPill message={loadError} onRetry={() => setReloadTick(t => t + 1)} />
          </div>
        )}

        {/* ── Priority approval card (Claude Design pattern) ───── */}
        {top && (
          <div className="mt-5">
            <PriorityCard
              tone="accent"
              headerLeft={
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="block rounded-full"
                    style={{ width: 6, height: 6, background: 'currentColor' }}
                  />
                  {pending.length} approval{pending.length === 1 ? '' : 's'} waiting
                </span>
              }
              headerRight="Review →"
              onClick={() => onNavigate('approvals')}
            >
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  color: 'var(--color-text)',
                  letterSpacing: '-0.2px',
                  lineHeight: 1.3,
                }}
              >
                {top.title}
              </div>
              {top.summary && (
                <div
                  className="mt-1.5"
                  style={{
                    fontSize: 12.5,
                    lineHeight: 1.5,
                    color: 'var(--color-text-muted)',
                  }}
                >
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
            </PriorityCard>
          </div>
        )}

        {/* ── Quick actions ────────────────────────────────────── */}
        <div className="mt-5 grid grid-cols-2 gap-2.5">
          {[
            { id: 'voice',    icon: 'mic'      as const, label: 'Voice',    desc: 'Hold to talk',   onTap: () => onNavigate('voice') },
            { id: 'capture',  icon: 'camera'   as const, label: 'Capture',  desc: 'Photo or share', onTap: () => onNavigate('capture') },
            { id: 'ask',      icon: 'message'  as const, label: 'Ask',      desc: 'Text chat',      onTap: () => onNavigate('chat') },
            {
              id: 'missions',
              icon: 'sparkles' as const,
              label: 'Missions',
              desc: pending.length > 0 ? `${pending.length} pending` : 'All clear',
              onTap: () => onNavigate('approvals'),
            },
          ].map(a => (
            <button
              key={a.id}
              onClick={a.onTap}
              className="rounded-[var(--radius-r2)] text-left transition active:scale-[0.97]"
              style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                padding: 16,
              }}
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
              <div
                style={{
                  marginTop: 12,
                  fontSize: 14,
                  fontWeight: 600,
                  color: 'var(--color-text)',
                  letterSpacing: '-0.1px',
                  lineHeight: 1.2,
                }}
              >
                {a.label}
              </div>
              <div
                style={{
                  marginTop: 4,
                  fontSize: 11.5,
                  color: 'var(--color-text-muted)',
                  lineHeight: 1.3,
                }}
              >
                {a.desc}
              </div>
            </button>
          ))}
        </div>

        {/* ── Today (recent activity) — Claude Design rich rows ── */}
        {sessions.length > 0 && (
          <div className="mt-7">
            <div className="mb-2.5 flex items-center justify-between px-1">
              <SectionLabel>Today</SectionLabel>
              <button
                onClick={() => onNavigate('history')}
                className="transition"
                style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-accent)' }}
              >
                See all →
              </button>
            </div>
            <div
              className="overflow-hidden rounded-[var(--radius-r2)]"
              style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
              }}
            >
              {sessions.map((s, i) => {
                const status = sessionStatusTreatment(s.status);
                const moduleKey = s.resolved_module_id ?? '';
                const glyph = getModuleGlyph(moduleKey, s.title || 'Session');
                return (
                  <button
                    key={s.id}
                    onClick={() => onOpenSession?.(s.id)}
                    className="flex w-full items-center text-left transition active:bg-[var(--color-surface-alt)]"
                    style={{
                      gap: 12,
                      paddingLeft: 14,
                      paddingRight: 14,
                      paddingTop: 14,
                      paddingBottom: 14,
                      borderTop: i > 0 ? '1px solid var(--color-border-soft)' : 'none',
                    }}
                  >
                    <MonogramTile letters={glyph.letters} tone={glyph.tone} size={32} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span
                          className="font-mono"
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: 'var(--color-text-muted)',
                            letterSpacing: '-0.2px',
                          }}
                        >
                          {shortTime(s.updated_at)}
                        </span>
                        <span
                          className="truncate"
                          style={{
                            fontSize: 14,
                            fontWeight: 600,
                            color: 'var(--color-text)',
                            letterSpacing: '-0.1px',
                            lineHeight: 1.25,
                          }}
                        >
                          {s.title || '(untitled session)'}
                        </span>
                      </div>
                      <div
                        className="mt-1 truncate"
                        style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}
                      >
                        {tokenSummary(s)}
                      </div>
                    </div>
                    <Pill tone={status.tone} mono>{status.label}</Pill>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Announcements (legacy) ───────────────────────────── */}
        {announcements.length > 0 && (
          <div className="mt-7">
            <SectionLabel className="mb-2.5 px-1">Announcements</SectionLabel>
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
                    <div
                      style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}
                    >
                      {a.title}
                    </div>
                    <p
                      className="mt-1 line-clamp-3"
                      style={{
                        fontSize: 12, lineHeight: 1.5,
                        color: 'var(--color-text-muted)',
                      }}
                    >
                      {a.content}
                    </p>
                    <p
                      className="mt-2"
                      style={{ fontSize: 10, color: 'var(--color-text-faint)' }}
                    >
                      {new Date(a.created_at).toLocaleDateString()}
                    </p>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Empty state ──────────────────────────────────────── */}
        {pending.length === 0 && sessions.length === 0 && announcements.length === 0 && (
          <div className="mt-10 flex flex-col items-center text-center">
            <span className="mb-3 inline-flex" style={{ color: 'var(--color-text-faint)' }}>
              <Ico name="sparkles" size={28} />
            </span>
            <div
              style={{
                fontSize: 15,
                fontWeight: 600,
                color: 'var(--color-text)',
                letterSpacing: '-0.1px',
              }}
            >
              All clear.
            </div>
            <div
              className="mt-1 max-w-[280px]"
              style={{ fontSize: 12, color: 'var(--color-text-muted)' }}
            >
              Nothing waiting for you. Ask ANTON something below.
            </div>
            <div className="mt-4 flex justify-center gap-2">
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
        )}
      </div>
    </div>
  );
}
