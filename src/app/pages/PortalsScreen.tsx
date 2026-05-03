/**
 * PortalsScreen — companion-app Portals tile.
 *
 * Surfaces the portals registered on this ANTON instance (the user's
 * "ANTON-only web spaces" with capability descriptors). v1 is read-only
 * with a hand-off to the Pro UI for editing — building portals on a
 * 4-inch screen is a non-goal.
 *
 * Data: GET /api/app/org/:orgId/portals → { portals: PortalSummary[] }
 *   - shows display_title || name
 *   - status pill (active / draft / archived)
 *   - surface_mode tag (managed / external — external links to the bring-
 *     your-own-site URL)
 *   - description preview
 */

import { useEffect, useState } from 'react';
import { Ico, PageHeader, Pill, Spinner, ErrorPill, SectionLabel } from '../components/ui';
import { getOrgPortals, type PortalSummary } from '../services/api';

interface Props {
  orgId: string;
  onBack: () => void;
}

function statusTone(status: string): 'green' | 'gold' | 'neutral' {
  if (status === 'active' || status === 'published')   return 'green';
  if (status === 'draft' || status === 'walkthrough')  return 'gold';
  return 'neutral';
}

export default function PortalsScreen({ orgId, onBack }: Props): JSX.Element {
  const [portals, setPortals] = useState<PortalSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getOrgPortals(orgId)
      .then(d => { if (!cancelled) setPortals(Array.isArray(d.portals) ? d.portals : []); })
      .catch(() => { if (!cancelled) setError('Couldn\'t load portals.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [orgId, reloadTick]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden" style={{ background: 'var(--color-bg)', minHeight: 0 }}>
      <PageHeader title="Portals" subtitle="Your ANTON-only web spaces" onBack={onBack} />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl space-y-3 px-4 pb-10 pt-4">
          {error && (
            <ErrorPill message={error} onRetry={() => setReloadTick(t => t + 1)} />
          )}

          {loading ? (
            <div className="flex justify-center py-12">
              <Spinner size="lg" />
            </div>
          ) : portals.length === 0 ? (
            <div
              className="rounded-[var(--radius-r3)] px-5 py-12 text-center"
              style={{
                background: 'var(--color-surface)',
                border: '1px dashed var(--color-border)',
              }}
            >
              <span className="mb-3 inline-flex" style={{ color: 'var(--color-text-faint)' }}>
                <Ico name="grid" size={28} />
              </span>
              <p className="text-[15px] font-semibold" style={{ color: 'var(--color-text)' }}>
                No portals yet
              </p>
              <p
                className="mx-auto mt-1 max-w-[280px] text-[13px] leading-relaxed"
                style={{ color: 'var(--color-text-muted)' }}
              >
                Build a portal in the Pro UI on your desktop ANTON, then it'll
                appear here for visitors and machines to discover.
              </p>
            </div>
          ) : (
            <>
              <SectionLabel className="px-1">{portals.length} portal{portals.length === 1 ? '' : 's'}</SectionLabel>
              {portals.map(p => (
                <PortalRow key={p.id} portal={p} />
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function PortalRow({ portal }: { portal: PortalSummary }): JSX.Element {
  const tone = statusTone(portal.status);
  const isExternal = portal.surface_mode === 'external';
  const externalUrl = portal.external_primary_url;

  return (
    <div
      className="rounded-[var(--radius-r2)] p-3.5"
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
      }}
    >
      <div className="flex items-start justify-between gap-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h2
              className="truncate text-[15px] font-semibold"
              style={{ color: 'var(--color-text)', letterSpacing: '-0.15px' }}
            >
              {portal.display_title || portal.name}
            </h2>
          </div>
          {portal.category && (
            <div className="mt-0.5 font-mono text-[10px]" style={{ color: 'var(--color-text-muted)', letterSpacing: '0.4px' }}>
              {portal.category.toUpperCase()}
            </div>
          )}
        </div>
        <Pill tone={tone}>{portal.status}</Pill>
      </div>

      {portal.description && (
        <p
          className="mt-2 text-[13px] leading-relaxed"
          style={{ color: 'var(--color-text-body)' }}
        >
          {portal.description}
        </p>
      )}

      {isExternal && externalUrl && (
        <div
          className="mt-2.5 flex items-center gap-1.5 truncate font-mono text-[11px]"
          style={{ color: 'var(--color-accent)' }}
        >
          <Ico name="wifi" size={11} color="currentColor" />
          <span className="truncate">{externalUrl}</span>
        </div>
      )}

      {portal.public_index && (
        <div className="mt-2 flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
          <Ico name="search" size={11} color="currentColor" />
          Discoverable in the public directory
        </div>
      )}
    </div>
  );
}
