/**
 * EmailSetupScreen — Connect a mail provider (Evolution design).
 *
 * Per design/screens-comms.jsx EmailSetupScreen: provider picker (M365 /
 * Gmail / IMAP / Exchange), permissions preview ("ANTON will be able to…"),
 * primary CTA to start the OAuth/IMAP flow.
 *
 * v1 honesty: this surface stores the connection metadata and surfaces
 * the provider in the inbox source-filter strip. Actual mail pulling is
 * scaffolded — we tell the user what env vars / OAuth setup the
 * administrator still needs to configure.
 */

import { useState } from 'react';
import { Btn, Pill, SectionLabel, Ico } from '../components/ui';
import {
  connectMailProvider, syncMailProvider,
  type MailProviderKind,
} from '../services/mail';

interface Props {
  orgId: string;
  onBack: () => void;
}

interface ProviderCard {
  kind: MailProviderKind;
  label: string;
  hint: string;
  recommended?: boolean;
  initials: string;
}

const PROVIDER_CARDS: ProviderCard[] = [
  { kind: 'm365',     label: 'Microsoft 365',   hint: 'OAuth · recommended for enterprise',  recommended: true,  initials: 'M3' },
  { kind: 'gmail',    label: 'Google Workspace', hint: 'OAuth',                                                  initials: 'GW' },
  { kind: 'imap',     label: 'IMAP / SMTP',      hint: 'Advanced · app-password required',                       initials: 'IM' },
  { kind: 'exchange', label: 'Exchange Server',  hint: 'On-prem · certificate pinning',                          initials: 'EX' },
];

const PERMISSIONS = [
  { ok: true,  text: 'Read your inbox + archived mail' },
  { ok: true,  text: 'Draft replies (never sends without approval)' },
  { ok: true,  text: 'Attach drafts to Missions / Knowledge' },
  { ok: false, text: 'Move, delete, or forward mail' },
  { ok: false, text: 'Access other calendars / contacts' },
];

