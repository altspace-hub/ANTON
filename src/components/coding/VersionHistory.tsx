import { useState, useEffect, useCallback } from 'react';
import { ChevronDown, ChevronRight, GitCompare, Clock, FileText, Loader2 } from 'lucide-react';

interface VersionEntry {
  version: number;
  label?: string;
  created_at: string;
  content_length?: number;
}

interface DiffResult {
  summary: string;
  added_lines: number;
  removed_lines: number;
}

interface VersionHistoryProps {
  entityType: string;
  entityId: string;
  className?: string;
}

function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem('openexpert-token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

export default function VersionHistory({ entityType, entityId, className = '' }: VersionHistoryProps) {
  const [versions, setVersions] = useState<VersionEntry[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diffResult, setDiffResult] = useState<DiffResult | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffPair, setDiffPair] = useState<[number, number] | null>(null);

  // Fetch versions on mount
  useEffect(() => {
    if (!entityType || !entityId) return;
    setLoading(true);
    setError(null);

    fetch(`/api/coding/versions/${entityType}/${entityId}`, {
      headers: { ...getAuthHeader() },
    })
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load versions');
        return r.json();
      })
      .then((data: VersionEntry[]) => {
        setVersions(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load versions');
      })
      .finally(() => setLoading(false));
  }, [entityType, entityId]);

  // Compare two adjacent versions
  const handleCompare = useCallback(
    async (versionA: number, versionB: number) => {
      if (diffLoading) return;
      // Toggle off if comparing the same pair
      if (diffPair && diffPair[0] === versionA && diffPair[1] === versionB) {
        setDiffResult(null);
        setDiffPair(null);
        return;
      }

      setDiffLoading(true);
      setDiffResult(null);
      setDiffPair([versionA, versionB]);

      try {
        const res = await fetch(
          `/api/coding/versions/${entityType}/${entityId}/diff`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...getAuthHeader(),
            },
            body: JSON.stringify({
              version_a: versionA,
              version_b: versionB,
            }),
          }
        );

        if (!res.ok) throw new Error('Failed to compute diff');
        const data = await res.json();
        setDiffResult(data as DiffResult);
      } catch {
        setDiffResult({
          summary: 'Unable to compute diff between these versions.',
          added_lines: 0,
          removed_lines: 0,
        });
      } finally {
        setDiffLoading(false);
      }
    },
    [entityType, entityId, diffLoading, diffPair]
  );

  // Don't render if no versions and no error
  if (!loading && !error && versions.length === 0) return null;

  return (
    <div className={`rounded-lg border border-border bg-adv-card ${className}`}>
      {/* Header — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-adv-dark-2"
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-adv-gray" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-adv-gray" />
        )}
        <Clock className="h-3.5 w-3.5 text-adv-teal" />
        <span className="text-xs font-semibold uppercase tracking-wider text-adv-gray">
          Version History
        </span>
        {versions.length > 0 && (
          <span className="ml-1 rounded-full bg-adv-dark px-1.5 text-xs text-adv-gray">
            {versions.length} version{versions.length !== 1 ? 's' : ''}
          </span>
        )}
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-border px-4 pb-4">
          {loading && (
            <div className="flex items-center gap-2 py-3 text-xs text-adv-gray">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading versions...
            </div>
          )}

          {error && (
            <div className="py-3 text-xs text-adv-red">{error}</div>
          )}

          {!loading && !error && versions.length === 0 && (
            <p className="py-3 text-xs text-adv-gray">No versions recorded yet.</p>
          )}

          {!loading && versions.length > 0 && (
            <div className="mt-3 space-y-0">
              {versions.map((ver, idx) => {
                const nextVer = idx < versions.length - 1 ? versions[idx + 1] : null;
                const isComparing =
                  diffPair !== null &&
                  diffPair[0] === ver.version &&
                  nextVer &&
                  diffPair[1] === nextVer.version;

                return (
                  <div key={ver.version}>
                    {/* Version row */}
                    <div className="flex items-center gap-3 py-2">
                      {/* Version indicator line */}
                      <div className="flex flex-col items-center">
                        <div className={`h-2.5 w-2.5 rounded-full ${
                          idx === 0 ? 'bg-adv-teal' : 'bg-adv-gray-med'
                        }`} />
                        {idx < versions.length - 1 && (
                          <div className="h-4 w-px bg-border" />
                        )}
                      </div>

                      {/* Version details */}
                      <div className="flex flex-1 items-center gap-2 min-w-0">
                        <span className={`text-xs font-medium ${
                          idx === 0 ? 'text-adv-teal' : 'text-adv-off-white'
                        }`}>
                          v{ver.version}
                        </span>
                        {ver.label && (
                          <span className="truncate text-xs text-adv-gray">{ver.label}</span>
                        )}
                      </div>

                      {/* Metadata */}
                      <div className="flex items-center gap-3 shrink-0">
                        {ver.content_length !== undefined && (
                          <span className="flex items-center gap-1 text-xs text-adv-gray">
                            <FileText className="h-2.5 w-2.5" />
                            {ver.content_length.toLocaleString()} chars
                          </span>
                        )}
                        <span className="text-xs text-adv-gray">
                          {formatDate(ver.created_at)}
                        </span>
                      </div>

                      {/* Compare button (between adjacent versions) */}
                      {nextVer && (
                        <button
                          onClick={() => handleCompare(ver.version, nextVer.version)}
                          disabled={diffLoading}
                          className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors disabled:opacity-50 ${
                            isComparing
                              ? 'border-adv-teal/30 bg-adv-teal-dim text-adv-teal'
                              : 'border-border bg-adv-dark text-adv-gray hover:border-adv-teal hover:text-adv-teal'
                          }`}
                          title={`Compare v${ver.version} with v${nextVer.version}`}
                        >
                          <GitCompare className="h-2.5 w-2.5" />
                          Compare
                        </button>
                      )}
                    </div>

                    {/* Diff display */}
                    {isComparing && (
                      <div className="ml-5 mb-2 rounded-lg border border-border bg-adv-dark p-3">
                        {diffLoading ? (
                          <div className="flex items-center gap-2 text-xs text-adv-gray">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Computing diff...
                          </div>
                        ) : diffResult ? (
                          <div className="space-y-2">
                            {/* Line count summary */}
                            <div className="flex items-center gap-3 text-[11px]">
                              <span className="text-adv-green">
                                +{diffResult.added_lines} added
                              </span>
                              <span className="text-adv-red">
                                -{diffResult.removed_lines} removed
                              </span>
                            </div>

                            {/* Semantic summary */}
                            {diffResult.summary && (
                              <div className="text-xs text-adv-off-white font-mono leading-relaxed whitespace-pre-wrap">
                                {diffResult.summary}
                              </div>
                            )}
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
