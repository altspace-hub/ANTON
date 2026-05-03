/**
 * UnifiedMailScreen — companion-app Unified Mail (Evolution design).
 *
 * Per design/screens-modules.jsx UnifiedMailScreen:
 *   • Top bar — "Mail · daniel@anton.fc · +N connected"
 *   • Source filter chips — All / ANTON / Team / External / per-provider
 *   • ANTON daily digest hero — accent-tinted summary row
 *   • Message rows — coloured stripe per provider, ANTON action pills
 *     (DRAFTED / SUMMARIZED / ARCHIVE? / YOUR ACTION) + mono timestamps
 *
 * Data is real: pulls from /api/app/org/:orgId/mail/inbox and
 * /api/app/org/:orgId/mail/providers, which the server merges from
 * the existing app_messages + app_checkpoints tables (ANTON-native)
 * and any connected external providers.
 */

import { useEffect, useMemo, useState } from 'react';
import { Btn, Pill, Ico, Spinner } from '../components/ui';
import {
  listMailProviders, listMailInbox, inboxTime,
  type MailProvider, type MailMessage, type MailProviderKind,
} from '../services/mail';
import { getIdentity } from '../services/identity';

interface Props {
  orgId: string;
  onNavigate: (tab: string) => void;
  onOpenSettings: () => void;
}

const PROVIDER_COLOR: Record<MailProviderKind, string> = {
  anton:    'var(--color-accent)',
  m365:     'var(--color-blue)',
  gmail:    'var(--color-red)',
  imap:     'var(--color-text-muted)',
  exchange: 'var(--color-text-muted)',
};

const PROVIDER_LABEL: Record<MailProviderKind, string> = {
  anton:    'ANTON',
  m365:     'M365',
  gmail:    'GMAIL',
  imap:     'IMAP',
  exchange: 'EXCH',
};

