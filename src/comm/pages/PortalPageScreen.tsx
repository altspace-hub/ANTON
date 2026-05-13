/**
 * PortalPageScreen.tsx — in-app portal viewer (Phase 3 of the portal
 * window plan).
 *
 * Mounted from PortalDetailScreen when the descriptor declares a
 * `portal.originEndpoint`. Three concerns layered together:
 *
 *   1. Page-list rail   (top)    — horizontal scrollable tabs, one per
 *                                  visible portal_pages row. Hidden when
 *                                  the portal has ≤1 page.
 *   2. Page body        (middle) — <iframe sandbox="" srcdoc={wrapForSandbox(...)}>
 *                                  The wrapForSandbox helper inlines our
 *                                  light-theme reset so every portal
 *                                  looks like a Comm App pane regardless
 *                                  of what HTML the author wrote.
 *   3. Capability bar   (bottom) — sticky strip of one-tap CTAs for every
 *                                  declared capability. Tapping defers to
 *                                  the parent (PortalDetailScreen owns the
 *                                  CapabilityForm flow).
 *
 * Failure modes:
 *   - Origin unreachable / 5xx        → "Publisher offline" banner. The
 *                                       capability bar stays interactive
 *                                       because invocation is a separate
 *                                       endpoint family.
 *   - Origin declared but no pages    → "No pages published" empty card.
 *                                       Still functional via capabilities.
 *   - Page returns 404                → null → "Page not found" banner.
 *
 * Out of scope (deferred):
 *   - In-iframe link navigation. `sandbox=""` blocks top-nav, so portal
 *     authors must rely on the page-list rail. We could relax to
 *     `allow-top-navigation-by-user-activation` later, but that opens
 *     a small attack surface, so we keep the tighter posture for v1.
 *   - Offline cache. Phase 5 of the plan.
 *   - Asset (image) loading inside the iframe. Resolving these would
 *     require either rewriting <img src> to absolute URLs against
 *     originEndpoint, or fetching + inlining as data: URIs. Phase 4.
 */

import { useEffect, useState } from 'react';
import { wrapForSandbox } from '../lib/portal-sandbox';
import {
  fetchPortalPage,
  fetchPortalPages,
  type PortalDescriptor,
  type CapabilitySpec,
  type PortalPage,
  type PortalPageMeta,
} from '../services/portals';

interface Props {
  descriptor: PortalDescriptor;
  onSelectCapability: (cap: CapabilitySpec) => void;
}

