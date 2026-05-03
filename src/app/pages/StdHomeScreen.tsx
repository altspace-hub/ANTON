/**
 * StdHomeScreen — Standard mode home (Evolution design).
 *
 * For non-technical users. Rules from the handoff README:
 *   • 16-18 px body, 22-24 px titles, 44+ px tap targets
 *   • No hashes, no IDs, no mono labels, no acronyms
 *   • Plain language ("Waiting for you", not "Approvals · 3 pending")
 *   • One thing per card, primary action only
 *
 * Same data sources as the Pro home (listPendingCheckpoints + sessions),
 * but the surface only ever shows the top item front-and-centre.
 */

import { useEffect, useState } from 'react';
import { Ico, ErrorPill } from '../components/ui';
import { listPendingCheckpoints, type Checkpoint } from '../services/checkpoints';
import { activeServerBase, activeAuthHeaders } from '../services/instances';
import { getIdentity } from '../services/identity';

interface Props {
  orgId: string;
  orgName: string;
  onNavigate: (tab: string) => void;
}

interface SessionRow {
  id: string;
  title: string;
  status: string;
  message_count: number;
  created_at: string;
  updated_at: string;
}

function plainGreeting(): string {
  const h = new Date().getHours();
  if (h < 5)  return 'Working late';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function plainDate(): string {
  return new Date().toLocaleDateString(undefined, {
    weekday: 'long', day: 'numeric', month: 'long',
  });
}

function plainTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } catch { return ''; }
}