export default function UnifiedMailScreen({ orgId, onNavigate, onOpenSettings }: Props): JSX.Element {
  const [providers, setProviders] = useState<MailProvider[]>([]);
  const [messages,  setMessages]  = useState<MailMessage[]>([]);
  const [filter,    setFilter]    = useState<MailProviderKind | 'all'>('all');
  const [loading,   setLoading]   = useState(true);
  const identity = getIdentity();
  const firstName = (identity?.displayName || 'You').split(/\s+/)[0];

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [p, m] = await Promise.all([
          listMailProviders(orgId).catch(() => []),
          listMailInbox(orgId, { limit: 30 }).catch(() => []),
        ]);
        if (!cancelled) {
          setProviders(p);
          setMessages(m);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [orgId]);

  // Re-fetch messages on filter change
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const m = await listMailInbox(orgId, { provider: filter, limit: 30 });
        if (!cancelled) setMessages(m);
      } catch { /* silent */ }
    })();
    return () => { cancelled = true; };
  }, [orgId, filter]);

  const antonAddress = useMemo(() => {
    const anton = providers.find(p => p.provider === 'anton');
    const raw = anton?.email_address;
    if (!raw) return `${firstName.toLowerCase()}@anton.local`;
    // The server may emit `<orgUuid>@anton.<instanceUuid>` for unconfigured
    // mailboxes — that's unreadable for a daily user. Replace any UUID-shaped
    // local-part with the user's first name, and any UUID-shaped domain with
    // `anton.local`, while preserving real configured addresses.
    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const [localPart, domain] = raw.split('@');
    const friendlyLocal = localPart && UUID.test(localPart) ? firstName.toLowerCase() : localPart;
    const cleanDomain = (domain || '').replace(/^anton\./i, '');
    const friendlyDomain = !domain
      ? 'anton.local'
      : UUID.test(cleanDomain)
        ? 'anton.local'
        : domain;
    return `${friendlyLocal}@${friendlyDomain}`;
  }, [providers, firstName]);

  const externalConnected = providers.filter(p => p.provider !== 'anton' && p.status === 'active').length;
  const unread = messages.filter(m => !m.is_read).length;
  const externalUnread = messages.filter(m => !m.is_read && m.is_external).length;
  const draftCount = messages.filter(m => m.ai_action === 'DRAFTED').length;

  // Source filter chips: All + every provider we know about
  const chips: Array<{ id: MailProviderKind | 'all'; label: string; color: string | null }> = [
    { id: 'all', label: 'All', color: null },
    ...providers.map(p => ({
      id: p.provider,
      label: p.display_name,
      color: PROVIDER_COLOR[p.provider],
    })),
  ];

  return (
    <div className="flex flex-1 flex-col overflow-hidden" style={{ background: 'var(--color-bg)' }}>
      {/* ── Top bar ─────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ background: 'var(--color-surface-alt)', minHeight: 44 }}
      >
        <div>
          <div
            className="text-[var(--color-text)]"
            style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.4px', lineHeight: 1.05 }}
          >
            Mail
          </div>
          <div
            className="font-mono text-[10px] text-[var(--color-text-muted)]"
            style={{ letterSpacing: '0.3px' }}
          >
            {antonAddress}{externalConnected > 0 && ` · +${externalConnected} connected`}
          </div>
        </div>
        <div className="-mr-2.5 flex items-center">
          <button
            onClick={onOpenSettings}
            aria-label="Mail setup"
            className="flex h-11 w-11 items-center justify-center"
          >
            <Ico name="plus" color="var(--color-text-muted)" size={18} />
          </button>
          <button
            aria-label="Search messages"
            className="flex h-11 w-11 items-center justify-center"
          >
            <Ico name="search" color="var(--color-text-muted)" size={18} />
          </button>
        </div>
      </div>

      {/* ── Source filter chips ───────────────────────────────
          pr-4 + scrollbarWidth:none so the last chip clears the screen
          edge instead of clipping; matches CalendarScreen source legend. */}
      <div
        className="flex gap-1.5 overflow-x-auto pb-2.5 pt-1"
        style={{
          borderBottom: '1px solid var(--color-border-soft)',
          paddingLeft: 14, paddingRight: 16, scrollbarWidth: 'none',
        }}
      >
        {chips.map(chip => {
          const active = chip.id === filter;
          return (
            <button
              key={chip.id}
              onClick={() => setFilter(chip.id)}
              className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold transition-colors"
              style={{
                fontSize: 12,
                background: active ? 'var(--color-text)'    : 'var(--color-surface)',
                color:      active ? 'var(--color-surface)' : 'var(--color-text-body)',
                border: `1px solid ${active ? 'var(--color-text)' : 'var(--color-border)'}`,
              }}
            >
              {chip.color && (
                <span
                  className="block rounded-full"
                  style={{ width: 6, height: 6, background: chip.color }}
                />
              )}
              {chip.label}
            </button>
          );
        })}
      </div>

      {/* ── ANTON daily digest hero ─────────────────────────── */}
      {!loading && messages.length > 0 && (
        <div
          className="mx-3.5 mt-2 mb-1.5 rounded-[var(--radius-r2)] p-3"
          style={{
            background: 'var(--color-accent-soft)',
            border: '1px solid var(--color-accent-dim)',
          }}
        >
          <div className="mb-1 flex items-center gap-1.5">
            <Ico name="sparkles" color="var(--color-accent)" size={13} />
            <span
              className="font-mono font-bold uppercase"
              style={{ fontSize: 10, color: 'var(--color-accent)', letterSpacing: '0.5px' }}
            >
              ANTON digest
            </span>
          </div>
          <div className="text-[12px] leading-relaxed text-[var(--color-text)]">
            <b>{unread}</b> unread
            {externalUnread > 0 && <> · <b>{externalUnread}</b> external</>}
            {draftCount > 0 && <> · <b>{draftCount}</b> draft{draftCount === 1 ? '' : 's'} ready</>}
          </div>
        </div>
      )}

      {/* ── Message list ────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex justify-center py-12">
            <Spinner size="lg" />
          </div>
        ) : messages.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <Ico name="inbox" color="var(--color-text-faint)" size={32} />
            <p className="mt-3 text-sm text-[var(--color-text-muted)]">Inbox is empty.</p>
            <p className="mt-1 text-[11px] text-[var(--color-text-faint)]">
              Connect M365, Gmail or IMAP from <b>Setup</b> to pull external mail. ANTON-native messages will appear automatically.
            </p>
            <Btn size="sm" variant="secondary" onClick={onOpenSettings} className="mt-4">
              Open setup
            </Btn>
          </div>
        ) : (
          messages.map((m, i) => {
            const color = PROVIDER_COLOR[m.provider];
            const tagLabel = PROVIDER_LABEL[m.provider];
            return (
              <button
                key={m.id}
                onClick={() => {
                  if (m.deep_link?.startsWith('/approvals')) onNavigate('approvals');
                  else if (m.deep_link?.startsWith('/chat')) onNavigate('chat');
                }}
                className="flex w-full gap-2.5 px-3.5 py-3 text-left"
                style={{
                  borderBottom: i < messages.length - 1 ? '1px solid var(--color-border-soft)' : 'none',
                  background: m.is_read ? 'transparent' : 'var(--color-surface)',
                }}
              >
                {/* coloured stripe */}
                <div
                  className="flex-shrink-0 self-stretch rounded-sm"
                  style={{ width: 3, background: m.is_read ? 'transparent' : color }}
                />
                <div className="min-w-0 flex-1">
                  <div className="mb-0.5 flex items-center gap-1.5">
                    <span
                      className="font-mono font-bold uppercase"
                      style={{ fontSize: 9, color, letterSpacing: '0.4px' }}
                    >
                      {tagLabel}
                    </span>
                    <span
                      className="text-[var(--color-text)]"
                      style={{ fontSize: 13, fontWeight: m.is_read ? 500 : 700 }}
                    >
                      · {m.from_name}
                    </span>
                    {m.is_external && (
                      <Pill tone="gold" style={{ padding: '1px 5px', fontSize: 9 }}>EXT</Pill>
                    )}
                    <span className="flex-1" />
                    <span
                      className="font-mono text-[var(--color-text-faint)]"
                      style={{ fontSize: 10 }}
                    >
                      {inboxTime(m.received_at)}
                    </span>
                  </div>
                  <div
                    className="text-[var(--color-text)]"
                    style={{ fontSize: 13, fontWeight: m.is_read ? 400 : 600, lineHeight: 1.3 }}
                  >
                    {m.subject}
                  </div>
                  <div
                    className="mt-1 truncate text-[11px] leading-relaxed text-[var(--color-text-muted)]"
                  >
                    {m.ai_action && (
                      <span className="font-bold" style={{ color: 'var(--color-accent)' }}>
                        ANTON ·{' '}
                      </span>
                    )}
                    {m.preview}
                  </div>
                  {m.ai_action && (
                    <div className="mt-2 flex gap-1.5">
                      <Pill tone={m.ai_action_tone ?? 'teal'}>{m.ai_action}</Pill>
                    </div>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
