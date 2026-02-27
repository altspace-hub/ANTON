import React, { useEffect, useState } from 'react';
import { Paperclip, ChevronRight, Loader2 } from 'lucide-react';

interface SessionSummary {
  id: string;
  title: string;
  module_id: string;
  updated_at: string;
}

interface ProjectContextBannerProps {
  projectId?: string;
  projectName?: string;
  onUseContext?: () => void;
}

export function ProjectContextBanner({
  projectId,
  projectName,
  onUseContext,
}: ProjectContextBannerProps) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) {
      setSessions([]);
      return;
    }

    setLoading(true);
    setError(null);

    fetch(`/api/sessions?projectId=${encodeURIComponent(projectId)}&limit=10`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch sessions');
        return res.json();
      })
      .then((data: SessionSummary[]) => {
        setSessions(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        console.warn('[ProjectContextBanner] fetch error:', err);
        setError('Could not load project sessions.');
      })
      .finally(() => setLoading(false));
  }, [projectId]);

  // Do not render if no project is set
  if (!projectId) return null;

  const outputCount = sessions.length;

  return (
    <div className="flex items-center gap-3 px-4 py-2 rounded-lg bg-adv-teal-soft border border-adv-teal/30 text-sm">
      {/* Icon */}
      <Paperclip className="w-4 h-4 text-adv-teal flex-shrink-0" />

      {/* Main label */}
      <span className="text-adv-off-white font-medium truncate">
        Project Context:{' '}
        <span className="text-adv-teal">{projectName || projectId}</span>
      </span>

      {/* Session / output count */}
      <span className="text-adv-gray whitespace-nowrap">
        {loading ? (
          <Loader2 className="inline w-3 h-3 animate-spin" />
        ) : error ? (
          <span className="text-adv-gold text-xs">{error}</span>
        ) : (
          <>
            Previous outputs:{' '}
            <span className="text-adv-off-white font-medium">{outputCount}</span>
          </>
        )}
      </span>

      {/* Action button */}
      {onUseContext && outputCount > 0 && !loading && !error && (
        <button
          onClick={onUseContext}
          className="ml-auto flex items-center gap-1 px-3 py-1 rounded bg-adv-teal/20 hover:bg-adv-teal/30 text-adv-teal text-xs font-medium transition-colors whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-adv-teal/50"
          aria-label="Use previous outputs as context"
        >
          Use previous outputs as context
          <ChevronRight className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

export default ProjectContextBanner;
