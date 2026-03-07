import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Clock, CheckSquare, Square, GitCompare, Trash2, FileText, ArrowLeft, Brain, Loader2 } from 'lucide-react';
import VersionDiffViewer from '../features/versions/VersionDiffViewer';

// ── Types ─────────────────────────────────────────────────────────────────────

interface VersionSummary {
  id: number;
  version_number: number;
  label: string | null;
  created_at: string;
  content_length: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem('openexpert-token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Main Page Component ───────────────────────────────────────────────────────

export default function VersionHistoryPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // Read entityType and entityId from query params
  const entityType = searchParams.get('entityType') ?? 'session';
  const entityId = searchParams.get('entityId') ?? '';

  const [versions, setVersions] = useState<VersionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Selected versions for comparison (max 2)
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // Diff viewer state
  const [showDiff, setShowDiff] = useState(false);
  const [diffOldId, setDiffOldId] = useState<number | null>(null);
  const [diffNewId, setDiffNewId] = useState<number | null>(null);

  // AI Changelog
  const [changelog, setChangelog] = useState<{ summary: string; changes: { type: string; description: string }[]; significance: string; recommendation: string } | null>(null);
  const [changelogLoading, setChangelogLoading] = useState(false);

  useEffect(() => {
    if (!entityId) {
      setError('No entity ID provided');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    fetch(`/api/versions/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`, {
      headers: { ...getAuthHeader() },
    })
      .then((r) => {
        if (!r.ok) return r.json().then((e: { error: string }) => { throw new Error(e.error); });
        return r.json();
      })
      .then((data: VersionSummary[]) => {
        setVersions(data);
        setLoading(false);
      })
      .catch((e: Error) => {
        setError(e.message || 'Failed to load versions');
        setLoading(false);
      });
  }, [entityType, entityId]);

  function toggleSelect(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < 2) {
        next.add(id);
      }
      return next;
    });
  }

  function handleCompare() {
    const ids = Array.from(selected);
    if (ids.length !== 2) return;

    const v1 = versions.find((v) => v.id === ids[0]);
    const v2 = versions.find((v) => v.id === ids[1]);
    if (!v1 || !v2) return;

    const [oldId, newId] = v1.version_number < v2.version_number ? [v1.id, v2.id] : [v2.id, v1.id];
    setDiffOldId(oldId);
    setDiffNewId(newId);
    setShowDiff(true);
    setChangelog(null);
  }

  async function generateChangelog() {
    if (!diffOldId || !diffNewId) return;
    setChangelogLoading(true);
    try {
      const [oldRes, newRes] = await Promise.all([
        fetch(`/api/versions/${diffOldId}/content`, { headers: getAuthHeader() }),
        fetch(`/api/versions/${diffNewId}/content`, { headers: getAuthHeader() }),
      ]);
      if (!oldRes.ok || !newRes.ok) return;
      const { content: oldContent } = await oldRes.json() as { content: string };
      const { content: newContent } = await newRes.json() as { content: string };
      const r = await fetch('/api/ai-assist/version-changelog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ oldContent, newContent, entityType }),
      });
      if (r.ok) setChangelog(await r.json());
    } catch { /* ignore */ } finally { setChangelogLoading(false); }
  }

  function handleDelete(id: number) {
    if (!confirm('Delete this version? This action cannot be undone.')) return;
    fetch(`/api/versions/${id}`, {
      method: 'DELETE',
      headers: { ...getAuthHeader() },
    })
      .then((r) => {
        if (!r.ok) throw new Error('Failed to delete');
        setVersions((prev) => prev.filter((v) => v.id !== id));
        setSelected((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      })
      .catch((e: Error) => {
        alert(e.message || 'Failed to delete version');
      });
  }

  return (
    <div className="min-h-screen bg-adv-dark p-6">
      {/* Header */}
      <div className="max-w-5xl mx-auto mb-6">
        <button
          onClick={() => navigate(-1)}
          className="mb-4 flex items-center gap-2 text-adv-gray hover:text-adv-white transition-colors text-sm"
        >
          <ArrowLeft size={16} />
          Back
        </button>
        <div className="flex items-center gap-3 mb-2">
          <Clock size={24} className="text-adv-teal" />
          <h1 className="text-2xl font-bold text-adv-white">Version History</h1>
        </div>
        <p className="text-adv-gray text-sm">
          Viewing all saved versions for {entityType}: {entityId}
        </p>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="max-w-5xl mx-auto text-center py-12">
          <p className="text-adv-gray">Loading versions…</p>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="max-w-5xl mx-auto">
          <div className="bg-adv-card border border-adv-red/40 rounded-lg p-6 text-center">
            <p className="text-adv-red font-medium mb-1">Failed to load version history</p>
            <p className="text-adv-gray text-sm">{error}</p>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && versions.length === 0 && (
        <div className="max-w-5xl mx-auto text-center py-12">
          <FileText size={48} className="text-adv-gray mx-auto mb-3" />
          <p className="text-adv-gray">No versions saved yet</p>
        </div>
      )}

      {/* Version list */}
      {!loading && !error && versions.length > 0 && (
        <div className="max-w-5xl mx-auto">
          <div className="grid gap-3">
            {versions.map((version) => {
              const isChecked = selected.has(version.id);
              const canCheck = selected.size < 2 || isChecked;

              return (
                <div
                  key={version.id}
                  className={`bg-adv-card border rounded-lg p-4 transition-all ${
                    isChecked
                      ? 'border-adv-teal ring-1 ring-adv-teal/30'
                      : 'border-[#1e2d45] hover:border-adv-teal/50'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* Checkbox */}
                    <button
                      onClick={() => toggleSelect(version.id)}
                      disabled={!canCheck}
                      className={`shrink-0 mt-0.5 transition-opacity ${
                        canCheck ? 'opacity-100' : 'opacity-30 cursor-not-allowed'
                      }`}
                      aria-label={`Select version ${version.version_number}`}
                    >
                      {isChecked ? (
                        <CheckSquare size={20} className="text-adv-teal" />
                      ) : (
                        <Square size={20} className="text-adv-gray" />
                      )}
                    </button>

                    {/* Version info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-adv-white font-semibold">
                          {version.label ?? `Version ${version.version_number}`}
                        </span>
                        <span className="text-xs text-adv-gray">
                          v{version.version_number}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-adv-gray flex-wrap">
                        <span>{formatDate(version.created_at)}</span>
                        <span>{formatBytes(version.content_length)}</span>
                      </div>
                    </div>

                    {/* Actions */}
                    <button
                      onClick={() => handleDelete(version.id)}
                      className="shrink-0 p-1.5 rounded text-adv-gray hover:text-adv-red hover:bg-adv-red/10 transition-colors"
                      aria-label="Delete version"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Compare bar (sticky bottom) */}
      {selected.size === 2 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-10 animate-in slide-in-from-bottom-4 duration-200">
          <button
            onClick={handleCompare}
            className="flex items-center gap-2 px-6 py-3 rounded-full bg-adv-teal text-adv-dark font-semibold shadow-xl hover:bg-adv-teal-dark transition-all hover:scale-105"
          >
            <GitCompare size={18} />
            Compare Selected Versions
          </button>
        </div>
      )}

      {/* AI Changelog (shown below diff viewer) */}
      {showDiff && diffOldId !== null && diffNewId !== null && (
        <div className="mt-4 rounded-xl border border-adv-teal/20 bg-adv-card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Brain className="h-4 w-4 text-adv-teal" />
              <span className="text-sm font-semibold text-adv-off-white">AI Changelog</span>
            </div>
            <button
              onClick={generateChangelog}
              disabled={changelogLoading}
              className="flex items-center gap-1.5 rounded border border-adv-teal/40 bg-adv-teal/10 px-3 py-1 text-xs text-adv-teal hover:bg-adv-teal/20 disabled:opacity-40 transition-colors"
            >
              {changelogLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Brain className="h-3.5 w-3.5" />}
              {changelogLoading ? 'Generating…' : 'Generate Changelog'}
            </button>
          </div>
          {!changelog && !changelogLoading && (
            <p className="text-sm text-adv-gray">Click "Generate Changelog" to get a plain-English summary of what changed between these versions.</p>
          )}
          {changelog && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-adv-off-white">{changelog.summary}</p>
              <div className="flex items-center gap-2">
                <span className="text-xs text-adv-gray">Significance:</span>
                <span className={`text-xs font-medium capitalize ${changelog.significance === 'major' ? 'text-adv-red' : changelog.significance === 'moderate' ? 'text-adv-gold' : 'text-adv-green'}`}>{changelog.significance}</span>
              </div>
              {changelog.changes.length > 0 && (
                <ul className="space-y-1">
                  {changelog.changes.map((c, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-adv-off-white">
                      <span className={`shrink-0 mt-0.5 capitalize font-medium ${c.type === 'added' ? 'text-adv-green' : c.type === 'removed' ? 'text-adv-red' : 'text-adv-gold'}`}>{c.type}:</span>
                      {c.description}
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-adv-gray italic">{changelog.recommendation}</p>
            </div>
          )}
        </div>
      )}

      {/* Diff viewer modal */}
      {showDiff && diffOldId !== null && diffNewId !== null && (
        <VersionDiffViewer
          oldVersionId={diffOldId}
          newVersionId={diffNewId}
          onClose={() => {
            setShowDiff(false);
            setSelected(new Set());
            setChangelog(null);
          }}
        />
      )}
    </div>
  );
}
