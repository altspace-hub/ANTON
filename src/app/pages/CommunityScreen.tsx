/**
 * CommunityScreen — companion-app Community tile.
 *
 * Surfaces the user's contact card (the ANTON-network identity) plus
 * pending and accepted connections. v1 is a viewing surface — the actual
 * E2E-encrypted messaging UI lives in the Pro tab on desktop. This
 * screen lets the user (a) see who they are on the network, (b) read
 * their contact hash to share, (c) see who's connected, (d) hand off
 * to Pro to message someone.
 */

import { useEffect, useState } from 'react';
import {
  Ico, PageHeader, Pill, Spinner, ErrorPill, SectionLabel, Btn,
} from '../components/ui';
import { getOrgCommunity, type CommunityIdentity, type CommunityConnection } from '../services/api';

interface Props {
  orgId: string;
  onBack: () => void;
}

export default function CommunityScreen({ orgId, onBack }: Props): JSX.Element {
  const [identity, setIdentity] = useState<CommunityIdentity | null>(null);
  const [connections, setConnections] = useState<CommunityConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getOrgCommunity(orgId)
      .then(d => {
        if (cancelled) return;
        setIdentity(d.identity ?? null);
        setConnections(Array.isArray(d.connections) ? d.connections : []);
      })
      .catch(() => { if (!cancelled) setError('Couldn\'t reach Community.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [orgId, reloadTick]);

  async function copyHash() {
    if (!identity?.contact_hash) return;
    try {
      await navigator.clipboard.writeText(identity.contact_hash);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  }

  const pendingCount  = connections.filter(c => c.status === 'pending').length;
  const acceptedCount = connections.filter(c => c.status === 'accepted').length;
  const accepted = connections.filter(c => c.status === 'accepted');
  const pending  = connections.filter(c => c.status === 'pending');

  return (
    <div className="flex flex-1 flex-col overflow-hidden" style={{ background: 'var(--color-bg)', minHeight: 0 }}>
      <PageHeader title="Community" subtitle="Your ANTON network" onBack={onBack} />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl space-y-5 px-4 pb-10 pt-4">
          {error && (
            <ErrorPill message={error} onRetry={() => setReloadTick(t => t + 1)} />
          )}

          {loading ? (
            <div className="flex justify-center py-12">
              <Spinner size="lg" />
            </div>
          ) : (
            <>
              {/* ── Identity card ─────────────────────────────────────── */}
              <section>
                <SectionLabel className="mb-2 px-1">You on the network</SectionLabel>
                {identity?.contact_hash ? (
                  <div
                    className="rounded-[var(--radius-r2)] p-4"
                    style={{
                      background: 'var(--color-accent-soft)',
                      border: '1px solid var(--color-accent-dim)',
                    }}
                  >
                    <div
                      className="text-[13px] font-semibold"
                      style={{ color: 'var(--color-accent)', letterSpacing: '-0.1px' }}
                    >
                      {identity.display_name || 'Your ANTON'}
                    </div>
                    <div
                      className="mt-2 break-all font-mono text-[12.5px]"
                      style={{ color: 'var(--color-text)', letterSpacing: '0.3px' }}
                    >
                      {identity.contact_hash}
                    </div>
                    <div className="mt-3 flex items-center gap-2.5">
                      <Btn
                        variant="primary"
                        size="sm"
                        onClick={() => void copyHash()}
                        icon={<Ico name={copied ? 'check' : 'key'} size={14} color="currentColor" />}
                      >
                        {copied ? 'Copied' : 'Copy contact hash'}
                      </Btn>
                    </div>
                    <p
                      className="mt-3 text-[12px] leading-relaxed"
                      style={{ color: 'var(--color-text-muted)' }}
                    >
                      Share this hash with someone to let them connect to your ANTON.
                      Messages between connected ANTONs are end-to-end encrypted.
                    </p>
                  </div>
                ) : (
                  <div
                    className="rounded-[var(--radius-r2)] p-4 text-center"
                    style={{
                      background: 'var(--color-surface)',
                      border: '1px dashed var(--color-border)',
                    }}
                  >
                    <p className="text-[14px] font-semibold" style={{ color: 'var(--color-text)' }}>
                      Community not activated
                    </p>
                    <p
                      className="mx-auto mt-1 max-w-[280px] text-[12px] leading-relaxed"
                      style={{ color: 'var(--color-text-muted)' }}
                    >
                      Activate your ANTON-network identity from the Pro UI on
                      your desktop ANTON to start receiving connection requests.
                    </p>
                  </div>
                )}
              </section>

              {/* ── Pending requests ─────────────────────────────────── */}
              {pendingCount > 0 && (
                <section>
                  <SectionLabel className="mb-2 px-1">
                    {pendingCount} pending request{pendingCount === 1 ? '' : 's'}
                  </SectionLabel>
                  <div className="space-y-2">
                    {pending.map(c => <ConnectionRow key={c.id} c={c} />)}
                  </div>
                  <p
                    className="mt-2 px-1 text-[11.5px]"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    Accept or decline pending requests in the Pro UI on your desktop ANTON.
                  </p>
                </section>
              )}

              {/* ── Accepted connections ─────────────────────────────── */}
              <section>
                <SectionLabel className="mb-2 px-1">
                  {acceptedCount} connection{acceptedCount === 1 ? '' : 's'}
                </SectionLabel>
                {accepted.length === 0 ? (
                  <div
                    className="rounded-[var(--radius-r2)] p-4 text-center"
                    style={{
                      background: 'var(--color-surface)',
                      border: '1px solid var(--color-border)',
                    }}
                  >
                    <span className="mb-2 inline-flex" style={{ color: 'var(--color-text-faint)' }}>
                      <Ico name="user" size={24} />
                    </span>
                    <p className="text-[14px] font-semibold" style={{ color: 'var(--color-text)' }}>
                      No connections yet
                    </p>
                    <p
                      className="mx-auto mt-1 max-w-[280px] text-[12px] leading-relaxed"
                      style={{ color: 'var(--color-text-muted)' }}
                    >
                      Share your contact hash above to receive your first
                      ANTON-to-ANTON connection.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {accepted.map(c => <ConnectionRow key={c.id} c={c} />)}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ConnectionRow({ c }: { c: CommunityConnection }): JSX.Element {
  const initials = (c.display_name || '?')
    .split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '??';

  return (
    <div
      className="flex items-center gap-3 rounded-[var(--radius-r2)] p-3"
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
      }}
    >
      <span
        className="flex flex-shrink-0 items-center justify-center rounded-[var(--radius-r1)] font-semibold"
        style={{
          width: 36, height: 36,
          background: 'var(--color-accent-soft)',
          color: 'var(--color-accent)',
          fontSize: 13,
        }}
      >
        {initials}
      </span>
      <div className="min-w-0 flex-1">
        <div
          className="truncate text-[14px] font-semibold"
          style={{ color: 'var(--color-text)' }}
        >
          {c.display_name || 'Unnamed connection'}
        </div>
        <div
          className="truncate font-mono text-[10.5px]"
          style={{ color: 'var(--color-text-muted)', letterSpacing: '0.3px' }}
        >
          {c.contact_hash}
        </div>
      </div>
      {c.status === 'pending' && <Pill tone="gold">pending</Pill>}
    </div>
  );
}