export default function EmailSetupScreen({ orgId, onBack }: Props): JSX.Element {
  const [selected, setSelected] = useState<MailProviderKind | null>(null);
  const [working,  setWorking]  = useState(false);
  const [message,  setMessage]  = useState<{ kind: 'info' | 'success' | 'error'; text: string } | null>(null);

  async function onConnect() {
    if (!selected || working) return;
    setWorking(true);
    setMessage(null);
    try {
      const provider = await connectMailProvider(orgId, { provider: selected });
      // Trigger a sync attempt — the v1 backend returns the configuration
      // hint the administrator needs to wire the rest.
      const sync = await syncMailProvider(orgId, provider.id);
      setMessage({
        kind: sync.ok ? 'success' : 'info',
        text: sync.message || 'Provider added. Check the inbox.',
      });
    } catch (e) {
      setMessage({ kind: 'error', text: e instanceof Error ? e.message : 'Connect failed' });
    } finally {
      setWorking(false);
    }
  }

  const card = selected ? PROVIDER_CARDS.find(c => c.kind === selected) : null;

  return (
    <div className="flex flex-1 flex-col overflow-hidden" style={{ background: 'var(--color-bg)' }}>
      {/* Top bar */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ background: 'var(--color-surface-alt)', borderBottom: '1px solid var(--color-border-soft)', minHeight: 44 }}
      >
        <button onClick={onBack} className="flex items-center gap-1.5">
          <Ico name="chevronLeft" color="var(--color-text-muted)" size={20} />
          <span className="text-sm font-semibold text-[var(--color-text)]">Connect Email</span>
        </button>
        <Pill tone="neutral" mono>SETUP</Pill>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5">
        <div
          className="text-[var(--color-text)]"
          style={{ fontSize: '1.375rem', fontWeight: 700, letterSpacing: '-0.5px', lineHeight: 1.2 }}
        >
          Let ANTON read your inbox
        </div>
        <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-[var(--color-text-muted)]">
          Connect read-only. ANTON summarises, drafts replies, and flags regulated content — it never sends unless you approve.
        </p>

        {/* Provider picker */}
        <SectionLabel className="mb-2 mt-5">Choose provider</SectionLabel>
        <div className="flex flex-col gap-2">
          {PROVIDER_CARDS.map(p => {
            const active = selected === p.kind;
            return (
              <button
                key={p.kind}
                onClick={() => setSelected(p.kind)}
                className="flex items-center gap-3 rounded-[var(--radius-r2)] p-3.5"
                style={{
                  background: 'var(--color-surface)',
                  border: `1px solid ${active ? 'var(--color-accent)' : (p.recommended ? 'var(--color-accent)' : 'var(--color-border)')}`,
                  outline: active ? '2px solid var(--color-accent-dim)' : 'none',
                }}
              >
                <div
                  className="flex items-center justify-center rounded-[var(--radius-r1)] font-mono font-bold text-[var(--color-text)]"
                  style={{ width: 34, height: 34, background: 'var(--color-surface-alt)', fontSize: '0.75rem' }}
                >
                  {p.initials}
                </div>
                <div className="flex-1 text-left">
                  <div className="text-[0.8125rem] font-semibold text-[var(--color-text)]">{p.label}</div>
                  <div className="text-[0.6875rem] text-[var(--color-text-muted)]">{p.hint}</div>
                </div>
                {p.recommended && <Pill tone="teal">SUGGESTED</Pill>}
                <Ico name="chevronRight" color="var(--color-text-faint)" size={16} />
              </button>
            );
          })}
        </div>

        {/* Permissions preview */}
        <div
          className="mt-5 rounded-[var(--radius-r2)] p-3.5"
          style={{ background: 'var(--color-surface-alt)', border: '1px solid var(--color-border-soft)' }}
        >
          <SectionLabel className="mb-2">ANTON will be able to</SectionLabel>
          {PERMISSIONS.map((r, i) => (
            <div key={i} className="flex items-center gap-2 py-1 text-[0.75rem]">
              <span
                className="flex items-center justify-center rounded-full text-white"
                style={{
                  width: 16, height: 16,
                  background: r.ok ? 'var(--color-green)' : 'var(--color-surface-muted)',
                  color: r.ok ? '#fff' : 'var(--color-text-faint)',
                }}
                aria-hidden="true"
              >
                <Ico name={r.ok ? 'check' : 'x'} size={10} color="currentColor" />
              </span>
              <span className={r.ok ? 'text-[var(--color-text-body)]' : 'text-[var(--color-text-faint)]'}>
                {r.text}
              </span>
            </div>
          ))}
        </div>

        {/* Result message */}
        {message && (
          <div
            className="mt-4 rounded-[var(--radius-r2)] p-3 text-[0.75rem]"
            style={{
              background:
                message.kind === 'error'   ? 'var(--color-red-dim)' :
                message.kind === 'success' ? 'var(--color-green-dim)' :
                                             'var(--color-accent-soft)',
              color:
                message.kind === 'error'   ? 'var(--color-red)' :
                message.kind === 'success' ? 'var(--color-green)' :
                                             'var(--color-accent)',
              border: `1px solid ${
                message.kind === 'error'   ? 'var(--color-red-dim)' :
                message.kind === 'success' ? 'var(--color-green-dim)' :
                                             'var(--color-accent-dim)'
              }`,
            }}
          >
            {message.text}
          </div>
        )}

        <Btn
          variant="primary" block
          icon={<Ico name="shield" color="currentColor" size={15} />}
          className="mt-5"
          disabled={!selected || working}
          onClick={() => void onConnect()}
        >
          {working ? 'Connecting…' : card ? `Continue with ${card.label}` : 'Pick a provider'}
        </Btn>
      </div>
    </div>
  );
}
