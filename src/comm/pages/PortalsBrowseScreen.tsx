import { useEffect, useRef, useState } from 'react';
import { searchPortals, type PortalSearchResult } from '../services/portals';

interface Props {
  onOpenPortal: (address: string) => void;
}

const POPULAR_VERBS = [
  { value: 'contact', label: 'Contact' },
  { value: 'book',    label: 'Book' },
  { value: 'order',   label: 'Order' },
  { value: 'inquire', label: 'Inquire' },
  { value: 'request', label: 'Request' },
  { value: 'pay',     label: 'Pay' },
];

export default function PortalsBrowseScreen({ onOpenPortal }: Props) {
  const [query, setQuery] = useState('');
  const [selectedVerbs, setSelectedVerbs] = useState<string[]>([]);
  const [results, setResults] = useState<PortalSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqIdRef = useRef(0);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { void runSearch(); }, 250);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, selectedVerbs]);

  async function runSearch() {
    const id = ++reqIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const res = await searchPortals({
        text: query.trim() || undefined,
        verbs: selectedVerbs.length ? selectedVerbs : undefined,
        limit: 50,
      });
      if (id !== reqIdRef.current) return;
      setResults(res.results ?? []);
    } catch (err) {
      if (id !== reqIdRef.current) return;
      setError(err instanceof Error ? err.message : 'Search failed');
      setResults([]);
    } finally {
      if (id === reqIdRef.current) setLoading(false);
    }
  }

  function toggleVerb(v: string) {
    setSelectedVerbs((prev) => prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v]);
  }

  return (
    <section className="flex flex-col">
      <div className="px-5 pt-6 pb-3">
        <h1 className="text-2xl font-semibold text-[var(--color-text)]">Portals</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Browse and visit ANTON portals.
        </p>
      </div>

      <div className="px-5 pb-3">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, tag or area"
          className="w-full px-4 py-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-base text-[var(--color-text)] placeholder-[var(--color-text-faint)] focus:outline-none focus:ring-2"
          style={{ outlineColor: 'var(--color-accent)' }}
        />
      </div>

      <div className="px-5 pb-3 flex gap-2 overflow-x-auto">
        {POPULAR_VERBS.map((v) => {
          const active = selectedVerbs.includes(v.value);
          return (
            <button
              key={v.value}
              onClick={() => toggleVerb(v.value)}
              className="flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium border"
              style={{
                backgroundColor: active ? 'var(--color-accent)' : 'var(--color-surface)',
                color: active ? 'var(--color-accent-fg)' : 'var(--color-text)',
                borderColor: active ? 'var(--color-accent)' : 'var(--color-border)',
              }}
            >
              {v.label}
            </button>
          );
        })}
      </div>

      {error && (
        <div className="mx-5 mb-3 rounded-xl bg-[var(--color-red-dim)] px-4 py-3 text-sm text-[var(--color-red)]">
          {error}
        </div>
      )}

      {loading && results.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-[var(--color-text-faint)]">Searching…</div>
      ) : results.length === 0 ? (
        <div className="px-5 mt-2">
          <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-alt)] p-6 text-center">
            <p className="text-sm text-[var(--color-text-body)]">No portals found.</p>
            <p className="mt-1 text-xs text-[var(--color-text-faint)]">
              Try a different search term or clear the filter chips.
            </p>
          </div>
        </div>
      ) : (
        <ul className="divide-y divide-[var(--color-border-soft)]">
          {results.map((p) => <PortalRow key={p.portalAddress} portal={p} onClick={() => onOpenPortal(p.portalAddress)} />)}
        </ul>
      )}
    </section>
  );
}

function PortalRow({ portal, onClick }: { portal: PortalSearchResult; onClick: () => void }) {
  return (
    <li>
      <button onClick={onClick}
              className="w-full flex items-start gap-3 px-5 py-3 text-left active:bg-[var(--color-surface-muted)]">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center text-lg font-semibold flex-shrink-0"
          style={{ backgroundColor: 'var(--color-accent-dim)', color: 'var(--color-accent-dark)' }}
        >
          {portal.displayTitle.slice(0, 1).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-base font-medium text-[var(--color-text)] truncate">{portal.displayTitle}</div>
          {portal.description && (
            <div className="text-xs text-[var(--color-text-muted)] line-clamp-2">{portal.description}</div>
          )}
          {(portal.capabilityVerbs && portal.capabilityVerbs.length > 0) && (
            <div className="mt-1 flex flex-wrap gap-1">
              {portal.capabilityVerbs.slice(0, 4).map((v) => (
                <span key={v}
                      className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded"
                      style={{ backgroundColor: 'var(--color-surface-muted)', color: 'var(--color-text-muted)' }}>
                  {v}
                </span>
              ))}
            </div>
          )}
        </div>
      </button>
    </li>
  );
}
