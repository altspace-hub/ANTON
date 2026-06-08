/**
 * ConnectionsPage — list of paired ANTON instances / orgs (Evolution design).
 *
 * Per Way Forward §06: "wallet of modules, not a clip-art grid". Each org
 * gets a coloured monogram tile (two letters, flat colour, rounded square)
 * — the same visual language as the More menu. No emoji.
 *
 * Light theme (warm linen canvas), accent for primary action ("Join").
 */

import { useState, useEffect } from 'react';
import { Btn, Pill, SectionLabel, Ico, Spinner, ErrorPill } from '../components/ui';
import { getConnections } from '../services/api';
import { getIdentity } from '../services/identity';

interface Props {
  onSelectOrg: (orgId: string, orgName?: string) => void;
  onJoinNew: () => void;
  onProfile: () => void;
}

interface Connection {
  id: string;
  name: string;
  org_type: string;
  description: string | null;
  welcome_message: string | null;
  role: string;
  joined_at: string;
}

// Org-type → monogram colour. Stable per type so the user learns associations.
// Uses status / accent colours; never tinted by personal accent.
const ORG_TYPE_COLOUR: Record<string, string> = {
  school:           'var(--color-blue)',
  ngo:              'var(--color-green)',
  sports_club:      'var(--color-gold)',
  consulting:       'var(--color-accent)',
  consulting_firm:  'var(--color-accent)',
  company:          'var(--color-text)',
  community:        'var(--color-plum)',
  government:       'var(--color-text)',
  healthcare:       'var(--color-red)',
  other:            'var(--color-text-muted)',
};

const ORG_TYPE_LABEL: Record<string, string> = {
  school:           'School',
  ngo:              'NGO',
  sports_club:      'Sports club',
  consulting:       'Consulting',
  consulting_firm:  'Consulting',
  company:          'Company',
  community:        'Community',
  government:       'Government',
  healthcare:       'Healthcare',
  other:            'Other',
};

function monogram(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .padEnd(2, ' ')
    .slice(0, 2);
}

export default function ConnectionsPage({ onSelectOrg, onJoinNew, onProfile }: Props) {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const identity = getIdentity();
  const userInitial = (identity?.displayName || '?')[0]?.toUpperCase() ?? '?';

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getConnections()
      .then(rows => { if (!cancelled) setConnections(Array.isArray(rows) ? rows : []); })
      .catch(() => { if (!cancelled) setError('Couldn\'t load your organisations.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [reloadTick]);

  return (
    <div
      className="safe-top safe-bottom flex min-h-dvh flex-col"
      style={{ background: 'var(--color-bg)' }}
    >
      {/* ── Header ─────────────────────────────────────────── */}
      <header className="px-5 pb-4 pt-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div
              className="flex items-center justify-center rounded-[var(--radius-r1)]"
              style={{
                width: 32, height: 32,
                background: 'var(--color-accent)',
                color: 'var(--color-accent-fg)',
                fontSize: '1.0625rem', fontWeight: 800, letterSpacing: '-0.4px',
              }}
            >
              A
            </div>
            <div>
              <h1
                className="text-[var(--color-text)]"
                style={{ fontSize: '1.125rem', fontWeight: 700, letterSpacing: '-0.3px', lineHeight: 1.1 }}
              >
                ANTON
              </h1>
              <p className="text-[0.6875rem]" style={{ color: 'var(--color-text-muted)' }}>
                Hello, {identity?.displayName || 'there'}
              </p>
            </div>
          </div>
          <button
            onClick={onProfile}
            aria-label="Profile"
            className="flex items-center justify-center rounded-full transition active:scale-95"
            style={{
              width: 40, height: 40,
              background: 'var(--color-accent-soft)',
              color: 'var(--color-accent)',
              border: '1px solid var(--color-accent-dim)',
              fontSize: '0.875rem', fontWeight: 700,
            }}
          >
            {userInitial}
          </button>
        </div>
      </header>

      {/* ── Org list ───────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-5 pb-6">
        <div className="mb-3 flex items-center justify-between">
          <SectionLabel>Your organisations</SectionLabel>
          <button
            onClick={onJoinNew}
            className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[0.6875rem] font-semibold transition active:scale-95"
            style={{
              background: 'var(--color-accent-soft)',
              color: 'var(--color-accent)',
              border: '1px solid var(--color-accent-dim)',
            }}
          >
            <Ico name="plus" size={13} />
            Join
          </button>
        </div>

        {error && (
          <div className="mb-3">
            <ErrorPill message={error} onRetry={() => setReloadTick(t => t + 1)} />
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-16">
            <Spinner size="lg" />
          </div>
        ) : connections.length === 0 ? (
          /* Empty state */
          <div
            className="rounded-[var(--radius-r3)] px-5 py-12 text-center"
            style={{
              background: 'var(--color-surface)',
              border: '1px dashed var(--color-border)',
            }}
          >
            <div
              className="mx-auto mb-3 inline-flex rounded-full p-3"
              style={{
                background: 'var(--color-accent-soft)',
                color: 'var(--color-accent)',
              }}
            >
              <Ico name="qr" size={26} />
            </div>
            <div className="text-[0.9375rem] font-semibold" style={{ color: 'var(--color-text)' }}>
              No organisations yet
            </div>
            <div className="mt-1 text-[0.75rem]" style={{ color: 'var(--color-text-muted)' }}>
              Scan a QR code or enter an invitation token to get started.
            </div>
            <div className="mt-4">
              <Btn variant="primary" size="md" onClick={onJoinNew}>
                Join organisation
              </Btn>
            </div>
          </div>
        ) : (
          /* Connected orgs */
          <div className="space-y-2.5">
            {connections.map(conn => {
              const c = ORG_TYPE_COLOUR[conn.org_type] ?? ORG_TYPE_COLOUR.other;
              const typeLabel = ORG_TYPE_LABEL[conn.org_type] ?? conn.org_type;
              return (
                <button
                  key={conn.id}
                  onClick={() => onSelectOrg(conn.id, conn.name)}
                  className="flex w-full items-center gap-3 rounded-[var(--radius-r2)] p-3 text-left transition hover:shadow-sm active:scale-[0.99]"
                  style={{
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                  }}
                >
                  {/* Monogram tile */}
                  <div
                    className="flex flex-shrink-0 items-center justify-center rounded-[var(--radius-r1)] font-bold"
                    style={{
                      width: 44, height: 44,
                      background: c,
                      color: '#FFFFFF',
                      fontSize: '1rem', letterSpacing: '-0.3px',
                    }}
                  >
                    {monogram(conn.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div
                      className="truncate text-[0.875rem] font-semibold"
                      style={{ color: 'var(--color-text)' }}
                    >
                      {conn.name}
                    </div>
                    {conn.description && (
                      <div
                        className="truncate text-[0.6875rem]"
                        style={{ color: 'var(--color-text-muted)' }}
                      >
                        {conn.description}
                      </div>
                    )}
                    <div className="mt-1 flex items-center gap-1.5">
                      <Pill tone="neutral" mono>{typeLabel.toUpperCase()}</Pill>
                      <Pill tone="teal" mono>{conn.role.toUpperCase()}</Pill>
                    </div>
                  </div>
                  <span style={{ color: 'var(--color-text-faint)' }}>
                    <Ico name="chevronRight" size={16} />
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