export default function StdHomeScreen({ orgId, orgName, onNavigate }: Props) {
  const [pending,  setPending]  = useState<Checkpoint[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const identity = getIdentity();
  const firstName = (identity?.displayName || '').split(/\s+/)[0] || '';
  const initials = (identity?.displayName || 'You')
    .split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    void (async () => {
      try {
        const list = await listPendingCheckpoints({ orgId, limit: 5 });
        if (!cancelled) setPending(list);
      } catch {
        if (!cancelled) setLoadError('Couldn\'t reach your ANTON.');
      }

      try {
        const base = activeServerBase();
        const headers = await activeAuthHeaders();
        const r = await fetch(`${base}/api/app/org/${encodeURIComponent(orgId)}/sessions`, { headers });
        if (r.ok) {
          const rows = (await r.json()) as SessionRow[];
          if (!cancelled) setSessions(Array.isArray(rows) ? rows.slice(0, 3) : []);
        }
      } catch { /* secondary — sessions stays empty */ }
    })();
    return () => { cancelled = true; };
  }, [orgId, reloadTick]);

  const top = pending[0];
  const second = pending[1];

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: 'var(--color-bg)' }}>
      {/* ── Top bar — bigger greeting, avatar on the right ───── */}
      <div
        className="flex items-start gap-3 px-[18px] py-3"
        style={{ background: 'var(--color-bg)' }}
      >
        <div className="flex-1">
          <div
            className="text-[var(--color-text)]"
            style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.4px', lineHeight: 1.1 }}
          >
            {plainGreeting()}{firstName && `, ${firstName}`}
          </div>
          <div className="mt-1 text-sm text-[var(--color-text-muted)]">
            {plainDate()}
          </div>
        </div>
        <button
          onClick={() => onNavigate('you')}
          className="flex items-center justify-center rounded-full font-bold text-white"
          style={{
            width: 40, height: 40,
            background: 'var(--color-accent)',
            fontSize: 15,
          }}
        >
          {initials}
        </button>
      </div>

      <div className="mx-auto max-w-2xl px-4 pb-6 pt-1">
        {loadError && (
          <div className="mt-3">
            <ErrorPill message={loadError} onRetry={() => setReloadTick(t => t + 1)} />
          </div>
        )}

        {/* ── Waiting for you (primary, only the top item) ─── */}
        {top ? (
          <div
            className="mt-4 rounded-[var(--radius-r3)] bg-[var(--color-surface)] p-5"
            style={{
              border: '1px solid var(--color-accent)',
              boxShadow: '0 1px 0 var(--color-border-soft)',
            }}
          >
            <div className="mb-2 flex items-center gap-2">
              <span
                className="block rounded-full"
                style={{ width: 10, height: 10, background: 'var(--color-accent)' }}
              />
              <span
                className="text-[13px] font-bold"
                style={{ color: 'var(--color-accent)' }}
              >
                Waiting for you
              </span>
            </div>
            <div
              className="text-[var(--color-text)]"
              style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.4px', lineHeight: 1.2 }}
            >
              {top.title}
            </div>
            {top.summary && (
              <p className="mt-1 text-[15px] leading-relaxed text-[var(--color-text-body)]">
                {top.summary}
              </p>
            )}
            <div className="mt-4 flex flex-col gap-2">
              <button
                onClick={() => onNavigate('approvals')}
                className="flex items-center justify-center gap-2 rounded-[var(--radius-r2)] font-bold text-white"
                style={{
                  background: 'var(--color-accent)',
                  fontSize: 16,
                  padding: '14px 0',
                  letterSpacing: '-0.2px',
                }}
              >
                {top.requires_biometric && <Ico name="fingerprint" color="#fff" size={18} />}
                Review and approve
              </button>
              {/* Standard mode = one action per card (screens-standard.jsx pattern).
                  Removed the redundant "Not now" button — it routed to the same
                  place as Review anyway, and added decision-noise the spec
                  explicitly avoids. */}
            </div>
          </div>
        ) : (
          /* Empty state when nothing is waiting */
          <div
            className="mt-4 rounded-[var(--radius-r3)] bg-[var(--color-surface)] p-5"
            style={{ border: '1px solid var(--color-border)' }}
          >
            <div className="mb-2 flex items-center gap-2">
              <span
                className="block rounded-full"
                style={{ width: 10, height: 10, background: 'var(--color-green)' }}
              />
              <span
                className="text-[13px] font-bold"
                style={{ color: 'var(--color-green)' }}
              >
                You're all caught up
              </span>
            </div>
            <div
              className="text-[var(--color-text)]"
              style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.3px', lineHeight: 1.25 }}
            >
              Nothing needs your attention right now.
            </div>
            <p className="mt-1 text-[15px] text-[var(--color-text-muted)]">
              ANTON is keeping an eye on things at {orgName}.
            </p>
          </div>
        )}

        {/* ── Also waiting (the next item, quieter) ────────── */}
        {second && (
          <div
            className="mt-4 rounded-[var(--radius-r3)] bg-[var(--color-surface)] p-4"
            style={{ border: '1px solid var(--color-border)' }}
          >
            <div
              className="mb-1 text-[13px] font-bold"
              style={{ color: 'var(--color-gold)' }}
            >
              Also waiting
            </div>
            <div
              className="text-[var(--color-text)]"
              style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-0.2px', lineHeight: 1.25 }}
            >
              {second.title}
            </div>
            {second.summary && (
              <div className="mt-0.5 text-sm text-[var(--color-text-muted)]">
                {second.summary}
              </div>
            )}
          </div>
        )}

        {/* ── Today list (huge type, no metadata) ──────────── */}
        {sessions.length > 0 && (
          <>
            <div
              className="mt-6 mb-2.5 font-bold uppercase text-[var(--color-text-muted)]"
              style={{ fontSize: 13, letterSpacing: '0.4px' }}
            >
              Today
            </div>
            {sessions.map((s, i) => (
              <button
                key={s.id}
                onClick={() => onNavigate('history')}
                className="flex w-full gap-4 px-1 py-3 text-left"
                style={{
                  borderBottom: i < sessions.length - 1
                    ? '1px solid var(--color-border-soft)'
                    : 'none',
                }}
              >
                <div
                  className="font-bold text-[var(--color-text)]"
                  style={{ fontSize: 16, minWidth: 56 }}
                >
                  {plainTime(s.updated_at)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[16px] font-semibold text-[var(--color-text)]">
                    {s.title || 'Conversation with ANTON'}
                  </div>
                  <div className="mt-0.5 text-sm text-[var(--color-text-muted)]">
                    {s.message_count} message{s.message_count === 1 ? '' : 's'}
                  </div>
                </div>
              </button>
            ))}
          </>
        )}

        {/* ── Ask shortcut (always present, friendly) ──────── */}
        <button
          onClick={() => onNavigate('ask')}
          className="mt-6 flex w-full items-center gap-3 rounded-[var(--radius-r3)] p-4"
          style={{ background: 'var(--color-accent-soft)' }}
        >
          <Ico name="mic" color="var(--color-accent)" size={26} />
          <div className="flex-1 text-left">
            <div className="text-[15px] font-semibold text-[var(--color-text)]">
              Ask ANTON anything
            </div>
            <div className="text-[13px] text-[var(--color-text-muted)]">
              Tap and talk, or type
            </div>
          </div>
          <Ico name="chevronRight" color="var(--color-accent)" size={20} />
        </button>
      </div>
    </div>
  );
}
