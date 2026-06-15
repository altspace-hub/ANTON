/**
 * PortalsScreen — companion-app Portals tile (VISITOR view).
 *
 * The companion app's purpose for portals is *visiting other people's
 * portals* — discovery, browsing, capability-invocation. Building or
 * managing your own portals lives in the Pro UI on desktop.
 *
 * Layout:
 *   - Search box at top (filters across name + title + description)
 *   - Discoverable portal list — only `status=active AND public_index=TRUE`
 *   - Each row: title, category mono-tag, description preview, external
 *     URL (if surface_mode=external), "Visit" button
 *   - Empty state with hint to use the desktop Pro UI to invoke
 *     capabilities
 *
 * Data: GET /api/app/org/:orgId/portals/discover?q=...
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Btn, Ico, PageHeader, Pill, Spinner, ErrorPill, SectionLabel,
} from '../components/ui';
import { discoverPortals, type PortalSummary } from '../services/api';

interface Props {
  orgId: string;
  onBack: () => void;
}

function categoryFor(p: PortalSummary): string | null {
  return p.category ? p.category.toUpperCase() : null;
}

function visitUrlFor(p: PortalSummary): string | null {
  if (p.surface_mode === 'external' && p.external_primary_url) return p.external_primary_url;
  // For managed portals, the public visit URL is /portals/visit/{namespace}/{name}
  // on the originating instance. The companion app doesn't always know the
  // origin host, so we fall back to opening it on the paired instance.
  return null;
}

export default function PortalsScreen({ orgId, onBack }: Props): JSX.Element {
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const [portals, setPortals] = useState<PortalSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    discoverPortals(orgId, query)
      .then(d => { if (!cancelled) setPortals(Array.isArray(d.portals) ? d.portals : []); })
      .catch(() => { if (!cancelled) setError('Couldn\'t reach the portal directory.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [orgId, query, reloadTick]);

  const submitSearch = () => setQuery(draft.trim());

  const grouped = useMemo(() => {
    // Group portals by category for a simpler scannable list.
    const byCategory = new Map<string, PortalSummary[]>();
    for (const p of portals) {
      const key = p.category || 'other';
      if (!byCategory.has(key)) byCategory.set(key, []);
      byCategory.get(key)!.push(p);
    }
    return Array.from(byCategory.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [portals]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden" style={{ background: 'var(--color-bg)', minHeight: 0 }}>
      <PageHeader title="Portals" subtitle="Visit ANTON portals" onBack={onBack} />

      {/* Search box */}
      <div className="flex-shrink-0 px-4 pt-3">
        <div
          className="flex items-center gap-2 rounded-[var(--radius-r2)] px-3 py-2"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
        >
          <Ico name="search" color="var(--color-text-muted)" size={16} />
          <label htmlFor="portals-search" className="sr-only">Search portals</label>
          <input
            id="portals-search"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitSearch(); } }}
            placeholder="Search by name, topic, or description…"
            className="flex-1 bg-transparent text-sm focus:outline-none"
            style={{ color: 'var(--color-text)', minWidth: 0 }}
          />
          {draft && (
            <button
              onClick={() => { setDraft(''); setQuery(''); }}
              aria-label="Clear search"
              className="flex h-8 w-8 items-center justify-center"
              style={{ color: 'var(--color-text-muted)' }}
            >
              <Ico name="x" size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl space-y-4 px-4 pb-10 pt-3">
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
              <p className="text-base font-semibold" style={{ color: 'var(--color-text)' }}>
                {query ? `Nothing matched "${query}"` : 'No portals to discover yet'}
              </p>
              <p
                className="mx-auto mt-1 max-w-[280px] text-sm leading-relaxed"
                style={{ color: 'var(--color-text-muted)' }}
              >
                {query
                  ? 'Try a different word, or clear the search to see everything.'
                  : 'Once you connect to ANTON peers (LAN scan in the Pro UI), their public portals will appear here.'}
              </p>
            </div>
          ) : (
            <>
              <SectionLabel className="px-1">
                {portals.length} portal{portals.length === 1 ? '' : 's'}
                {query && ` matching "${query}"`}
              </SectionLabel>
              {grouped.map(([cat, items]) => (
                <div key={cat} className="space-y-2">
                  <div
                    className="px-1 font-mono text-[0.6875rem] font-semibold uppercase"
                    style={{ color: 'var(--color-text-muted)', letterSpacing: '0.6px' }}
                  >
                    {cat}
                  </div>
                  {items.map(p => <PortalCard key={p.id} portal={p} />)}
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function PortalCard({ portal }: { portal: PortalSummary }): JSX.Element {
  const cat = categoryFor(portal);
  const visitUrl = visitUrlFor(portal);
  const initials = (portal.display_title || portal.name)
    .split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '??';

  function visit() {
    if (!visitUrl) return;
    // Capacitor's allowNavigation whitelist will route external URLs to the
    // system browser automatically; same fallback for PWA.
    window.open(visitUrl, '_blank');
  }

  return (
    <div
      className="rounded-[var(--radius-r2)] p-3.5"
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
      }}
    >
      <div className="flex items-start gap-3">
        {/* Monogram */}
        <span
          className="flex flex-shrink-0 items-center justify-center rounded-[var(--radius-r1)] font-semibold"
          style={{
            width: 40, height: 40,
            background: 'var(--color-accent-soft)',
            color: 'var(--color-accent)',
            fontSize: '0.875rem',
          }}
          aria-hidden="true"
        >
          {initials}
        </span>
        <div className="min-w-0 flex-1">
          <h2
            className="truncate text-base font-semibold"
            style={{ color: 'var(--color-text)', letterSpacing: '-0.15px' }}
          >
            {portal.display_title || portal.name}
          </h2>
          {cat && (
            <div
              className="mt-0.5 font-mono text-[0.6875rem]"
              style={{ color: 'var(--color-text-muted)', letterSpacing: '0.4px' }}
            >
              {cat}
            </div>
          )}
        </div>
      </div>

      {portal.description && (
        <p
          className="mt-2.5 text-sm leading-relaxed"
          style={{ color: 'var(--color-text-body)' }}
        >
          {portal.description}
        </p>
      )}

      <div className="mt-3 flex items-center gap-2">
        {visitUrl ? (
          <Btn
            variant="primary"
            size="sm"
            onClick={visit}
            icon={<Ico name="arrowUp" color="currentColor" size={13} />}
          >
            Visit
          </Btn>
        ) : (
          <Pill tone="neutral">Capabilities only</Pill>
        )}
        {portal.surface_mode === 'external' && (
          <span className="text-[0.6875rem]" style={{ color: 'var(--color-text-muted)' }}>
            External site
          </span>
        )}
      </div>
    </div>
  );
}