export default function PortalPageScreen({ descriptor, onSelectCapability }: Props) {
  const [pages, setPages] = useState<PortalPageMeta[] | null>(null);
  const [currentPath, setCurrentPath] = useState<string>('/');
  const [page, setPage] = useState<PortalPage | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  // `stale` is true when the current `page` came from the IndexedDB
  // cache because the publisher's origin was unreachable. Cleared on
  // every new fetch attempt and only re-set if the cache fallback
  // actually fires. The page-list cache is tracked separately because
  // either source of staleness justifies the banner.
  const [pageStale, setPageStale] = useState(false);
  const [pagesStale, setPagesStale] = useState(false);

  // List the visible pages once per descriptor. Failure is benign — we
  // fall back to assuming there's a single page at "/" and proceed.
  useEffect(() => {
    let cancelled = false;
    setPagesStale(false);
    fetchPortalPages(descriptor, () => { if (!cancelled) setPagesStale(true); })
      .then((list) => { if (!cancelled) setPages(list ?? []); })
      .catch(() => { if (!cancelled) setPages([]); });
    return () => { cancelled = true; };
  }, [descriptor]);

  // Fetch the body for the current path. Re-runs when the user taps a tab.
  useEffect(() => {
    let cancelled = false;
    setPageLoading(true);
    setPageError(null);
    setPageStale(false);
    fetchPortalPage(descriptor, currentPath, () => { if (!cancelled) setPageStale(true); })
      .then((p) => {
        if (cancelled) return;
        setPage(p);
        setPageLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setPageError(err instanceof Error ? err.message : 'Publisher offline');
        setPageLoading(false);
      });
    return () => { cancelled = true; };
  }, [descriptor, currentPath]);

  const isStale = pageStale || pagesStale;

  const capabilities = descriptor.capabilities ?? [];
  const showTabs = (pages?.length ?? 0) > 1;
  const srcDoc = page ? wrapForSandbox(page.html, { title: page.title ?? descriptor.portal.displayTitle }) : null;

  return (
    <div className="flex flex-col h-full bg-[var(--color-bg)]">
      {showTabs && pages && (
        <nav
          aria-label="Portal pages"
          className="flex gap-1.5 px-3 py-2 overflow-x-auto border-b border-[var(--color-border-soft)] bg-[var(--color-surface)]"
        >
          {pages.map((p) => {
            const active = p.path === currentPath;
            return (
              <button
                key={p.path}
                onClick={() => setCurrentPath(p.path)}
                className={`flex-shrink-0 px-3 py-1.5 text-sm rounded-full transition-colors ${
                  active
                    ? 'bg-[var(--color-accent)] text-[var(--color-accent-fg)] font-medium'
                    : 'bg-[var(--color-surface-alt)] text-[var(--color-text-body)]'
                }`}
              >
                {p.title ?? p.path}
              </button>
            );
          })}
        </nav>
      )}

      {isStale && !pageLoading && !pageError && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center gap-2 px-4 py-1.5 text-[11px] font-medium border-b border-[#E5B07A]/40 bg-[#FDF4E7] text-[#8A5A1E]"
        >
          <span aria-hidden="true">●</span>
          <span>Offline — showing the last cached copy. Publisher is unreachable.</span>
        </div>
      )}

      <div className="flex-1 min-h-0 bg-[var(--color-bg)]">
        {pageLoading ? (
          <div className="px-5 py-10 text-center text-sm text-[var(--color-text-faint)]">Loading page…</div>
        ) : pageError ? (
          <div className="mx-5 mt-6 rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-alt)] p-6 text-center">
            <p className="text-sm font-medium text-[var(--color-text)]">Publisher offline</p>
            <p className="mt-1 text-xs text-[var(--color-text-faint)]">{pageError}</p>
            <p className="mt-3 text-xs text-[var(--color-text-muted)]">
              You can still use the actions below.
            </p>
          </div>
        ) : !srcDoc ? (
          <div className="mx-5 mt-6 rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-alt)] p-6 text-center">
            <p className="text-sm text-[var(--color-text-body)]">No page published yet.</p>
            <p className="mt-1 text-xs text-[var(--color-text-faint)]">{currentPath}</p>
          </div>
        ) : (
          <iframe
            // key forces a clean remount when the user switches tabs.
            // Without this, the iframe just swaps srcDoc but keeps scroll position,
            // which feels wrong on a per-page rail.
            key={currentPath}
            title={page?.title ?? descriptor.portal.displayTitle}
            sandbox=""
            srcDoc={srcDoc}
            className="w-full h-full border-0 bg-[var(--color-bg)]"
          />
        )}
      </div>

      {capabilities.length > 0 && (
        <nav
          aria-label="Portal actions"
          className="flex gap-2 px-3 py-3 border-t border-[var(--color-border-soft)] bg-[var(--color-surface)] overflow-x-auto safe-bottom"
        >
          {capabilities.map((c) => (
            <button
              key={c.id}
              onClick={() => onSelectCapability(c)}
              className="flex-shrink-0 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-2xl text-sm font-medium"
              style={{
                backgroundColor: 'var(--color-accent)',
                color: 'var(--color-accent-fg)',
              }}
            >
              <span className="text-[10px] uppercase tracking-wide opacity-80">{c.verb}</span>
              <span>{c.title}</span>
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}
