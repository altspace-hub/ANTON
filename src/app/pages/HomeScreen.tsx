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
  PriorityCard, MonogramTile, getModuleGlyph, ErrorPill, QuickActionTile,
} from '../components/ui';
import { listPendingCheckpoints, type Checkpoint } from '../services/checkpoints';
import { clientFetch } from '../services/api';
import { getIdentity } from '../services/identity';
import { getOrgDailyBrief, type DailyBrief } from '../services/api';

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
  const [brief,          setBrief]          = useState<DailyBrief | null>(null);
  const [briefExpanded,  setBriefExpanded]  = useState(false);
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

      // Both calls below now route through clientFetch so they work over
      // the mesh transport (was direct fetch with empty server_base on
      // mesh-paired instances → SPA HTML in response → silent failure).
      try {
        const r = await clientFetch(`/org/${encodeURIComponent(orgId)}/sessions`);
        if (r.ok) {
          const rows = (await r.json()) as SessionRow[];
          if (!cancelled) setSessions(Array.isArray(rows) ? rows.slice(0, 4) : []);
        }
      } catch { /* secondary — sessions list stays empty */ }

      try {
        const r = await clientFetch(`/org/${encodeURIComponent(orgId)}/announcements`);
        if (r.ok) {
          const rows = await r.json();
          if (!cancelled) setAnnouncements(Array.isArray(rows) ? rows.slice(0, 3) : []);
        }
      } catch { /* secondary — announcements stay empty */ }

      // AI-generated daily briefing from the orchestrator. Secondary —
      // not every instance has the orchestrator running, and a fresh
      // instance won't have any briefs yet.
      try {
        const data = await getOrgDailyBrief(orgId);
        if (!cancelled) setBrief(data.brief);
      } catch { /* silent — brief is optional */ }
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
            fontSize: '1.625rem',
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
            fontSize: '0.84375rem',
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

        {/* ── AI-generated daily briefing from the Orchestrator ─── */}
        {brief && (() => {
          // Strip raw markdown so the preview reads as clean prose:
          // - drop ATX headers (#, ##, …)
          // - drop bold/italic markers
          // - flatten pipe-separated metadata lines
          // - collapse blank lines
          // - take the first meaningful line as the headline, the next
          //   sentence as the summary
          const cleaned = brief.content
            .replace(/^#+\s*/gm, '')                // ATX headers
            .replace(/\*\*([^*]+)\*\*/g, '$1')      // bold
            .replace(/\*([^*]+)\*/g, '$1')          // italic
            .replace(/^\s*\|\s*/gm, '')             // pipe table prefix
            .replace(/^\s*[-=*_]{3,}\s*$/gm, '')    // horizontal rules
            .replace(/^\s*[-*•]\s+/gm, '')          // bullet markers
            .split('\n').map(l => l.trim()).filter(Boolean);
          const headline = cleaned[0] || 'ANTON briefing ready';
          const summary  = cleaned.slice(1).join(' · ').slice(0, 280);
          return (
            <div className="mt-5">
              <PriorityCard
                tone="accent"
                headerLeft={
                  <span className="inline-flex items-center gap-1.5">
                    <Ico name="sparkles" size={11} />
                    ANTON DAILY BRIEF · {new Date(brief.created_at).toLocaleDateString([], { day: 'numeric', month: 'short' })}
                  </span>
                }
                headerRight={briefExpanded ? 'Hide ↑' : 'Read →'}
                onClick={() => setBriefExpanded(v => !v)}
              >
                <div
                  style={{
                    fontSize: '0.9375rem',
                    fontWeight: 700,
                    color: 'var(--color-text)',
                    letterSpacing: '-0.2px',
                    lineHeight: 1.3,
                  }}
                >
                  {headline}
                </div>
                {!briefExpanded && summary && (
                  <p
                    className="mt-1.5 line-clamp-3"
                    style={{ fontSize: '0.78125rem', lineHeight: 1.5, color: 'var(--color-text-muted)' }}
                  >
                    {summary}
                  </p>
                )}
                {briefExpanded && (
                  <div
                    className="mt-2 text-[0.84375rem] leading-relaxed"
                    style={{ color: 'var(--color-text-body)', whiteSpace: 'pre-wrap' }}
                  >
                    {brief.content}
                  </div>
                )}
                {(brief.signals_read > 0 || brief.proposals_count > 0) && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {brief.signals_read > 0 && (
                      <Pill tone="neutral" mono>{brief.signals_read} SIGNALS</Pill>
                    )}
                    {brief.proposals_count > 0 && (
                      <Pill tone="teal" mono>{brief.proposals_count} PROPOSALS</Pill>
                    )}
                  </div>
                )}
              </PriorityCard>
            </div>
          );
        })()}

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
                  fontSize: '0.9375rem',
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
                    fontSize: '0.78125rem',
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
          <QuickActionTile icon="mic"      label="Voice"    desc="Hold to talk"   onClick={() => onNavigate('voice')} />
          <QuickActionTile icon="camera"   label="Capture"  desc="Photo or share" onClick={() => onNavigate('capture')} />
          <QuickActionTile icon="message"  label="Ask"      desc="Text chat"      onClick={() => onNavigate('chat')} />
          <QuickActionTile
            icon="sparkles"
            label="Missions"
            desc="Multi-step jobs"
            onClick={() => onNavigate('missions')}
          />
        </div>

        {/* ── Today (recent activity) — Claude Design rich rows ── */}
        {sessions.length > 0 && (
          <div className="mt-7">
            <div className="mb-2.5 flex items-center justify-between px-1">
              <SectionLabel>Today</SectionLabel>
              <button
                onClick={() => onNavigate('history')}
                className="transition"
                style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-accent)' }}
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
                            fontSize: '0.6875rem',
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
                            fontSize: '0.875rem',
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
                        style={{ fontSize: '0.71875rem', color: 'var(--color-text-muted)' }}
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
                      style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text)' }}
                    >
                      {/* Defensive U+FFFD strip — some legacy seed rows have
                          the replacement character where an em dash was lost
                          during a non-UTF-8 insert. */}
                      {a.title.replace(/�/g, '—')}
                    </div>
                    <p
                      className="mt-1 line-clamp-3"
                      style={{
                        fontSize: '0.75rem', lineHeight: 1.5,
                        color: 'var(--color-text-muted)',
                      }}
                    >
                      {a.content.replace(/�/g, '—')}
                    </p>
                    <p
                      className="mt-2"
                      style={{ fontSize: '0.6875rem', color: 'var(--color-text-faint)' }}
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
                fontSize: '0.9375rem',
                fontWeight: 600,
                color: 'var(--color-text)',
                letterSpacing: '-0.1px',
              }}
            >
              All clear.
            </div>
            <div
              className="mt-1 max-w-[280px]"
              style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}
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
