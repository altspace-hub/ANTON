import { useState } from 'react';
import { ExternalLink, Globe, Shield, Target, Users, Database, BookOpen, Brain } from 'lucide-react';
import type { PathfinderWebSource, SourceType } from '@/lib/pathfinder-api';

interface WebSourcesListProps {
  sources: PathfinderWebSource[];
  maxShow?: number;
  filter?: SourceType | 'all';
}

/** Quality dot: green (>0.7), amber (>0.4), red */
function QualityDot({ score, label, icon: Icon }: { score: number; label: string; icon: typeof Shield }) {
  const color = score > 0.7 ? 'bg-adv-green' : score > 0.4 ? 'bg-adv-gold' : 'bg-adv-red/60';
  return (
    <span className="flex items-center gap-0.5" title={`${label}: ${(score * 100).toFixed(0)}%`}>
      <Icon className="h-2.5 w-2.5 text-adv-gray" />
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${color}`} />
    </span>
  );
}

const SOURCE_TYPE_BADGES: Record<SourceType, { label: string; icon: typeof Globe; color: string }> = {
  web: { label: 'Web', icon: Globe, color: 'text-adv-blue' },
  local: { label: 'Local', icon: Database, color: 'text-adv-teal' },
  knowledge_pack: { label: 'Knowledge', icon: BookOpen, color: 'text-adv-gold' },
  institutional_memory: { label: 'Memory', icon: Brain, color: 'text-purple-400' },
};

export default function WebSourcesList({ sources, maxShow = 10, filter = 'all' }: WebSourcesListProps) {
  if (!sources.length) return null;

  // Deduplicate by URL
  const seen = new Set<string>();
  let unique = sources.filter(s => {
    if (seen.has(s.url)) return false;
    seen.add(s.url);
    return true;
  });

  // Apply filter
  if (filter !== 'all') {
    unique = unique.filter(s => (s.sourceType || 'web') === filter);
  }

  const shown = unique.slice(0, maxShow);

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 text-xs font-medium text-adv-gray mb-1">
        <Globe className="h-3 w-3" />
        Sources ({unique.length})
      </div>
      {shown.map((s, i) => {
        const sourceType = s.sourceType || 'web';
        const badge = SOURCE_TYPE_BADGES[sourceType];
        const BadgeIcon = badge?.icon || Globe;
        const isLocal = sourceType !== 'web';

        return (
          <div
            key={`${s.url}-${i}`}
            className="flex items-start gap-2 rounded-lg px-2 py-1.5 text-xs transition hover:bg-adv-card/80 group"
          >
            {/* Source type icon */}
            <BadgeIcon className={`h-3 w-3 shrink-0 mt-0.5 ${badge?.color || 'text-adv-teal'} opacity-60 group-hover:opacity-100`} />

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                {isLocal ? (
                  <span className="truncate font-medium text-adv-off-white">{s.title || 'Local source'}</span>
                ) : (
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="truncate font-medium text-adv-off-white hover:text-adv-teal transition-colors"
                  >
                    {s.title || s.url}
                    <ExternalLink className="inline-block h-2.5 w-2.5 ml-1 opacity-50" />
                  </a>
                )}

                {/* Source type badge */}
                <span className={`shrink-0 rounded px-1 py-0.5 text-[9px] font-medium ${badge?.color || 'text-adv-gray'} bg-adv-dark/50`}>
                  {badge?.label || 'Web'}
                </span>
              </div>

              {s.snippet && (
                <div className="mt-0.5 line-clamp-2 text-[11px] text-adv-gray">{s.snippet}</div>
              )}

              <div className="mt-0.5 flex items-center gap-3 min-w-0">
                {!isLocal && <span className="truncate text-[10px] text-adv-teal/60 min-w-0">{s.url}</span>}

                {/* Quality indicator dots */}
                {(s.qualityScore !== undefined || s.relevanceScore !== undefined || s.consensusScore !== undefined) && (
                  <span className="flex items-center gap-2 shrink-0">
                    {s.qualityScore !== undefined && <QualityDot score={s.qualityScore} label="Quality" icon={Shield} />}
                    {s.relevanceScore !== undefined && <QualityDot score={s.relevanceScore} label="Relevance" icon={Target} />}
                    {s.consensusScore !== undefined && s.consensusScore > 0 && <QualityDot score={s.consensusScore} label="Consensus" icon={Users} />}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
      {unique.length > maxShow && (
        <div className="px-2 text-[10px] text-adv-gray">
          +{unique.length - maxShow} more sources
        </div>
      )}
    </div>
  );
}
