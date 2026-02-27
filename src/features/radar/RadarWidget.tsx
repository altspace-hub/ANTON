import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Radio, ArrowRight } from 'lucide-react';

interface RadarSummary {
  newItems: number;
  highRelevance: number;
  consultationsOpen: number;
  recentHighRelevance: Array<{
    title: string;
    relevance_score: number;
    item_type: string;
    published_at: string | null;
    source_name: string;
  }>;
}

function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem('openexpert-token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return 'recently';
  const date = new Date(dateStr);
  const diffMins = Math.floor((Date.now() - date.getTime()) / 60000);
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export default function RadarWidget() {
  const [summary, setSummary] = useState<RadarSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/radar/summary', { headers: getAuthHeader() })
      .then((r) => r.json() as Promise<RadarSummary>)
      .then(setSummary)
      .catch(() => setSummary(null))
      .finally(() => setLoading(false));
  }, []);

  // Hide if no items exist (graceful empty state)
  if (!loading && (!summary || !summary.recentHighRelevance || summary.recentHighRelevance.length === 0)) {
    return null;
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-adv-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <Radio className="h-5 w-5 text-adv-teal" />
          <h2 className="text-sm font-semibold text-adv-white">Horizon Radar</h2>
        </div>
        <p className="text-xs text-adv-gray-med">Loading...</p>
      </div>
    );
  }

  const highRelevanceCount = summary?.highRelevance ?? 0;

  return (
    <div className="rounded-xl border border-border bg-adv-card p-6">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Radio className="h-5 w-5 text-adv-teal" />
          <h2 className="text-sm font-semibold text-adv-white">Horizon Radar</h2>
          {highRelevanceCount > 0 && (
            <span className="rounded-full bg-adv-red/20 px-2 py-0.5 text-[10px] font-semibold text-adv-red">
              {highRelevanceCount} High
            </span>
          )}
        </div>
        <Link
          to="/radar"
          className="flex items-center gap-1 text-xs text-adv-teal hover:underline"
        >
          View All <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {/* Recent High Relevance Items */}
      {summary && summary.recentHighRelevance && summary.recentHighRelevance.length > 0 ? (
        <div className="space-y-3">
          {summary.recentHighRelevance.slice(0, 3).map((item, idx) => (
            <div
              key={idx}
              className="border-l-2 border-adv-teal pl-3 transition-colors hover:border-adv-teal-dark"
            >
              <p className="mb-0.5 line-clamp-2 text-sm font-medium text-adv-off-white">
                {item.title}
              </p>
              <p className="text-xs text-adv-gray-med">
                {item.source_name} · {formatRelativeTime(item.published_at)} · Relevance: {Math.round(item.relevance_score * 100)}%
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-adv-gray-med">No high-relevance items yet.</p>
      )}
    </div>
  );
}
